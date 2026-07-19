import { type PublicKeyValidation, validatePublicKey } from "@/src/lib/validate-public-key";

// Validate a pasted recipient public key without ever throwing at the UI. Since SP4 this delegates to
// the shared, source-agnostic `validatePublicKey` (used by add-contact + re-key too) so paste, saved
// contact, and scanned QR all reach crypto through one implementation. The public
// `validateRecipientKey`/`RecipientValidation` API is kept so SP2 callers + tests need no change.

export type RecipientValidation = PublicKeyValidation;

/**
 * Trim, then importPublicKey + fingerprint under try/catch (delegated to `validatePublicKey`). A
 * non-`amk1:`/malformed key resolves to { ok:false, reason:"invalid" } rather than throwing. The
 * derived AM- fingerprint is for display + the local sent-link record only — never uploaded.
 */
export async function validateRecipientKey(input: string): Promise<RecipientValidation> {
  return validatePublicKey(input);
}
