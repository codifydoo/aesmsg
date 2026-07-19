import {
  fingerprint as computeFingerprint,
  type Fingerprint,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { CONTACTS_STORE, withStore } from "@/src/identity/db";

// On-device contact directory for the web client. Mirrors apps/mobile/src/contacts/contacts-store.ts
// API + typed errors VERBATIM, swapping the mobile shared EncryptedStore for the `contacts` IndexedDB
// object store (DB v3). Each ContactRecord is keyed by its stable `id`.
//
// A contact carries a REAL publicKey (PUBLIC material), its computed fingerprint, and a user-chosen
// label — so the compose seal path treats a picked contact exactly like a pasted key.
//
// PRODUCT INVARIANT (D5): a ContactRecord holds ONLY public/metadata material — a public key, its
// fingerprint, and a label. There is NO secret here. Nothing here reaches the server (contacts are
// entirely local); the zero-knowledge backend invariant is untouched.
//
// AT-REST CAVEAT (D5): unlike mobile (which seals this under a device DEK), the webapp's IndexedDB is
// NOT encrypted at rest. Because a record is entirely public material, that is a metadata/social-graph
// exposure (local-profile access learns your contact labels), NEVER a confidentiality break: no key
// here can decrypt a message.

const MAX_LABEL_LEN = 80;

export interface ContactRecord {
  id: string; // crypto.randomUUID(); stable, survives key rotation
  label: string; // 1-80 chars, trimmed
  publicKey: PublicKeyString; // the amk1: key — PUBLIC material
  fingerprint: Fingerprint; // computed via @aesmsg/crypto
  verified: boolean; // manual; reset to false on key rotation
  previousFingerprints: Fingerprint[]; // oldest-first rotation history
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  schemaVersion: 1;
}

export interface AddContactInput {
  label: string;
  publicKey: PublicKeyString;
}

export class ContactsStoreError extends Error {
  override name = "ContactsStoreError";
}
export class InvalidLabelError extends ContactsStoreError {
  override name = "InvalidLabelError";
}
export class NotFoundError extends ContactsStoreError {
  override name = "NotFoundError";
}
export class SameKeyError extends ContactsStoreError {
  override name = "SameKeyError";
}
export class RotatedAwayError extends ContactsStoreError {
  override name = "RotatedAwayError";
}
export class DuplicateFingerprintError extends ContactsStoreError {
  override name = "DuplicateFingerprintError";
  existingId: string;
  existingLabel: string;
  reason: "current" | "previous";
  constructor(
    message: string,
    info: { existingId: string; existingLabel: string; reason: "current" | "previous" },
  ) {
    super(message);
    this.existingId = info.existingId;
    this.existingLabel = info.existingLabel;
    this.reason = info.reason;
  }
}

function validateLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new InvalidLabelError("Label is required");
  if (trimmed.length > MAX_LABEL_LEN) {
    throw new InvalidLabelError(`Label must be ${MAX_LABEL_LEN} characters or fewer`);
  }
  return trimmed;
}

async function readAll(): Promise<ContactRecord[]> {
  const all = await withStore<ContactRecord[]>(CONTACTS_STORE, "readonly", (store) =>
    store.getAll(),
  );
  return all;
}

export async function addContact(input: AddContactInput): Promise<ContactRecord> {
  const label = validateLabel(input.label);
  const fp = await computeFingerprint(input.publicKey);
  const all = await readAll();
  for (const c of all) {
    if (c.fingerprint === fp) {
      throw new DuplicateFingerprintError("This public key is already saved", {
        existingId: c.id,
        existingLabel: c.label,
        reason: "current",
      });
    }
    if (c.previousFingerprints.includes(fp)) {
      throw new DuplicateFingerprintError("This public key was rotated away by another contact", {
        existingId: c.id,
        existingLabel: c.label,
        reason: "previous",
      });
    }
  }
  const now = new Date().toISOString();
  const record: ContactRecord = {
    id: crypto.randomUUID(),
    label,
    publicKey: input.publicKey,
    fingerprint: fp,
    verified: false,
    previousFingerprints: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
  await withStore<IDBValidKey>(CONTACTS_STORE, "readwrite", (store) => store.put(record));
  return record;
}

export async function listContacts(): Promise<ContactRecord[]> {
  const all = await readAll();
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return all.slice().sort((a, b) => collator.compare(a.label, b.label));
}

export async function getContact(id: string): Promise<ContactRecord | null> {
  const record = await withStore<ContactRecord | undefined>(CONTACTS_STORE, "readonly", (store) =>
    store.get(id),
  );
  return record ?? null;
}

export async function updateContactKey(
  id: string,
  newPublicKey: PublicKeyString,
): Promise<ContactRecord> {
  const existing = await getContact(id);
  if (existing === null) throw new NotFoundError(`Contact ${id} not found`);
  const newFp = await computeFingerprint(newPublicKey);
  if (newFp === existing.fingerprint) {
    throw new SameKeyError("New key equals current key");
  }
  if (existing.previousFingerprints.includes(newFp)) {
    throw new RotatedAwayError("This key was previously rotated away by this contact");
  }
  const updated: ContactRecord = {
    ...existing,
    publicKey: newPublicKey,
    fingerprint: newFp,
    verified: false,
    previousFingerprints: [...existing.previousFingerprints, existing.fingerprint],
    updatedAt: new Date().toISOString(),
  };
  await withStore<IDBValidKey>(CONTACTS_STORE, "readwrite", (store) => store.put(updated));
  return updated;
}

export async function setContactVerified(id: string, verified: boolean): Promise<ContactRecord> {
  const existing = await getContact(id);
  if (existing === null) throw new NotFoundError(`Contact ${id} not found`);
  const updated: ContactRecord = {
    ...existing,
    verified,
    updatedAt: new Date().toISOString(),
  };
  await withStore<IDBValidKey>(CONTACTS_STORE, "readwrite", (store) => store.put(updated));
  return updated;
}

export async function renameContact(id: string, label: string): Promise<ContactRecord> {
  const trimmed = validateLabel(label);
  const existing = await getContact(id);
  if (existing === null) throw new NotFoundError(`Contact ${id} not found`);
  const updated: ContactRecord = {
    ...existing,
    label: trimmed,
    updatedAt: new Date().toISOString(),
  };
  await withStore<IDBValidKey>(CONTACTS_STORE, "readwrite", (store) => store.put(updated));
  return updated;
}

export async function deleteContact(id: string): Promise<void> {
  // Idempotent: deleting a missing id is a no-op (IndexedDB delete never errors on a missing key).
  await withStore<undefined>(CONTACTS_STORE, "readwrite", (store) => store.delete(id));
}

/** Test-only: wipe the contacts store so each case starts from an empty directory. */
export async function __resetContactsForTests(): Promise<void> {
  await withStore<undefined>(CONTACTS_STORE, "readwrite", (store) => store.clear());
}
