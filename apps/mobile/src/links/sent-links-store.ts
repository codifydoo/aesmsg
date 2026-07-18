import type { Fingerprint } from "@aesmsg/crypto";
import { getEncryptedStore } from "@/src/storage";

// On-device sent-links tracking store. Mirrors apps/web/src/lib/sent-links-store.ts's record shape
// and recordSentLink / listSentLinks / deleteSentLink semantics, but persists through the single
// encrypted-at-rest EncryptedStore (file-blob backend + one shared DEK) under the blob key
// "sent-links" instead of IndexedDB. The whole domain is ONE encrypted JSON blob: an id-keyed map.
//
// PRODUCT INVARIANT: a record holds only sender-derivable metadata (id, recipient fingerprint,
// expiry, max-opens, createdAt, an optional local label) — never plaintext. The encrypted blob keeps
// even that metadata at rest under the device-only DEK, consistent with the zero-knowledge posture.
//
// The `revocationToken` (BE-1 / R2) is a SECRET: whoever holds it can revoke the link. It rides in
// this SAME encrypted-at-rest blob (EncryptedStore file backend + device-only DEK), so it is never
// persisted in plaintext — exactly the protection the zero-knowledge posture already gives the rest
// of the metadata. It is optional so records written before authenticated revocation existed simply
// lack it; such records fall back to an un-tokened revoke (legacy server rows honor that).

const BLOB_KEY = "sent-links";

export interface SentLinkRecord {
  id: string;
  recipientFingerprint: Fingerprint;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  maxOpens: number;
  label: string | null;
  /**
   * Secret revocation token returned once at create (BE-1 / R2). Required to revoke the link.
   * Optional/absent for legacy records created before authenticated revocation — those revoke
   * un-tokened. Stored only inside the encrypted-at-rest blob, never in plaintext.
   */
  revocationToken?: string | null;
  /**
   * Local id of the scheduled "expiring soon" reminder notification (expo-notifications), captured at
   * create time so revoking the link can cancel a now-pointless reminder (see reminder-cancel.ts).
   * Optional/absent for legacy records and links created without a reminder — those simply have
   * nothing to cancel. Purely local; never sent to the server.
   */
  reminderNotificationId?: string | null;
  schemaVersion: 1;
}

type SentLinkMap = Record<string, SentLinkRecord>;

async function readMap(): Promise<SentLinkMap> {
  const store = await getEncryptedStore();
  return (await store.getJson<SentLinkMap>(BLOB_KEY)) ?? {};
}

async function writeMap(map: SentLinkMap): Promise<void> {
  const store = await getEncryptedStore();
  await store.setJson(BLOB_KEY, map);
}

/** Persist (or upsert by id) a sent-link tracking record. schemaVersion is stamped here. */
export async function recordSentLink(record: Omit<SentLinkRecord, "schemaVersion">): Promise<void> {
  const map = await readMap();
  map[record.id] = { ...record, schemaVersion: 1 };
  await writeMap(map);
}

/**
 * Best-effort partial update: attach the scheduled "expiring soon" reminder's notification id to an
 * already-recorded link (the record is written by createAndSeal after a successful POST; the reminder
 * is scheduled a moment later) so that revoking the link can cancel the now-pointless reminder (see
 * reminder-cancel.ts). Only `reminderNotificationId` is touched — every other field, including the
 * secret revocationToken, is preserved. If the record is absent (never recorded, or already deleted),
 * this is a no-op: the reminder id has nothing to attach to and we never resurrect a deleted record.
 */
export async function setSentLinkReminderNotificationId(
  id: string,
  reminderNotificationId: string,
): Promise<void> {
  const map = await readMap();
  const existing = map[id];
  if (!existing) return;
  map[id] = { ...existing, reminderNotificationId };
  await writeMap(map);
}

/** All tracked links, newest-first by createdAt (ISO strings sort lexicographically). */
export async function listSentLinks(): Promise<SentLinkRecord[]> {
  const map = await readMap();
  return Object.values(map).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** One tracked link by id, or null if it was never recorded / has been deleted. */
export async function getSentLink(id: string): Promise<SentLinkRecord | null> {
  const map = await readMap();
  return map[id] ?? null;
}

/** Forget a tracked link locally. Deleting a missing id is a no-op. */
export async function deleteSentLink(id: string): Promise<void> {
  const map = await readMap();
  if (!(id in map)) return;
  delete map[id];
  await writeMap(map);
}

/** Clear ALL locally-tracked sent links (the "cached links" half of Clear local history). Removes the
 *  whole sent-links blob; the server-side links are unaffected and keep working for recipients. */
export async function clearSentLinks(): Promise<void> {
  const store = await getEncryptedStore();
  await store.remove(BLOB_KEY);
}

/** Test-only: wipe the sent-links blob so each case starts from an empty store. */
export async function __deleteSentLinksStoreForTests(): Promise<void> {
  await clearSentLinks();
}
