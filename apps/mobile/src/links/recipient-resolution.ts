import { type Fingerprint, truncateFingerprint } from "@aesmsg/crypto";
import type { LinkRecipient } from "@/src/links/links-data";

// Pure recipient resolution for the Link details "recipient" card.
//
// A sent-link record stores only the recipient's FINGERPRINT (the key it was sealed to) — no display
// name, no verified flag. The details card previously hard-coded `verified: false` and rendered the
// FULL fingerprint, so a link to a contact you verified looked unverified and cramped (UX §B: "Link
// details recipient card renders misleading placeholder trust data"). Instead we resolve the
// fingerprint against the on-device contacts directory here and truncate it for display.
//
// Kept side-effect-free (no store, no React) and decoupled from ContactRecord (a local minimal
// projection) so it is node-testable in isolation without pulling in the native-backed contacts store.

/**
 * The minimal contact projection this resolver reads. Structurally a subset of
 * `ContactRecord` (contacts-store.ts), so callers can pass `ContactRecord[]` directly.
 */
export interface RecipientContactRef {
  label: string;
  fingerprint: Fingerprint;
  verified: boolean;
  previousFingerprints: Fingerprint[];
}

/** Shown when no contact matches the sealed-to fingerprint (neutral — never an alarm). */
export const UNKNOWN_RECIPIENT_NAME = "Unknown recipient";

/**
 * Resolve the recipient card for a link from the contacts directory by the fingerprint it was sealed
 * to. Rules:
 *   - CURRENT-key match  → the contact's name + its real verified state.
 *   - PREVIOUS-key match → the contact's name, but NEVER "verified": the link was sealed to a key the
 *     contact has since rotated away from, so its current verified state doesn't apply to it.
 *   - no match           → a neutral "Unknown recipient".
 * The fingerprint is always TRUNCATED to two groups (mono / JetBrains Mono) so the card stays compact.
 */
export function resolveRecipient(
  recipientFingerprint: Fingerprint,
  contacts: readonly RecipientContactRef[],
): LinkRecipient {
  const shortFingerprint = truncateFingerprint(recipientFingerprint, 2);

  const current = contacts.find((c) => c.fingerprint === recipientFingerprint);
  if (current) {
    return { name: current.label, shortFingerprint, verified: current.verified };
  }

  const rotated = contacts.find((c) => c.previousFingerprints.includes(recipientFingerprint));
  if (rotated) {
    return { name: rotated.label, shortFingerprint, verified: false };
  }

  return { name: UNKNOWN_RECIPIENT_NAME, shortFingerprint, verified: false };
}
