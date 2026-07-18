// Pure-JS DHKEM(X25519, HKDF-SHA256) backend for runtimes whose `crypto.subtle` lacks the
// X25519 group operation (notably React Native / Hermes via react-native-quick-crypto, which
// ships SubtleCrypto with the X25519 cases commented out). It is byte-for-byte equivalent to
// @hpke/core's native DhkemX25519HkdfSha256: same KemId, same 32-byte sizes, same RFC 9180
// §7.1.3 DeriveKeyPair, with the X25519 scalar-mult and key-derivation done by the audited
// @noble/curves library instead of Web Crypto. This keeps the HPKE wire format identical, so
// ciphertext sealed on web/Node (native) opens on mobile (noble) and vice versa.
//
// The "CryptoKey" values produced/consumed here are opaque to @hpke/common — it only ever
// passes them back into this primitive — so we represent them as a small tagged object holding
// the 32 raw bytes, cast to CryptoKey at the boundary.
import { Dhkem, EMPTY, HkdfSha256Native, KemId, LABEL_DKP_PRK, LABEL_SK } from "@hpke/common";
import { x25519 } from "@noble/curves/ed25519";

const RAW_LEN = 32;

type NobleKey = {
  readonly kind: "public" | "private";
  readonly raw: Uint8Array;
};

function asNobleKey(key: unknown): NobleKey {
  return key as unknown as NobleKey;
}

function toUint8(input: ArrayBufferLike | ArrayBufferView): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return new Uint8Array(input as ArrayBufferLike);
}

// Copy into a standalone ArrayBuffer so callers never observe our internal backing store and
// length is exactly the key/secret size.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/**
 * DhkemPrimitives implementation backed by @noble/curves x25519. Mirrors
 * node_modules/@hpke/core/esm/src/kems/dhkemPrimitives/x25519.js, but with the X25519 group op
 * computed in pure JS.
 */
export class NobleX25519 {
  private readonly _hkdf: HkdfSha256Native;
  private readonly _nSk = RAW_LEN;

  constructor(hkdf: HkdfSha256Native) {
    this._hkdf = hkdf;
  }

  async serializePublicKey(key: CryptoKey): Promise<ArrayBuffer> {
    return toArrayBuffer(asNobleKey(key).raw);
  }

  async deserializePublicKey(key: ArrayBufferLike | ArrayBufferView): Promise<CryptoKey> {
    const raw = toUint8(key);
    if (raw.byteLength !== RAW_LEN) {
      throw new Error("Invalid public key for the ciphersuite");
    }
    return { kind: "public", raw: raw.slice() } as unknown as CryptoKey;
  }

  async serializePrivateKey(key: CryptoKey): Promise<ArrayBuffer> {
    return toArrayBuffer(asNobleKey(key).raw);
  }

  async deserializePrivateKey(key: ArrayBufferLike | ArrayBufferView): Promise<CryptoKey> {
    const raw = toUint8(key);
    if (raw.byteLength !== RAW_LEN) {
      throw new Error("Invalid private key for the ciphersuite");
    }
    return { kind: "private", raw: raw.slice() } as unknown as CryptoKey;
  }

  async importKey(
    format: "raw" | "jwk",
    key: ArrayBuffer | JsonWebKey,
    isPublic: boolean,
  ): Promise<CryptoKey> {
    if (format !== "raw") {
      throw new Error("NobleX25519.importKey supports only raw format");
    }
    if (!(key instanceof ArrayBuffer) && !ArrayBuffer.isView(key)) {
      throw new Error("NobleX25519.importKey: raw key must be ArrayBuffer/ArrayBufferView");
    }
    const raw = toUint8(key as ArrayBufferLike | ArrayBufferView);
    if (raw.byteLength !== RAW_LEN) {
      throw new Error("Invalid key for the ciphersuite");
    }
    return { kind: isPublic ? "public" : "private", raw: raw.slice() } as unknown as CryptoKey;
  }

  async generateKeyPair(): Promise<CryptoKeyPair> {
    const sk = x25519.utils.randomPrivateKey();
    const pk = x25519.getPublicKey(sk);
    return {
      privateKey: { kind: "private", raw: sk } as unknown as CryptoKey,
      publicKey: { kind: "public", raw: pk } as unknown as CryptoKey,
    };
  }

  // RFC 9180 §7.1.3 DeriveKeyPair, identical to native X25519.deriveKeyPair: reuse the SAME kdf
  // instance the Dhkem was constructed with so the labeled extract/expand bytes match exactly.
  async deriveKeyPair(ikm: ArrayBufferLike | ArrayBufferView): Promise<CryptoKeyPair> {
    const rawIkm = toUint8(ikm);
    const dkpPrk = await this._hkdf.labeledExtract(EMPTY, LABEL_DKP_PRK, new Uint8Array(rawIkm));
    const rawSk = await this._hkdf.labeledExpand(dkpPrk, LABEL_SK, EMPTY, this._nSk);
    const sk = new Uint8Array(rawSk);
    const privateKey = { kind: "private", raw: sk } as unknown as CryptoKey;
    return { privateKey, publicKey: await this.derivePublicKey(privateKey) };
  }

  async derivePublicKey(key: CryptoKey): Promise<CryptoKey> {
    const pk = x25519.getPublicKey(asNobleKey(key).raw);
    return { kind: "public", raw: pk } as unknown as CryptoKey;
  }

  async dh(sk: CryptoKey, pk: CryptoKey): Promise<ArrayBuffer> {
    // noble clamps the scalar internally, matching Web Crypto X25519 deriveBits.
    const shared = x25519.getSharedSecret(asNobleKey(sk).raw, asNobleKey(pk).raw);
    return toArrayBuffer(shared);
  }
}

/**
 * DHKEM(X25519, HKDF-SHA256) KEM that injects {@link NobleX25519} instead of the Web Crypto
 * primitive. Same KemId and sizes as @hpke/core's DhkemX25519HkdfSha256, so it is a drop-in
 * replacement that produces an identical HPKE wire format.
 */
export class NobleDhkemX25519HkdfSha256 extends Dhkem {
  constructor() {
    const kdf = new HkdfSha256Native();
    // The base Dhkem constructor sets `id` from the first argument; only the sizes default to 0
    // and must be overridden. Mirror @hpke/core's native DhkemX25519HkdfSha256, which sets these
    // via Object.defineProperty (the type marks them readonly).
    super(KemId.DhkemX25519HkdfSha256, new NobleX25519(kdf) as never, kdf);
    Object.defineProperty(this, "secretSize", { value: RAW_LEN });
    Object.defineProperty(this, "encSize", { value: RAW_LEN });
    Object.defineProperty(this, "publicKeySize", { value: RAW_LEN });
    Object.defineProperty(this, "privateKeySize", { value: RAW_LEN });
  }
}
