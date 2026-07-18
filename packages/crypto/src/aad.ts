import { exportRawPublicKey } from "./hpke";
import { __getRecipientImpl, importPublicKey } from "./identity";
import type { PublicKeyString } from "./types";
import { SUITE_X25519_AES256GCM, WIRE_VERSION } from "./wire";

// AAD version 0x01 binds createdAtMs; version 0x02 drops it (metadata-leakage mitigation —
// the server no longer stores/returns createdAt for new links, so it can't be in the AAD).
// The version is selected DETERMINISTICALLY by whether the caller supplies createdAtMs:
// present -> v1 (legacy links + the cross-impl interop vector, byte-identical); absent -> v2.
// There is intentionally NO "try v1 then v2" fallback — one blob authenticates under exactly
// one AAD, so createdAt stays cryptographically bound on the rows that have it and binding
// regressions surface as failures rather than being masked.
export const AAD_VERSION = 0x01;
export const AAD_VERSION_V2 = 0x02;

const HEADER_LEN = 3;
const LINK_ID_LEN_PREFIX = 2;
const RECIP_HASH_LEN = 32;
const CREATED_AT_LEN = 8;
const EXPIRES_AT_LEN = 8;
const MAX_OPENS_LEN = 4;

// aesmsg link ids are base64url-encoded 12-byte random values — always 16 ASCII chars.
// Pinned here so the canonical AAD encoder enforces the wire invariant rather than trusting
// every caller to validate first.
const LINK_ID_BYTES_EXACT = 16;

export interface MessageBindingContext {
  readonly linkId: string;
  readonly recipientPublicKey: PublicKeyString;
  /**
   * Legacy v1 links carry the creation timestamp (bound into the v1 AAD). New v2 links omit it
   * entirely so it never has to be stored server-side. Presence selects the AAD version.
   */
  readonly createdAtMs?: number;
  readonly expiresAtMs: number;
  readonly maxOpens: number;
}

function writeU8(view: DataView, offset: number, value: number): number {
  view.setUint8(offset, value);
  return offset + 1;
}

function writeU16BE(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value, false);
  return offset + 2;
}

function writeI32BE(view: DataView, offset: number, value: number): number {
  view.setInt32(offset, value, false);
  return offset + 4;
}

function writeU64BE(view: DataView, offset: number, value: number): number {
  // JavaScript Number safe range is < 2^53; BigInt avoids any rounding for large millisecond values.
  view.setBigUint64(offset, BigInt(value), false);
  return offset + 8;
}

function writeBytes(out: Uint8Array, offset: number, bytes: Uint8Array): number {
  out.set(bytes, offset);
  return offset + bytes.length;
}

// Note: hashes the raw 32-byte X25519 key, NOT the canonical amk1-prefixed
// encoding. The suite and version bytes are already present in the AAD
// header bytes 1-2, so double-encoding them in the hash would be redundant.
// This hash is therefore NOT equivalent to the fingerprint produced by
// fingerprint.ts.
async function hashRecipientPubkey(pk: PublicKeyString): Promise<Uint8Array> {
  const recipient = await importPublicKey(pk);
  const impl = __getRecipientImpl(recipient);
  const raw = await exportRawPublicKey(impl.cryptoKey);
  const digestAb = await crypto.subtle.digest("SHA-256", raw.buffer as ArrayBuffer);
  return new Uint8Array(digestAb);
}

export async function encodeAad(ctx: MessageBindingContext): Promise<Uint8Array> {
  // Deterministic version selection: createdAtMs present -> v1 (byte-identical to the original
  // encoder + the interop vector); absent -> v2 (createdAt dropped).
  const isV1 = ctx.createdAtMs !== undefined;

  if (isV1 && (!Number.isSafeInteger(ctx.createdAtMs) || (ctx.createdAtMs as number) < 0)) {
    throw new Error("encodeAad: createdAtMs must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(ctx.expiresAtMs) || ctx.expiresAtMs < 0) {
    throw new Error("encodeAad: expiresAtMs must be a non-negative safe integer");
  }
  if (!Number.isInteger(ctx.maxOpens) || (ctx.maxOpens <= 0 && ctx.maxOpens !== -1)) {
    throw new Error("encodeAad: maxOpens must be a positive integer or -1");
  }

  // v1 keeps the strict ordering check against createdAt; v2 has no createdAt to compare, so it
  // retains only the absolute expiresAtMs guards above (it must still be a sane positive instant).
  if (isV1 && ctx.expiresAtMs <= (ctx.createdAtMs as number)) {
    throw new Error("encodeAad: expiresAtMs must be strictly greater than createdAtMs");
  }
  if (!isV1 && ctx.expiresAtMs <= 0) {
    throw new Error("encodeAad: expiresAtMs must be a positive instant");
  }

  const linkIdBytes = new TextEncoder().encode(ctx.linkId);
  if (linkIdBytes.length !== LINK_ID_BYTES_EXACT) {
    throw new Error(
      `encodeAad: linkId must be exactly ${LINK_ID_BYTES_EXACT} bytes, got ${linkIdBytes.length}`,
    );
  }
  const recipHash = await hashRecipientPubkey(ctx.recipientPublicKey);
  if (recipHash.length !== RECIP_HASH_LEN) {
    throw new Error("encodeAad: recipient hash unexpected length");
  }

  const total =
    HEADER_LEN +
    LINK_ID_LEN_PREFIX +
    linkIdBytes.length +
    RECIP_HASH_LEN +
    (isV1 ? CREATED_AT_LEN : 0) +
    EXPIRES_AT_LEN +
    MAX_OPENS_LEN;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let off = 0;
  off = writeU8(view, off, isV1 ? AAD_VERSION : AAD_VERSION_V2);
  off = writeU8(view, off, WIRE_VERSION);
  off = writeU8(view, off, SUITE_X25519_AES256GCM);
  off = writeU16BE(view, off, linkIdBytes.length);
  off = writeBytes(out, off, linkIdBytes);
  off = writeBytes(out, off, recipHash);
  if (isV1) {
    off = writeU64BE(view, off, ctx.createdAtMs as number);
  }
  off = writeU64BE(view, off, ctx.expiresAtMs);
  off = writeI32BE(view, off, ctx.maxOpens);

  if (off !== total) {
    throw new Error("encodeAad: internal offset mismatch");
  }
  return out;
}
