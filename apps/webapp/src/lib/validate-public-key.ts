import {
  type Fingerprint,
  fingerprint,
  importPublicKey,
  type PublicKeyString,
} from "@aesmsg/crypto";

// Source-agnostic public-key validation shared by the compose recipient (SP2), add-contact, and the
// contact re-key + scan flows (SP4). One implementation so paste and scan behave identically. This
// module never touches the network or storage — it only parses + fingerprints a candidate key, and
// never throws to the UI. The authoritative parse is importPublicKey (requires the amk1: prefix +
// decodes the wire format); the derived AM- fingerprint is a local display value, never uploaded.

export type PublicKeyValidation =
  | { ok: true; publicKey: PublicKeyString; fingerprint: Fingerprint }
  | { ok: false; reason: "empty" | "invalid" };

/**
 * Trim, then importPublicKey + fingerprint under try/catch. An empty field resolves to
 * { ok:false, reason:"empty" }; a non-`amk1:`/malformed key resolves to { ok:false, reason:"invalid" }
 * rather than throwing.
 */
export async function validatePublicKey(input: string): Promise<PublicKeyValidation> {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  try {
    await importPublicKey(trimmed);
    const fp = await fingerprint(trimmed as PublicKeyString);
    return { ok: true, publicKey: trimmed as PublicKeyString, fingerprint: fp };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/**
 * Cheap synchronous shape check — does the value even look like base64/PEM key text? This is NOT the
 * authoritative parse (that is validatePublicKey/importPublicKey); it only lets the UI disable submit
 * and lets the scan gate reject obvious junk before the async parse. Mirrors mobile's
 * `looksLikePublicKey` (apps/mobile/src/create/recipient.ts).
 */
export function looksLikePublicKey(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 16) return false;
  // Allow base64 / base64url and PEM-ish characters (A–Z a–z 0–9 + / - _ = whitespace : .). Reject
  // anything with other punctuation that a key would never contain.
  return /^[A-Za-z0-9+/=\-_\s:.]+$/.test(trimmed);
}
