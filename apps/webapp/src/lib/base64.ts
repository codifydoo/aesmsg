// Base64 helpers for the browser. Two encodings, both mobile-interop-parity:
//   - bytesToBase64:    STANDARD base64 (with padding) for the ciphertext upload body. The server
//     decodes it with atob + /^[A-Za-z0-9+/]*={0,2}$/, so the alphabet + padding must be standard.
//   - bytesToBase64Url: url-safe, padless (RFC 4648 §5) for link-id generation.
//   - base64ToBytes:    decodes either variant (declared now for the SP3 reader).
// Pure atob/btoa — no @aesmsg/crypto internals, no Node Buffer. Mirrors the semantics of
// apps/mobile/src/lib/base64.ts so a web-minted link id / ciphertext is byte-identical to a mobile one.

// btoa takes a "binary string" (one char per byte). Building it in bounded chunks keeps the
// String.fromCharCode spread from overflowing the call stack on large (multi-MiB) ciphertext.
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// base64url (RFC 4648 §5): +→-, /→_, trailing padding stripped. Used for link ids.
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64ToBytes(s: string): Uint8Array {
  // Accept both standard and url-safe input by restoring the standard alphabet first; atob
  // tolerates the (optionally absent) padding.
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
