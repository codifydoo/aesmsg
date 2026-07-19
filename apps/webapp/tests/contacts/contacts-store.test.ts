import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetContactsForTests,
  addContact,
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
import { __deleteDbForTests } from "@/src/identity/db";

async function realKey(): Promise<PublicKeyString> {
  return exportPublicKey(await generateIdentity());
}

describe("contacts store", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
    await __resetContactsForTests();
  });

  it("adds and round-trips a contact (unverified, empty history, schemaVersion 1)", async () => {
    const pk = await realKey();
    const added = await addContact({ label: "  Alice  ", publicKey: pk });
    expect(added.label).toBe("Alice"); // trimmed
    expect(added.publicKey).toBe(pk);
    expect(added.fingerprint).toBe(await fingerprint(pk));
    expect(added.verified).toBe(false);
    expect(added.previousFingerprints).toEqual([]);
    expect(added.schemaVersion).toBe(1);

    const loaded = await getContact(added.id);
    expect(loaded).toEqual(added);
  });

  it("rejects an empty or over-long label", async () => {
    const pk = await realKey();
    await expect(addContact({ label: "   ", publicKey: pk })).rejects.toBeInstanceOf(
      InvalidLabelError,
    );
    await expect(addContact({ label: "x".repeat(81), publicKey: pk })).rejects.toBeInstanceOf(
      InvalidLabelError,
    );
  });

  it("guards against re-adding the same key (reason 'current')", async () => {
    const pk = await realKey();
    const first = await addContact({ label: "Alice", publicKey: pk });
    try {
      await addContact({ label: "Alice again", publicKey: pk });
      throw new Error("expected DuplicateFingerprintError");
    } catch (e) {
      expect(e).toBeInstanceOf(DuplicateFingerprintError);
      const dup = e as DuplicateFingerprintError;
      expect(dup.reason).toBe("current");
      expect(dup.existingId).toBe(first.id);
      expect(dup.existingLabel).toBe("Alice");
    }
  });

  it("guards against adding a key another contact rotated away (reason 'previous')", async () => {
    const oldKey = await realKey();
    const newKey = await realKey();
    const c = await addContact({ label: "Bob", publicKey: oldKey });
    await updateContactKey(c.id, newKey); // oldKey now lives in previousFingerprints
    try {
      await addContact({ label: "Bob's old key", publicKey: oldKey });
      throw new Error("expected DuplicateFingerprintError");
    } catch (e) {
      expect(e).toBeInstanceOf(DuplicateFingerprintError);
      expect((e as DuplicateFingerprintError).reason).toBe("previous");
    }
  });

  it("updateContactKey resets verified:false and appends the old fingerprint", async () => {
    const oldKey = await realKey();
    const newKey = await realKey();
    const c = await addContact({ label: "Carol", publicKey: oldKey });
    await setContactVerified(c.id, true);
    const oldFp = c.fingerprint;

    const updated = await updateContactKey(c.id, newKey);
    expect(updated.publicKey).toBe(newKey);
    expect(updated.fingerprint).toBe(await fingerprint(newKey));
    expect(updated.verified).toBe(false); // reset — must re-verify
    expect(updated.previousFingerprints).toEqual([oldFp]);
  });

  it("updateContactKey rejects the same key (SameKeyError) and a rotated-away key (RotatedAwayError)", async () => {
    const k1 = await realKey();
    const k2 = await realKey();
    const c = await addContact({ label: "Dave", publicKey: k1 });
    await expect(updateContactKey(c.id, k1)).rejects.toBeInstanceOf(SameKeyError);

    await updateContactKey(c.id, k2); // k1 now rotated away
    await expect(updateContactKey(c.id, k1)).rejects.toBeInstanceOf(RotatedAwayError);
    await expect(updateContactKey("missing-id", k1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("setContactVerified and renameContact persist; delete is idempotent", async () => {
    const pk = await realKey();
    const c = await addContact({ label: "Eve", publicKey: pk });

    const verified = await setContactVerified(c.id, true);
    expect(verified.verified).toBe(true);

    const renamed = await renameContact(c.id, "Eve Adams");
    expect(renamed.label).toBe("Eve Adams");
    expect((await getContact(c.id))?.label).toBe("Eve Adams");

    await deleteContact(c.id);
    expect(await getContact(c.id)).toBeNull();
    await expect(deleteContact(c.id)).resolves.toBeUndefined(); // idempotent
    await expect(renameContact("missing", "X")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listContacts sorts by label with a locale collator", async () => {
    await addContact({ label: "charlie", publicKey: await realKey() });
    await addContact({ label: "Alice", publicKey: await realKey() });
    await addContact({ label: "bob", publicKey: await realKey() });
    const labels = (await listContacts()).map((c) => c.label);
    expect(labels).toEqual(["Alice", "bob", "charlie"]);
  });

  it("persists ONLY the D5 public/metadata fields — no secret material", async () => {
    const pk = await realKey();
    const c = await addContact({ label: "Frank", publicKey: pk });
    const loaded = await getContact(c.id);
    const str = JSON.stringify(loaded);
    expect(str).not.toContain('"privateKey"');
    expect(str).not.toContain('"text"');
    expect(str).not.toContain('"ciphertext"');
    expect(str).not.toContain('"revocationToken"');
    expect(Object.keys(loaded ?? {}).sort()).toEqual([
      "createdAt",
      "fingerprint",
      "id",
      "label",
      "previousFingerprints",
      "publicKey",
      "schemaVersion",
      "updatedAt",
      "verified",
    ]);
  });
});
