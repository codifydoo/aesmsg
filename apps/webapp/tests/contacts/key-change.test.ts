import { exportPublicKey, type Fingerprint, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { shortFingerprint } from "@/src/contacts/contacts-display";
import { classifyKeyChange, detectKeyChange, keyChangeAlertView } from "@/src/contacts/key-change";

describe("classifyKeyChange", () => {
  const current = "AM-1111-2222-3333-4444-5555-6666-7777-8888" as Fingerprint;
  const rotatedAway = "AM-9999-0000-1111-2222-3333-4444-5555-6666" as Fingerprint;
  const brandNew = "AM-abab-cdcd-efef-0101-2323-4545-6767-8989" as Fingerprint;
  const existing = { fingerprint: current, previousFingerprints: [rotatedAway] };

  it("candidate === current → same", () => {
    expect(classifyKeyChange(existing, current)).toEqual({ kind: "same" });
  });

  it("candidate ∈ history → rotated-back", () => {
    expect(classifyKeyChange(existing, rotatedAway)).toEqual({ kind: "rotated-back" });
  });

  it("genuinely new → changed carrying the REAL current fp as previous + candidate as new", () => {
    expect(classifyKeyChange(existing, brandNew)).toEqual({
      kind: "changed",
      previousFingerprint: current,
      newFingerprint: brandNew,
    });
  });
});

describe("detectKeyChange (real keys)", () => {
  it("classifies a genuinely different key as changed with real fingerprints", async () => {
    const k1 = exportPublicKey(await generateIdentity());
    const k2 = exportPublicKey(await generateIdentity());
    const fp1 = await fingerprint(k1);
    const fp2 = await fingerprint(k2);

    const detection = await detectKeyChange({ fingerprint: fp1, previousFingerprints: [] }, k2);
    expect(detection).toEqual({
      kind: "changed",
      previousFingerprint: fp1,
      newFingerprint: fp2,
    });

    const same = await detectKeyChange({ fingerprint: fp1, previousFingerprints: [] }, k1);
    expect(same).toEqual({ kind: "same" });
  });
});

describe("keyChangeAlertView", () => {
  it("truncates both fingerprints to the short form", async () => {
    const prev = await fingerprint(exportPublicKey(await generateIdentity()));
    const next = await fingerprint(exportPublicKey(await generateIdentity()));
    const view = keyChangeAlertView("Alice", prev, next);
    expect(view.contactName).toBe("Alice");
    expect(view.previousFingerprint).toBe(shortFingerprint(prev));
    expect(view.newFingerprint).toBe(shortFingerprint(next));
  });
});
