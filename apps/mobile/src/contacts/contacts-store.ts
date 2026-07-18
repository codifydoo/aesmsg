import {
  fingerprint as computeFingerprint,
  type Fingerprint,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { getEncryptedStore } from "@/src/storage";

// Real, encrypted-at-rest contact directory. Mirrors apps/web/src/lib/contacts-store.ts API +
// error types VERBATIM, swapping web's IndexedDB backend for the single shared on-device
// EncryptedStore (one DEK in the keychain; domains separated by blob key). The whole contact array
// lives under the "contacts" blob key — small, read+rewrite on every mutation, which is fine for an
// address book and keeps the store dead simple (no per-record indexing on top of a JSON blob).
//
// A "contact" now carries a REAL publicKey (no longer a presentational short fingerprint), so the
// compose seal path treats a picked contact exactly like a pasted key.

export const CONTACTS_BLOB_KEY = "contacts";
const MAX_LABEL_LEN = 80;

export interface ContactRecord {
  id: string; // stable uuid; survives key rotation
  label: string; // 1-80 chars, trimmed
  publicKey: PublicKeyString;
  fingerprint: Fingerprint; // computed via @aesmsg/crypto
  verified: boolean; // manual; reset to false on key rotation
  previousFingerprints: Fingerprint[]; // oldest-first
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
  const store = await getEncryptedStore();
  return (await store.getJson<ContactRecord[]>(CONTACTS_BLOB_KEY)) ?? [];
}

async function writeAll(records: ContactRecord[]): Promise<void> {
  const store = await getEncryptedStore();
  await store.setJson(CONTACTS_BLOB_KEY, records);
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
  await writeAll([...all, record]);
  return record;
}

export async function listContacts(): Promise<ContactRecord[]> {
  const all = await readAll();
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return all.slice().sort((a, b) => collator.compare(a.label, b.label));
}

export async function getContact(id: string): Promise<ContactRecord | null> {
  const all = await readAll();
  return all.find((c) => c.id === id) ?? null;
}

export async function updateContactKey(
  id: string,
  newPublicKey: PublicKeyString,
): Promise<ContactRecord> {
  const all = await readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new NotFoundError(`Contact ${id} not found`);
  const existing = all[idx] as ContactRecord;
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
  const next = all.slice();
  next[idx] = updated;
  await writeAll(next);
  return updated;
}

export async function setContactVerified(id: string, verified: boolean): Promise<ContactRecord> {
  const all = await readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new NotFoundError(`Contact ${id} not found`);
  const updated: ContactRecord = {
    ...(all[idx] as ContactRecord),
    verified,
    updatedAt: new Date().toISOString(),
  };
  const next = all.slice();
  next[idx] = updated;
  await writeAll(next);
  return updated;
}

export async function renameContact(id: string, label: string): Promise<ContactRecord> {
  const trimmed = validateLabel(label);
  const all = await readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new NotFoundError(`Contact ${id} not found`);
  const updated: ContactRecord = {
    ...(all[idx] as ContactRecord),
    label: trimmed,
    updatedAt: new Date().toISOString(),
  };
  const next = all.slice();
  next[idx] = updated;
  await writeAll(next);
  return updated;
}

export async function deleteContact(id: string): Promise<void> {
  const all = await readAll();
  const next = all.filter((c) => c.id !== id);
  if (next.length === all.length) return; // idempotent: nothing to delete
  await writeAll(next);
}

/** Test-only: wipe the contacts blob so each case starts from an empty directory. */
export async function __resetContactsForTests(): Promise<void> {
  const store = await getEncryptedStore();
  await store.remove(CONTACTS_BLOB_KEY);
}
