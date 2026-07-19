import type { Fingerprint, PublicKeyString } from "@aesmsg/crypto";
import type { ContactView } from "@/src/contacts/contacts-display";

// Pure compose-side recipient model + the key-changed GATE, ported from apps/mobile/src/create/
// recipient.ts. A picked recipient carries the SAME { publicKey, fingerprint } the pasted path
// produces, so the seal call (createAndSeal) is identical regardless of source. Node-testable — no
// React, no storage, no crypto here.

/**
 * The recipient a compose draft seals to:
 *   - "contact" → a saved contact picked from the recipient picker; carries the contact's REAL
 *     public key + its trust state for the MitM gate.
 *   - "pasted"  → a public key pasted (or scanned) directly (no on-file history → never gated).
 */
export type PickedRecipient =
  | {
      kind: "contact";
      contact: ContactView;
      publicKey: PublicKeyString;
      fingerprint: Fingerprint;
    }
  | { kind: "pasted"; publicKey: PublicKeyString; fingerprint: Fingerprint };

/**
 * A contact whose key CHANGED (a MitM signal) must clear the key-changed gate before it can become
 * the active recipient. True only for a contact-kind recipient in the "changed" trust state; a
 * pasted key has no on-file history to compare against, so it is never gated here.
 */
export function isChangedContactRecipient(
  recipient: PickedRecipient,
): recipient is PickedRecipient & { kind: "contact" } {
  return recipient.kind === "contact" && recipient.contact.status === "changed";
}

/**
 * Seed compose state from a pre-selected recipient (e.g. "Send secure message" off a contact's
 * detail screen, or a picker selection). A changed-key contact is HELD BACK behind the key-changed
 * gate (`keyChanged`) rather than adopted directly as `recipient`, so the MitM check is never bypassed
 * — there is no path where a "changed" contact becomes the active recipient without an explicit
 * action. Everything else is adopted.
 */
export function seedComposeRecipient(initial: PickedRecipient | undefined): {
  recipient: PickedRecipient | null;
  keyChanged: (PickedRecipient & { kind: "contact" }) | undefined;
} {
  if (initial && isChangedContactRecipient(initial)) {
    return { recipient: null, keyChanged: initial };
  }
  return { recipient: initial ?? null, keyChanged: undefined };
}
