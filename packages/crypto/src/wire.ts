import { InvalidFormatError } from "./errors";

export const PUBKEY_PREFIX = "amk1:";
export const WIRE_VERSION = 0x01;
export const SUITE_X25519_AES256GCM = 0x01;
export const RAW_X25519_PUBKEY_LEN = 32;
export const CANONICAL_PUBKEY_LEN = 2 + RAW_X25519_PUBKEY_LEN;
export const ENCAPSULATED_KEY_LEN = 32;
export const CIPHERTEXT_PREFIX_LEN = 2 + ENCAPSULATED_KEY_LEN;

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function base64urlEncode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | (bytes[i] ?? 0);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += BASE64URL_ALPHABET[(value >> bits) & 0x3f];
    }
  }
  if (bits > 0) {
    result += BASE64URL_ALPHABET[(value << (6 - bits)) & 0x3f];
  }
  return result;
}

const BASE64URL_DECODE_TABLE: Record<string, number> = {};
for (let i = 0; i < BASE64URL_ALPHABET.length; i++) {
  BASE64URL_DECODE_TABLE[BASE64URL_ALPHABET[i] as string] = i;
}

export function base64urlDecode(s: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    const v = BASE64URL_DECODE_TABLE[ch];
    if (v === undefined) {
      throw new InvalidFormatError("Invalid base64url character");
    }
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function base32EncodeLower(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | (bytes[i] ?? 0);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

export function encodePubkey(rawKey: Uint8Array): string {
  if (rawKey.length !== RAW_X25519_PUBKEY_LEN) {
    throw new InvalidFormatError(
      `Expected ${RAW_X25519_PUBKEY_LEN}-byte X25519 public key, got ${rawKey.length}`,
    );
  }
  const canonical = new Uint8Array(CANONICAL_PUBKEY_LEN);
  canonical[0] = WIRE_VERSION;
  canonical[1] = SUITE_X25519_AES256GCM;
  canonical.set(rawKey, 2);
  return PUBKEY_PREFIX + base64urlEncode(canonical);
}

export function decodePubkey(s: string): { rawKey: Uint8Array; canonical: Uint8Array } {
  if (!s.startsWith(PUBKEY_PREFIX)) {
    throw new InvalidFormatError("Not an aesmsg public key (missing amk1: prefix)");
  }
  const body = s.slice(PUBKEY_PREFIX.length);
  const canonical = base64urlDecode(body);
  if (canonical.length !== CANONICAL_PUBKEY_LEN) {
    throw new InvalidFormatError(
      `Public key must decode to ${CANONICAL_PUBKEY_LEN} bytes, got ${canonical.length}`,
    );
  }
  if (canonical[0] !== WIRE_VERSION) {
    throw new InvalidFormatError(`Unknown public key version: ${canonical[0]}`);
  }
  if (canonical[1] !== SUITE_X25519_AES256GCM) {
    throw new InvalidFormatError(`Unknown public key suite: ${canonical[1]}`);
  }
  return { rawKey: canonical.slice(2), canonical };
}

export function encodeCiphertextBlob(enc: Uint8Array, aeadOutput: Uint8Array): Uint8Array {
  if (enc.length !== ENCAPSULATED_KEY_LEN) {
    throw new Error(`Encapsulated key must be ${ENCAPSULATED_KEY_LEN} bytes`);
  }
  const blob = new Uint8Array(CIPHERTEXT_PREFIX_LEN + aeadOutput.length);
  blob[0] = WIRE_VERSION;
  blob[1] = SUITE_X25519_AES256GCM;
  blob.set(enc, 2);
  blob.set(aeadOutput, CIPHERTEXT_PREFIX_LEN);
  return blob;
}

const HEX_CHARS = "0123456789ABCDEF";

export function bytesToUpperHex(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    result += HEX_CHARS[(b >> 4) & 0xf];
    result += HEX_CHARS[b & 0xf];
  }
  return result;
}

export function decodeCiphertextBlob(blob: Uint8Array): {
  enc: Uint8Array;
  aeadOutput: Uint8Array;
} {
  if (blob.length < CIPHERTEXT_PREFIX_LEN) {
    throw new Error("Ciphertext blob too short");
  }
  if (blob[0] !== WIRE_VERSION) {
    throw new Error(`Unknown ciphertext version: ${blob[0]}`);
  }
  if (blob[1] !== SUITE_X25519_AES256GCM) {
    throw new Error(`Unknown ciphertext suite: ${blob[1]}`);
  }
  return {
    enc: blob.slice(2, CIPHERTEXT_PREFIX_LEN),
    aeadOutput: blob.slice(CIPHERTEXT_PREFIX_LEN),
  };
}
