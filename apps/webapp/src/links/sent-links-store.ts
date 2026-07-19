import type { Fingerprint } from "@aesmsg/crypto";
import { SENT_LINKS_STORE, withStore } from "@/src/identity/db";

// On-device sent-links tracking store for the web client. Mirrors the mobile record shape +
// recordSentLink / listSentLinks / getSentLink / deleteSentLink / clearSentLinks semantics
// (apps/mobile/src/links/sent-links-store.ts) minus the mobile-only `reminderNotificationId`, and
// persists into the `sent-links` IndexedDB object store instead of an encrypted file blob.
//
// PRODUCT INVARIANT (D7): a record holds ONLY sender-derivable metadata — id, recipient fingerprint
// (public, sender-derivable), expiry, max-opens, createdAt, and an optional local label. NEVER
// plaintext, ciphertext, or the recipient's key material.
//
// AT-REST CAVEAT (D7): unlike mobile (which seals this blob under a device DEK), the webapp's
// IndexedDB is NOT encrypted at rest, so the secret `revocationToken` lives in cleartext IndexedDB.
// This is an AVAILABILITY exposure only (local-profile access could revoke your links); it is NOT a
// confidentiality break — the token cannot decrypt anything, and nothing here reaches the server
// except through the existing endpoints. Documented in AGENTS.md; a future hardening (wrapping the
// blob under the identity key) is noted, not built.

export interface SentLinkRecord {
  id: string;
  recipientFingerprint: Fingerprint;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  maxOpens: number;
  /** Optional local-only, sender-entered label to recognize the link. Never uploaded. */
  label: string | null;
  /** Secret revocation token minted once at create; local-only; authenticates a revoke. */
  revocationToken: string | null;
  /**
   * The exact shareable link the server minted at create (`${AESMSG_PUBLIC_LINK_ORIGIN}/l/<id>`).
   * The authoritative source for the copy affordances — it stays correct even if the server's
   * AESMSG_PUBLIC_LINK_ORIGIN diverges from the webapp's link-url.ts fallback constant. `null` only on
   * LEGACY records written before this field existed (readers fall back to secureLinkUrl(id) then).
   */
  url: string | null;
  schemaVersion: 1;
}

/** Persist (or upsert by id) a sent-link tracking record. schemaVersion is stamped here. */
export async function recordSentLink(record: Omit<SentLinkRecord, "schemaVersion">): Promise<void> {
  const full: SentLinkRecord = { ...record, schemaVersion: 1 };
  await withStore<IDBValidKey>(SENT_LINKS_STORE, "readwrite", (store) => store.put(full));
}

/** All tracked links, newest-first by createdAt (ISO strings sort lexicographically). */
export async function listSentLinks(): Promise<SentLinkRecord[]> {
  const all = await withStore<SentLinkRecord[]>(SENT_LINKS_STORE, "readonly", (store) =>
    store.getAll(),
  );
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** One tracked link by id, or null if it was never recorded / has been deleted. */
export async function getSentLink(id: string): Promise<SentLinkRecord | null> {
  const record = await withStore<SentLinkRecord | undefined>(
    SENT_LINKS_STORE,
    "readonly",
    (store) => store.get(id),
  );
  return record ?? null;
}

/** Forget a tracked link locally. Deleting a missing id is a no-op. */
export async function deleteSentLink(id: string): Promise<void> {
  await withStore<undefined>(SENT_LINKS_STORE, "readwrite", (store) => store.delete(id));
}

/** Clear ALL locally-tracked sent links. The server-side links are unaffected. */
export async function clearSentLinks(): Promise<void> {
  await withStore<undefined>(SENT_LINKS_STORE, "readwrite", (store) => store.clear());
}

/** Test-only: wipe the sent-links store so each case starts empty. */
export async function __deleteSentLinksStoreForTests(): Promise<void> {
  await clearSentLinks();
}
