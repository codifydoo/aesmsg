import { looksLikePublicKey } from "@/src/lib/validate-public-key";

// Pure helpers for turning a scanned QR barcode into an add-contact candidate. Direct port of
// apps/mobile/src/contacts/scanned-key.ts. These are the *quick* scan-time gate only — the
// authoritative validation is validatePublicKey/importPublicKey (which requires the amk1: prefix +
// decodes the wire format), and it still runs on submit, identical to the paste flow.
//
// Unlike the paste flow — where the user DELIBERATELY typed a key and we only reject obvious junk via
// looksLikePublicKey — a camera scanner sees arbitrary QR codes (URLs, vCards, Wi-Fi configs, plain
// text). So the scan gate ALSO requires the canonical aesmsg public-key prefix to route a barcode to
// add-contact; a permissive shape check alone would forward any URL (URLs are all base64-alphabet +
// ":" + "/" + "." characters that looksLikePublicKey happily accepts).
//
// Kept as a local literal (mirrors PUBKEY_PREFIX in @aesmsg/crypto's wire format and the "amk1:…"
// placeholder on the paste field) so this module stays free of crypto internals.
const AMK_PREFIX = "amk1:";

/** Trim surrounding whitespace/newlines a QR encoder or scanner may include. */
export function normalizeScannedPayload(raw: string): string {
  return raw.trim();
}

/** True when a decoded barcode looks enough like an aesmsg public key to route to add-contact. */
export function isAcceptableScan(raw: string): boolean {
  const normalized = normalizeScannedPayload(raw);
  return normalized.startsWith(AMK_PREFIX) && looksLikePublicKey(normalized);
}
