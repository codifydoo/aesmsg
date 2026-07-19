import {
  type Fingerprint,
  fingerprint,
  importPublicKey,
  type PublicKeyString,
} from "@aesmsg/crypto";

// Validate a pasted recipient public key without ever throwing at the UI. This is the seam SP4's
// saved-contact picker will plug into: the compose screen consumes { publicKey, fingerprint }
// regardless of whether the key came from a paste, a saved contact, or a scanned QR.

export type RecipientValidation =
  | { ok: true; publicKey: PublicKeyString; fingerprint: Fingerprint }
  | { ok: false; reason: "empty" | "invalid" };

/**
 * Trim, then importPublicKey + fingerprint under try/catch. A non-`amk1:`/malformed key resolves to
 * { ok:false, reason:"invalid" } rather than throwing. The derived AM- fingerprint is for display +
 * the local sent-link record only — never uploaded.
 */
export async function validateRecipientKey(input: string): Promise<RecipientValidation> {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  try {
    // importPublicKey throws on a bad amk1 key; fingerprint derives the AM- display value locally.
    await importPublicKey(trimmed);
    const fp = await fingerprint(trimmed as PublicKeyString);
    return { ok: true, publicKey: trimmed as PublicKeyString, fingerprint: fp };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
