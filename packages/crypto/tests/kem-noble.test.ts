import { x25519 } from "@noble/curves/ed25519";
import { describe, expect, it } from "vitest";
import { NobleDhkemX25519HkdfSha256, type NobleX25519 } from "../src/kem-noble.js";

// Direct unit tests of the pure-JS noble DHKEM(X25519) primitive. These exercise every method
// and error branch with the real @noble/curves backend (no mocks), independent of the HPKE
// envelope, so the trust-critical primitive is verified on its own.

function makeKdf() {
  // The Dhkem subclass owns the kdf instance; reach into it for deriveKeyPair tests.
  return new NobleDhkemX25519HkdfSha256();
}

describe("NobleDhkemX25519HkdfSha256 (KEM shape)", () => {
  it("reports the X25519 KEM id and 32-byte sizes matching the native KEM", () => {
    const kem = new NobleDhkemX25519HkdfSha256();
    expect(kem.secretSize).toBe(32);
    expect(kem.encSize).toBe(32);
    expect(kem.publicKeySize).toBe(32);
    expect(kem.privateKeySize).toBe(32);
    // KemId.DhkemX25519HkdfSha256 === 0x0020
    expect(kem.id).toBe(0x0020);
  });

  it("generateKeyPair produces a usable, self-consistent 32-byte keypair", async () => {
    const kem = makeKdf();
    const kp = await kem.generateKeyPair();
    const pub = new Uint8Array(await kem.serializePublicKey(kp.publicKey));
    const priv = new Uint8Array(await kem.serializePrivateKey(kp.privateKey));
    expect(pub).toHaveLength(32);
    expect(priv).toHaveLength(32);
    // public key must equal scalarMultBase(priv)
    expect(Array.from(pub)).toEqual(Array.from(x25519.getPublicKey(priv)));
  });
});

describe("NobleX25519 primitive", () => {
  function newPrim(): NobleX25519 {
    // Borrow the kdf from a fresh Dhkem so deriveKeyPair uses an initialized HKDF suiteId.
    const kem = new NobleDhkemX25519HkdfSha256();
    // @ts-expect-error access the private primitive for direct testing
    return kem._prim as NobleX25519;
  }

  it("dh is symmetric: dh(skA, pkB) === dh(skB, pkA)", async () => {
    const prim = newPrim();
    const a = await prim.generateKeyPair();
    const b = await prim.generateKeyPair();
    const ssAB = new Uint8Array(await prim.dh(a.privateKey, b.publicKey));
    const ssBA = new Uint8Array(await prim.dh(b.privateKey, a.publicKey));
    expect(Array.from(ssAB)).toEqual(Array.from(ssBA));
    expect(ssAB).toHaveLength(32);
  });

  it("derivePublicKey(sk) matches the generated public key", async () => {
    const prim = newPrim();
    const kp = await prim.generateKeyPair();
    const derived = await prim.derivePublicKey(kp.privateKey);
    const a = new Uint8Array(await prim.serializePublicKey(derived));
    const b = new Uint8Array(await prim.serializePublicKey(kp.publicKey));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("importKey('raw', ...) round-trips public and private keys", async () => {
    const prim = newPrim();
    const kp = await prim.generateKeyPair();
    const rawPub = await prim.serializePublicKey(kp.publicKey);
    const rawPriv = await prim.serializePrivateKey(kp.privateKey);

    const pub = await prim.importKey("raw", rawPub, true);
    const priv = await prim.importKey("raw", rawPriv, false);
    expect(Array.from(new Uint8Array(await prim.serializePublicKey(pub)))).toEqual(
      Array.from(new Uint8Array(rawPub)),
    );
    expect(Array.from(new Uint8Array(await prim.serializePrivateKey(priv)))).toEqual(
      Array.from(new Uint8Array(rawPriv)),
    );
  });

  it("deserializePublicKey / deserializePrivateKey accept ArrayBufferView and ArrayBuffer", async () => {
    const prim = newPrim();
    const raw = new Uint8Array(32).fill(5);
    const fromView = await prim.deserializePublicKey(raw);
    const fromBuffer = await prim.deserializePrivateKey(raw.buffer);
    expect(new Uint8Array(await prim.serializePublicKey(fromView))).toHaveLength(32);
    expect(new Uint8Array(await prim.serializePrivateKey(fromBuffer))).toHaveLength(32);
  });

  it("rejects wrong-length keys on deserialize and import", async () => {
    const prim = newPrim();
    const short = new Uint8Array(31);
    await expect(prim.deserializePublicKey(short)).rejects.toThrow(/public key/i);
    await expect(prim.deserializePrivateKey(short)).rejects.toThrow(/private key/i);
    await expect(prim.importKey("raw", short.buffer, true)).rejects.toThrow(/ciphersuite/i);
  });

  it("rejects non-raw import formats and non-buffer raw keys", async () => {
    const prim = newPrim();
    await expect(prim.importKey("jwk", {} as JsonWebKey, true)).rejects.toThrow(/raw format/i);
    await expect(prim.importKey("raw", "nope" as unknown as ArrayBuffer, true)).rejects.toThrow(
      /ArrayBuffer/i,
    );
  });

  it("deriveKeyPair is deterministic for a fixed IKM", async () => {
    const prim = newPrim();
    const ikm = new Uint8Array(32).fill(0x42);
    const kp1 = await prim.deriveKeyPair(ikm);
    const kp2 = await prim.deriveKeyPair(ikm);
    const p1 = new Uint8Array(await prim.serializePublicKey(kp1.publicKey));
    const p2 = new Uint8Array(await prim.serializePublicKey(kp2.publicKey));
    expect(Array.from(p1)).toEqual(Array.from(p2));
  });
});
