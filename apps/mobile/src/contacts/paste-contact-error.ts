import { InvalidFormatError } from "@aesmsg/crypto";
import {
  DuplicateFingerprintError,
  InvalidLabelError,
  RotatedAwayError,
  SameKeyError,
} from "@/src/contacts/contacts-store";
import { looksLikePublicKey } from "@/src/create/recipient";

// Pure helpers for the Paste-public-key contact screen. Extracted (node-tested, no React) per the
// apps/mobile convention; mirrors keys/gate-error.ts so the screen stays thin & presentational.

/** Enable "Add contact" only with a name and something that at least looks like a public key. */
export function canAddContact(key: string, name: string): boolean {
  return name.trim().length > 0 && looksLikePublicKey(key);
}

/** Map a thrown validation/store error to user-facing copy for the paste screen. */
export function pasteContactError(e: unknown): string {
  if (e instanceof InvalidFormatError) {
    return "That doesn't look like a valid aesmsg public key. Check that you copied the whole key.";
  }
  if (e instanceof DuplicateFingerprintError) {
    return e.reason === "previous"
      ? `This key was rotated away by "${e.existingLabel}".`
      : `This key is already saved as "${e.existingLabel}".`;
  }
  // Re-key path (updating an existing contact's key): the candidate matched the current key, or a
  // key this contact already rotated away from. Both are no-ops the store refuses, surfaced inline.
  if (e instanceof SameKeyError) {
    return "That's already this contact's current key.";
  }
  if (e instanceof RotatedAwayError) {
    return "This key was previously rotated away from this contact.";
  }
  if (e instanceof InvalidLabelError) {
    return "Enter a name for this contact.";
  }
  return "Couldn't add this contact. Please try again.";
}
