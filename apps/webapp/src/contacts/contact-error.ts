import { InvalidFormatError } from "@aesmsg/crypto";
import {
  DuplicateFingerprintError,
  InvalidLabelError,
  RotatedAwayError,
  SameKeyError,
} from "@/src/contacts/contacts-store";

// Map a thrown validation/store error to calm, user-facing copy for the add-contact + re-key screens.
// Ported from apps/mobile/src/contacts/paste-contact-error.ts so the two surfaces read identically.
export function contactErrorCopy(e: unknown): string {
  if (e instanceof InvalidFormatError) {
    return "That doesn't look like a valid aesmsg public key. Check that you copied the whole key.";
  }
  if (e instanceof DuplicateFingerprintError) {
    return e.reason === "previous"
      ? `This key was rotated away by "${e.existingLabel}".`
      : `This key is already saved as "${e.existingLabel}".`;
  }
  // Re-key path: the candidate matched the current key, or a key this contact already rotated away
  // from. Both are no-ops the store refuses, surfaced inline.
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
