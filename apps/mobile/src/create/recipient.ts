// Pure logic for the compose recipient: model the chosen recipient (a verified/seeded contact, or
// a manually pasted public key), derive its display + the public-key string fed UNCHANGED into the
// existing seal call, and validate a pasted key's shape before it reaches crypto.
//
// Extracted (per the node-env / no-React-renderer test convention) so RecipientPickerSheet +
// ComposeScreen stay thin and presentational. This module never touches crypto, the network, or
// storage — it only shapes what the user picked. The authoritative key validation still happens in
// create-and-seal.ts (importPublicKey) and ComposeScreen's fingerprint effect; this is a cheap,
// synchronous pre-check so the UI can disable "Encrypt" and avoid posting an obviously-bad key.

import type { Contact } from "@/src/contacts/contacts-data";

/**
 * The recipient a compose draft is sealing to. A discriminated union over the two design sources:
 *   - "contact" → a saved contact picked from the recipient sheet. It now carries the contact's
 *     REAL public-key string (resolved from the encrypted contacts store), plus its trust state for
 *     the MitM check — so sealing to a contact is identical to sealing to a pasted key.
 *   - "pasted"  → a public key pasted (or scanned) directly.
 *
 * Scan resolves to a "pasted" recipient (the QR payload is a public key string), so the picker's
 * tabs collapse to these two shapes downstream.
 */
export type Recipient =
  | { kind: "contact"; contact: Contact; publicKeyString: string }
  | { kind: "pasted"; publicKeyString: string };

/**
 * Build the recipient for sealing to a saved contact: pairs the presentational `Contact` view-model
 * with its REAL public-key string (resolved from the encrypted contacts store). This is the exact
 * shape RecipientPickerSheet produces when a contact is picked, so the "Send secure message" entry
 * point off a contact's detail screen feeds the seal path identically.
 */
export function contactRecipient(contact: Contact, publicKeyString: string): Recipient {
  return { kind: "contact", contact, publicKeyString };
}

/**
 * A contact whose key CHANGED (a MitM signal) must clear the key-changed warning before it can
 * become the active recipient. True only for a contact-kind recipient in the "changed" trust state;
 * a pasted key has no on-file history to compare against, so it is never gated here.
 */
export function isChangedContactRecipient(
  recipient: Recipient,
): recipient is Recipient & { kind: "contact" } {
  return recipient.kind === "contact" && recipient.contact.status === "changed";
}

/**
 * Seed compose state from a pre-selected recipient (e.g. tapping "Send secure message" on a
 * contact). Mirrors RecipientPickerSheet's handlePicked gate: a changed-key contact is held back
 * behind the key-changed warning (`keyChanged`) rather than adopted directly as `recipient`, so the
 * MitM check is never bypassed by the contact-detail entry point. Everything else is adopted.
 */
export function seedComposeRecipient(initial: Recipient | undefined): {
  recipient: Recipient | null;
  keyChanged: (Recipient & { kind: "contact" }) | undefined;
} {
  if (initial && isChangedContactRecipient(initial)) {
    return { recipient: null, keyChanged: initial };
  }
  return { recipient: initial ?? null, keyChanged: undefined };
}

/** Human label for the chosen recipient (contact name, or a short "Pasted key" marker). */
export function recipientLabel(recipient: Recipient | null): string {
  if (recipient === null) return "Select recipient";
  if (recipient.kind === "contact") return recipient.contact.name;
  return "Pasted public key";
}

/**
 * The public-key string to seal against, or null when the recipient cannot supply one yet.
 *
 * Both sources now carry a real key string (a contact resolves its stored publicKey; a pasted key
 * supplies it directly), so the seal path is uniform. The trimmed value is the single source of
 * truth for the seal input. The authoritative parse still happens in importPublicKey
 * (create-and-seal.ts) + ComposeScreen's fingerprint effect; this only shapes what the user picked.
 */
export function recipientPublicKeyString(recipient: Recipient | null): string | null {
  if (recipient === null) return null;
  const trimmed = recipient.publicKeyString.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Cheap synchronous shape check for a pasted public key — does it even look like base64/PEM key
 * text? This is NOT the authoritative parse (that is importPublicKey in create-and-seal.ts); it
 * only lets the picker reject obvious junk before the async fingerprint effect runs. A value that
 * passes here may still fail importPublicKey — the fingerprint effect + seal remain the real gates.
 */
export function looksLikePublicKey(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 16) return false;
  // Allow base64 / base64url and PEM-ish characters (A–Z a–z 0–9 + / - _ = whitespace and PEM
  // markers). Reject anything with other punctuation that a key would never contain.
  return /^[A-Za-z0-9+/=\-_\s:.]+$/.test(trimmed);
}
