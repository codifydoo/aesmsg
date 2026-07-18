import {
  exportPublicKey,
  type Fingerprint,
  fingerprint,
  generateIdentity,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Mock the native modules that @/src/storage pulls in at module load time.
// Pattern mirrors storage-index.test.ts: in-memory Maps stand in for the
// hardware keychain (expo-secure-store) and on-disk file store (expo-file-system/legacy).
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

import {
  addContact,
  ContactsStoreError,
  DuplicateFingerprintError,
  deleteContact,
  getContact,
  InvalidLabelError,
  listContacts,
  NotFoundError,
  RotatedAwayError,
  renameContact,
  SameKeyError,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";

let pkA: PublicKeyString;
let fpA: Fingerprint;
let pkB: PublicKeyString;
let fpB: Fingerprint;
let pkC: PublicKeyString;

beforeAll(async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const c = await generateIdentity();
  pkA = exportPublicKey(a);
  fpA = await fingerprint(pkA);
  pkB = exportPublicKey(b);
  fpB = await fingerprint(pkB);
  pkC = exportPublicKey(c);
});

describe("contacts-store (mobile)", () => {
  describe("addContact", () => {
    it("creates a record with verified=false, no previousFingerprints, schemaVersion=1", async () => {
      const c = await addContact({ label: "Alice", publicKey: pkA });
      expect(c.label).toBe("Alice");
      expect(c.publicKey).toBe(pkA);
      expect(c.fingerprint).toBe(fpA);
      expect(c.verified).toBe(false);
      expect(c.previousFingerprints).toEqual([]);
      expect(c.schemaVersion).toBe(1);
      expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof c.createdAt).toBe("string");
      expect(c.createdAt).toBe(c.updatedAt);
    });

    it("trims label whitespace", async () => {
      const c = await addContact({ label: "  Alice  ", publicKey: pkA });
      expect(c.label).toBe("Alice");
    });

    it("throws InvalidLabelError on empty label", async () => {
      await expect(addContact({ label: "   ", publicKey: pkA })).rejects.toBeInstanceOf(
        InvalidLabelError,
      );
    });

    it("throws InvalidLabelError on label > 80 chars", async () => {
      await expect(addContact({ label: "x".repeat(81), publicKey: pkA })).rejects.toBeInstanceOf(
        InvalidLabelError,
      );
    });

    it("accepts label of exactly 80 chars", async () => {
      const c = await addContact({ label: "x".repeat(80), publicKey: pkA });
      expect(c.label.length).toBe(80);
    });

    it("throws DuplicateFingerprintError on same current fingerprint", async () => {
      await addContact({ label: "Alice", publicKey: pkA });
      try {
        await addContact({ label: "Alice2", publicKey: pkA });
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateFingerprintError);
        const e = err as DuplicateFingerprintError;
        expect(e.existingLabel).toBe("Alice");
        expect(e.reason).toBe("current");
        expect(e.existingId).toBeDefined();
      }
    });

    it("throws DuplicateFingerprintError when fingerprint matches another contact's previous", async () => {
      const alice = await addContact({ label: "Alice", publicKey: pkA });
      await updateContactKey(alice.id, pkB);
      try {
        await addContact({ label: "Bob", publicKey: pkA });
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateFingerprintError);
        const e = err as DuplicateFingerprintError;
        expect(e.existingLabel).toBe("Alice");
        expect(e.reason).toBe("previous");
      }
    });
  });

  describe("listContacts", () => {
    it("returns [] for empty store", async () => {
      expect(await listContacts()).toEqual([]);
    });

    it("returns all contacts sorted by label asc, locale-aware", async () => {
      await addContact({ label: "charlie", publicKey: pkA });
      await addContact({ label: "Alice", publicKey: pkB });
      await addContact({ label: "Bob", publicKey: pkC });
      const list = await listContacts();
      expect(list.map((c) => c.label)).toEqual(["Alice", "Bob", "charlie"]);
    });
  });

  describe("getContact", () => {
    it("returns the record for an existing id", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      const fetched = await getContact(a.id);
      expect(fetched?.id).toBe(a.id);
      expect(fetched?.label).toBe("Alice");
    });

    it("returns null for an unknown id", async () => {
      expect(await getContact("00000000-0000-0000-0000-000000000000")).toBeNull();
    });
  });

  describe("updateContactKey", () => {
    it("pushes current fingerprint onto previousFingerprints, sets new key, flips verified=false, bumps updatedAt", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await setContactVerified(a.id, true);
      const before = await getContact(a.id);
      expect(before).not.toBeNull();
      if (!before) throw new Error("unreachable");
      expect(before.verified).toBe(true);
      await new Promise((r) => setTimeout(r, 5));
      const after = await updateContactKey(a.id, pkB);
      expect(after.publicKey).toBe(pkB);
      expect(after.fingerprint).toBe(fpB);
      expect(after.verified).toBe(false);
      expect(after.previousFingerprints).toEqual([fpA]);
      expect(after.updatedAt > before.updatedAt).toBe(true);
    });

    it("appends to previousFingerprints in chronological (oldest-first) order", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await updateContactKey(a.id, pkB);
      const final = await updateContactKey(a.id, pkC);
      expect(final.previousFingerprints).toEqual([fpA, fpB]);
    });

    it("throws NotFoundError on unknown id", async () => {
      await expect(
        updateContactKey("00000000-0000-0000-0000-000000000000", pkA),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws SameKeyError when new key equals current key", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await expect(updateContactKey(a.id, pkA)).rejects.toBeInstanceOf(SameKeyError);
    });

    it("throws RotatedAwayError when new key matches one of THIS contact's previous fingerprints", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await updateContactKey(a.id, pkB);
      await expect(updateContactKey(a.id, pkA)).rejects.toBeInstanceOf(RotatedAwayError);
    });
  });

  describe("setContactVerified", () => {
    it("toggles verified true -> false and back", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      const v1 = await setContactVerified(a.id, true);
      expect(v1.verified).toBe(true);
      const v2 = await setContactVerified(a.id, false);
      expect(v2.verified).toBe(false);
    });

    it("bumps updatedAt", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await new Promise((r) => setTimeout(r, 5));
      const v = await setContactVerified(a.id, true);
      expect(v.updatedAt > a.updatedAt).toBe(true);
    });

    it("throws NotFoundError on unknown id", async () => {
      await expect(
        setContactVerified("00000000-0000-0000-0000-000000000000", true),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("renameContact", () => {
    it("trims and updates label", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      const r = await renameContact(a.id, "  Alicia  ");
      expect(r.label).toBe("Alicia");
    });

    it("throws InvalidLabelError on empty trimmed label", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await expect(renameContact(a.id, "   ")).rejects.toBeInstanceOf(InvalidLabelError);
    });

    it("throws InvalidLabelError on label > 80 chars", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await expect(renameContact(a.id, "y".repeat(81))).rejects.toBeInstanceOf(InvalidLabelError);
    });

    it("throws NotFoundError on unknown id", async () => {
      await expect(
        renameContact("00000000-0000-0000-0000-000000000000", "Bob"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("deleteContact", () => {
    it("removes one contact and leaves siblings", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      const b = await addContact({ label: "Bob", publicKey: pkB });
      await deleteContact(a.id);
      const remaining = await listContacts();
      expect(remaining.map((c) => c.id)).toEqual([b.id]);
    });

    it("is idempotent on unknown id (no throw)", async () => {
      await expect(deleteContact("00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
    });
  });

  describe("error class identity", () => {
    it("all error types extend ContactsStoreError", () => {
      expect(new InvalidLabelError("bad")).toBeInstanceOf(ContactsStoreError);
      expect(new NotFoundError("bad")).toBeInstanceOf(ContactsStoreError);
      expect(new SameKeyError("bad")).toBeInstanceOf(ContactsStoreError);
      expect(new RotatedAwayError("bad")).toBeInstanceOf(ContactsStoreError);
      expect(
        new DuplicateFingerprintError("bad", {
          existingId: "x",
          existingLabel: "y",
          reason: "current",
        }),
      ).toBeInstanceOf(ContactsStoreError);
    });

    it("DuplicateFingerprintError exposes existingId, existingLabel, reason", () => {
      const err = new DuplicateFingerprintError("dup", {
        existingId: "id-1",
        existingLabel: "Alice",
        reason: "previous",
      });
      expect(err.existingId).toBe("id-1");
      expect(err.existingLabel).toBe("Alice");
      expect(err.reason).toBe("previous");
    });
  });
});
