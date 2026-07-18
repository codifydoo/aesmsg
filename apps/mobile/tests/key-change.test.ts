import {
  exportPublicKey,
  type Fingerprint,
  fingerprint,
  generateIdentity,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Mock the native modules @/src/storage pulls in at module load time (the re-key flow tests below
// exercise the real encrypted contacts store). Pattern mirrors contacts-store.test.ts: in-memory
// Maps stand in for the hardware keychain (expo-secure-store) and on-disk file store
// (expo-file-system/legacy). The global setup (tests/setup.ts) resets the contacts blob per test.
const { kv, files } = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  files: new Map<string, string>(),
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    kv.set(k, v);
  }),
  getItemAsync: vi.fn(async (k: string) => (kv.has(k) ? kv.get(k) : null)),
  deleteItemAsync: vi.fn(async (k: string) => {
    kv.delete(k);
  }),
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: files.has(uri) || uri.endsWith("aesmsg/"),
  })),
  makeDirectoryAsync: vi.fn(async () => {}),
  readAsStringAsync: vi.fn(async (uri: string) => {
    if (!files.has(uri)) throw new Error("ENOENT");
    return files.get(uri) as string;
  }),
  writeAsStringAsync: vi.fn(async (uri: string, contents: string) => {
    files.set(uri, contents);
  }),
  deleteAsync: vi.fn(async (uri: string) => {
    files.delete(uri);
  }),
  readDirectoryAsync: vi.fn(async () => []),
}));

import { shortFingerprint } from "@/src/contacts/contacts-display";
import {
  addContact,
  getContact,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";
import { classifyKeyChange, detectKeyChange, keyChangeAlertView } from "@/src/contacts/key-change";

let pkA: PublicKeyString;
let fpA: Fingerprint;
let pkB: PublicKeyString;
let fpB: Fingerprint;
let pkC: PublicKeyString;
let fpC: Fingerprint;

beforeAll(async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const c = await generateIdentity();
  pkA = exportPublicKey(a);
  fpA = await fingerprint(pkA);
  pkB = exportPublicKey(b);
  fpB = await fingerprint(pkB);
  pkC = exportPublicKey(c);
  fpC = await fingerprint(pkC);
});

describe("classifyKeyChange (pure detection)", () => {
  it("reports 'same' when the candidate equals the current key", () => {
    const d = classifyKeyChange({ fingerprint: fpA, previousFingerprints: [] }, fpA);
    expect(d).toEqual({ kind: "same" });
  });

  it("reports 'changed' with the real previous + new fingerprints for a genuinely new key", () => {
    const d = classifyKeyChange({ fingerprint: fpA, previousFingerprints: [] }, fpB);
    expect(d).toEqual({ kind: "changed", previousFingerprint: fpA, newFingerprint: fpB });
  });

  it("reports 'rotated-back' when the candidate is a key this contact already abandoned", () => {
    // Contact currently on fpB, previously rotated away from fpA; re-scanning fpA is a reversion.
    const d = classifyKeyChange({ fingerprint: fpB, previousFingerprints: [fpA] }, fpA);
    expect(d).toEqual({ kind: "rotated-back" });
  });

  it("prefers 'same' over 'rotated-back' when the candidate is the current key", () => {
    const d = classifyKeyChange({ fingerprint: fpB, previousFingerprints: [fpA] }, fpB);
    expect(d).toEqual({ kind: "same" });
  });
});

describe("detectKeyChange (derives the candidate fingerprint, then classifies)", () => {
  it("classifies a new public key as 'changed' with the derived fingerprint", async () => {
    const d = await detectKeyChange({ fingerprint: fpA, previousFingerprints: [] }, pkC);
    expect(d).toEqual({ kind: "changed", previousFingerprint: fpA, newFingerprint: fpC });
  });

  it("classifies the same public key as 'same'", async () => {
    const d = await detectKeyChange({ fingerprint: fpA, previousFingerprints: [] }, pkA);
    expect(d).toEqual({ kind: "same" });
  });
});

describe("keyChangeAlertView (real fingerprints for the alert screen)", () => {
  it("returns the contact name + the short display of the REAL previous and new fingerprints", () => {
    const view = keyChangeAlertView("Elena Rodriguez", fpA, fpB);
    expect(view).toEqual({
      contactName: "Elena Rodriguez",
      previousFingerprint: shortFingerprint(fpA),
      newFingerprint: shortFingerprint(fpB),
    });
    // Never a fabricated sample — both cells trace back to the actual keys.
    expect(view.previousFingerprint).not.toBe(view.newFingerprint);
  });
});

describe("re-key flow against the real contacts store", () => {
  it("CONFIRM (updateContactKey) adopts the new key AND resets the contact to unverified", async () => {
    const c = await addContact({ label: "Elena", publicKey: pkA });
    await setContactVerified(c.id, true);

    // A re-scan surfaces a genuinely new key…
    const detection = await detectKeyChange(c, pkB);
    expect(detection.kind).toBe("changed");

    // …and confirming commits it, resetting verification (the security-critical bit).
    const updated = await updateContactKey(c.id, pkB);
    expect(updated.publicKey).toBe(pkB);
    expect(updated.fingerprint).toBe(fpB);
    expect(updated.verified).toBe(false);
    expect(updated.previousFingerprints).toEqual([fpA]);
  });

  it("DECLINE (no updateContactKey call) leaves the stored key and verified state untouched", async () => {
    const c = await addContact({ label: "Elena", publicKey: pkA });
    await setContactVerified(c.id, true);

    const detection = await detectKeyChange(c, pkB);
    expect(detection.kind).toBe("changed");

    // Declining is simply NOT calling updateContactKey — the record is unchanged.
    const after = await getContact(c.id);
    expect(after?.publicKey).toBe(pkA);
    expect(after?.fingerprint).toBe(fpA);
    expect(after?.verified).toBe(true);
    expect(after?.previousFingerprints).toEqual([]);
  });
});
