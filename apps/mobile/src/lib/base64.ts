// Hermes' atob support is inconsistent across RN versions, so decode explicitly.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DECODE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) DECODE[ALPHABET[i] as string] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += ALPHABET[(value >> bits) & 0x3f];
    }
  }
  if (bits > 0) result += ALPHABET[(value << (6 - bits)) & 0x3f];
  while (result.length % 4 !== 0) result += "=";
  return result;
}

// base64url (RFC 4648 §5): +→-, /→_, padding stripped. Used for link ids.
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const v = DECODE[ch];
    if (v === undefined) throw new Error("Invalid base64 character");
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}
