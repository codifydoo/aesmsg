import { deriveArgon2id } from "./argon2";
import { BadPassphraseError, DecryptionError, InvalidFormatError } from "./errors";
import { exportRawPrivateKey, importRawPrivateKey, importRawPublicKey } from "./hpke";
import { __getIdentityImpl } from "./identity";
import type { IdentityKeypair, PublicKeyString, WrappedKey } from "./types";
import { base64urlDecode, base64urlEncode, encodePubkey, RAW_X25519_PUBKEY_LEN } from "./wire";

const ENVELOPE_VERSION = 1;
const KDF_ID = "argon2id-aes256gcm";
const SALT_LEN = 16;
const IV_LEN = 12;
const RAW_X25519_PRIVKEY_LEN = 32;
const AEAD_TAG_LEN = 16;
const CT_LEN = RAW_X25519_PRIVKEY_LEN + AEAD_TAG_LEN;
const WRAP_KEY_LEN = 32;

/**
 * Argon2id cost parameters for deriving the key-encryption key that wraps an identity's private
 * key at rest. The cost is recorded per-envelope, so `unwrapPrivateKey` always re-derives with the
 * exact parameters used at wrap time — which makes it safe to choose different parameters per call.
 */
export interface WrapKdfParams {
  /** Memory cost in KiB. */
  mKib: number;
  /** Time cost (iterations). */
  t: number;
  /** Parallelism. Must be 1 — see `deriveArgon2id`. */
  p: number;
}

/**
 * Default (OWASP-interactive) Argon2id parameters: m=64 MiB, t=3, p=1. These defend a LOW-entropy
 * human passphrase by making each guess expensive, so the WEB path (a real passphrase) MUST use
 * them. Callers wrapping under a high-entropy secret (e.g. the mobile 256-bit device secret) may
 * pass lighter parameters — there is nothing to brute-force, so the memory-hardness buys no
 * additional security.
 */
export const DEFAULT_WRAP_KDF_PARAMS: WrapKdfParams = { mKib: 65536, t: 3, p: 1 };

type Envelope = {
  v: number;
  kdf: string;
  m_kib: number;
  t: number;
  p: number;
  salt: string;
  iv: string;
  ct: string;
  pub: string;
};

async function deriveWrapKey(
  passphrase: string,
  salt: Uint8Array,
  mKib: number,
  t: number,
  p: number,
): Promise<Uint8Array> {
  return deriveArgon2id(passphrase, salt, mKib, t, p, WRAP_KEY_LEN);
}

async function importWrapKey(raw: Uint8Array): Promise<CryptoKey> {
  const buf = new ArrayBuffer(raw.byteLength);
  new Uint8Array(buf).set(raw);
  return crypto.subtle.importKey("raw", buf, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function wrapPrivateKey(
  id: IdentityKeypair,
  passphrase: string,
  params: WrapKdfParams = DEFAULT_WRAP_KDF_PARAMS,
): Promise<WrappedKey> {
  const impl = __getIdentityImpl(id);
  const rawPriv = await exportRawPrivateKey(impl.privateKey);
  const rawPub = impl.publicKeyRaw;

  const salt = new Uint8Array(SALT_LEN);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(IV_LEN);
  crypto.getRandomValues(iv);

  const wrapKeyRaw = await deriveWrapKey(passphrase, salt, params.mKib, params.t, params.p);
  const wrapKey = await importWrapKey(wrapKeyRaw);

  const ivBuf = new ArrayBuffer(iv.byteLength);
  new Uint8Array(ivBuf).set(iv);
  const ptBuf = new ArrayBuffer(rawPriv.byteLength);
  new Uint8Array(ptBuf).set(rawPriv);

  const ctAb = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBuf }, wrapKey, ptBuf);
  const ct = new Uint8Array(ctAb);

  const envelope: Envelope = {
    v: ENVELOPE_VERSION,
    kdf: KDF_ID,
    m_kib: params.mKib,
    t: params.t,
    p: params.p,
    salt: base64urlEncode(salt),
    iv: base64urlEncode(iv),
    ct: base64urlEncode(ct),
    pub: base64urlEncode(rawPub),
  };
  return JSON.stringify(envelope) as WrappedKey;
}

function parseEnvelope(s: string): {
  salt: Uint8Array;
  iv: Uint8Array;
  ct: Uint8Array;
  pub: Uint8Array;
  m_kib: number;
  t: number;
  p: number;
} {
  let env: unknown;
  try {
    env = JSON.parse(s);
  } catch {
    throw new InvalidFormatError("Wrapped key is not valid JSON");
  }
  if (typeof env !== "object" || env === null) {
    throw new InvalidFormatError("Wrapped key envelope must be an object");
  }
  const e = env as Partial<Envelope>;
  if (e.v !== ENVELOPE_VERSION) {
    throw new InvalidFormatError(`Unknown wrapped key version: ${String(e.v)}`);
  }
  if (e.kdf !== KDF_ID) {
    throw new InvalidFormatError(`Unknown KDF: ${String(e.kdf)}`);
  }
  if (typeof e.m_kib !== "number" || typeof e.t !== "number" || typeof e.p !== "number") {
    throw new InvalidFormatError("KDF parameters missing or wrong type");
  }
  if (typeof e.salt !== "string" || typeof e.iv !== "string" || typeof e.ct !== "string") {
    throw new InvalidFormatError("Required envelope fields (salt, iv, ct) missing or wrong type");
  }
  if (typeof e.pub !== "string") {
    throw new InvalidFormatError("Envelope field 'pub' missing or wrong type");
  }
  let salt: Uint8Array;
  let iv: Uint8Array;
  let ct: Uint8Array;
  let pub: Uint8Array;
  try {
    salt = base64urlDecode(e.salt);
    iv = base64urlDecode(e.iv);
    ct = base64urlDecode(e.ct);
    pub = base64urlDecode(e.pub);
  } catch {
    throw new InvalidFormatError("Envelope field is not valid base64url");
  }
  if (salt.length !== SALT_LEN) {
    throw new InvalidFormatError(`Salt must be ${SALT_LEN} bytes, got ${salt.length}`);
  }
  if (iv.length !== IV_LEN) {
    throw new InvalidFormatError(`IV must be ${IV_LEN} bytes, got ${iv.length}`);
  }
  if (ct.length !== CT_LEN) {
    throw new InvalidFormatError(`Ciphertext must be ${CT_LEN} bytes, got ${ct.length}`);
  }
  if (pub.length !== RAW_X25519_PUBKEY_LEN) {
    throw new InvalidFormatError(
      `Public key must be ${RAW_X25519_PUBKEY_LEN} bytes, got ${pub.length}`,
    );
  }
  return { salt, iv, ct, pub, m_kib: e.m_kib, t: e.t, p: e.p };
}

/**
 * Read the Argon2id KDF parameters recorded in a wrapped-key envelope, without unwrapping it (no
 * passphrase, no decryption). Used by the mobile lazy-rewrap migration to detect envelopes wrapped
 * under heavier parameters than the device now uses. Throws `InvalidFormatError` on a malformed
 * envelope.
 */
export function readWrapKdfParams(wrapped: WrappedKey): WrapKdfParams {
  const parsed = parseEnvelope(wrapped as string);
  return { mKib: parsed.m_kib, t: parsed.t, p: parsed.p };
}

export async function unwrapPrivateKey(
  wrapped: WrappedKey,
  passphrase: string,
): Promise<IdentityKeypair> {
  const parsed = parseEnvelope(wrapped as string);
  const wrapKeyRaw = await deriveWrapKey(passphrase, parsed.salt, parsed.m_kib, parsed.t, parsed.p);
  const wrapKey = await importWrapKey(wrapKeyRaw);

  const ivBuf = new ArrayBuffer(parsed.iv.byteLength);
  new Uint8Array(ivBuf).set(parsed.iv);
  const ctBuf = new ArrayBuffer(parsed.ct.byteLength);
  new Uint8Array(ctBuf).set(parsed.ct);

  let rawPriv: Uint8Array;
  try {
    const ab = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, wrapKey, ctBuf);
    rawPriv = new Uint8Array(ab);
  } catch {
    throw new BadPassphraseError();
  }
  /* v8 ignore start — defensive: AES-256-GCM cannot return non-32-byte plaintext from a 48-byte ct */
  if (rawPriv.length !== RAW_X25519_PRIVKEY_LEN) {
    throw new DecryptionError();
  }
  /* v8 ignore stop */

  let privateKey: CryptoKey;
  let publicKey: CryptoKey;
  try {
    privateKey = await importRawPrivateKey(rawPriv);
    publicKey = await importRawPublicKey(parsed.pub);
    /* v8 ignore start — defensive: 32 valid X25519 bytes never make import fail */
  } catch {
    throw new DecryptionError();
  }
  /* v8 ignore stop */

  const publicKeyString = encodePubkey(parsed.pub) as PublicKeyString;
  const impl = {
    publicKey,
    privateKey,
    publicKeyRaw: parsed.pub,
    publicKeyString,
  };
  return impl as unknown as IdentityKeypair;
}
