import {
  fingerprint as computeFingerprint,
  type Fingerprint,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { shortFingerprint } from "@/src/contacts/contacts-display";
import type { ContactRecord } from "@/src/contacts/contacts-store";

// Pure key-change detection for the "this contact's key changed" MitM signal — the product's headline
// defense. Direct port of apps/mobile/src/contacts/key-change.ts. Extracted (node-tested, no React /
// no storage) so the contact-detail re-scan / re-paste flow can DECIDE whether to raise the
// Key-Changed alert BEFORE committing anything to the store.
//
// The COMMIT itself stays in contacts-store.ts (updateContactKey), which independently re-derives the
// fingerprint and enforces the SameKeyError / RotatedAwayError guards. This module mirrors that
// classification WITHOUT throwing so the UI can branch on the outcome; keep the two in sync.

/**
 * Outcome of comparing a re-scanned / re-pasted key against a stored contact's current key:
 *   - "same"         → the candidate equals the current key (no change; a reassuring re-scan).
 *   - "rotated-back" → a key this contact ALREADY rotated away from (the store refuses to re-adopt
 *                      it — RotatedAwayError).
 *   - "changed"      → a genuinely new key: raise the Key-Changed alert. Carries the REAL previous
 *                      (current-on-file) + new fingerprints for the alert's side-by-side compare.
 */
export type KeyChangeDetection =
  | { kind: "same" }
  | { kind: "rotated-back" }
  | { kind: "changed"; previousFingerprint: Fingerprint; newFingerprint: Fingerprint };

/**
 * Synchronous, pure classifier: compare a candidate fingerprint against the stored contact's current
 * fingerprint + rotation history. No crypto, no storage — the security decision in isolation.
 */
export function classifyKeyChange(
  existing: Pick<ContactRecord, "fingerprint" | "previousFingerprints">,
  candidateFingerprint: Fingerprint,
): KeyChangeDetection {
  if (candidateFingerprint === existing.fingerprint) return { kind: "same" };
  if (existing.previousFingerprints.includes(candidateFingerprint)) {
    return { kind: "rotated-back" };
  }
  return {
    kind: "changed",
    previousFingerprint: existing.fingerprint,
    newFingerprint: candidateFingerprint,
  };
}

/**
 * Derive the candidate key's fingerprint, then classify it against the stored contact. Async only
 * because fingerprinting is; throws if `candidatePublicKey` is not a valid key (the caller validates
 * via importPublicKey/validatePublicKey first and maps any throw to inline copy).
 */
export async function detectKeyChange(
  existing: Pick<ContactRecord, "fingerprint" | "previousFingerprints">,
  candidatePublicKey: PublicKeyString,
): Promise<KeyChangeDetection> {
  const candidateFingerprint = await computeFingerprint(candidatePublicKey);
  return classifyKeyChange(existing, candidateFingerprint);
}

/** Display view-model the Key-Changed alert screen renders (short, mono fingerprint strings). */
export interface KeyChangeAlertView {
  contactName: string;
  /** Previously-verified fingerprint — neutral "Previous" cell. */
  previousFingerprint: string;
  /** Newly-detected fingerprint — amber "New" cell (the value to re-verify out-of-band). */
  newFingerprint: string;
}

/**
 * Format the alert's real fingerprints for display. Pure — separated from the JSX so the "the alert
 * shows the REAL prior + new fingerprint" contract is unit-tested without a renderer.
 */
export function keyChangeAlertView(
  contactName: string,
  previousFingerprint: Fingerprint,
  newFingerprint: Fingerprint,
): KeyChangeAlertView {
  return {
    contactName,
    previousFingerprint: shortFingerprint(previousFingerprint),
    newFingerprint: shortFingerprint(newFingerprint),
  };
}
