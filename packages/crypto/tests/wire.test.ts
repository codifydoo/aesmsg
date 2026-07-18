import { describe, expect, it } from "vitest";
import { InvalidFormatError } from "../src/errors.js";
import {
  base32EncodeLower,
  base64urlDecode,
  base64urlEncode,
  CANONICAL_PUBKEY_LEN,
  CIPHERTEXT_PREFIX_LEN,
  decodeCiphertextBlob,
  decodePubkey,
  ENCAPSULATED_KEY_LEN,
  encodeCiphertextBlob,
  encodePubkey,
  PUBKEY_PREFIX,
  RAW_X25519_PUBKEY_LEN,
  SUITE_X25519_AES256GCM,
  WIRE_VERSION,
} from "../src/wire.js";

describe("base64url", () => {
  it("encodes empty input as empty string", () => {
    expect(base64urlEncode(new Uint8Array())).toBe("");
  });

  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 250, 251, 252, 253, 254, 255]);
    const encoded = base64urlEncode(bytes);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(Array.from(base64urlDecode(encoded))).toEqual(Array.from(bytes));
  });

  it("decodes typical X25519-public-key-length byte arrays", () => {
    const bytes = new Uint8Array(34);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i;
    expect(Array.from(base64urlDecode(base64urlEncode(bytes)))).toEqual(Array.from(bytes));
  });

  it("rejects characters outside the base64url alphabet", () => {
    expect(() => base64urlDecode("invalid!chars")).toThrow(InvalidFormatError);
  });
});

describe("base32 (lowercase, RFC 4648)", () => {
  it("encodes empty input as empty string", () => {
    expect(base32EncodeLower(new Uint8Array())).toBe("");
  });

  it("encodes a known fixture deterministically", () => {
    expect(base32EncodeLower(new Uint8Array([0, 0, 0, 0, 0]))).toBe("aaaaaaaa");
    expect(base32EncodeLower(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]))).toBe("77777777");
  });

  it("encodes 15 bytes as 24 base32 characters", () => {
    const bytes = new Uint8Array(15);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i * 17;
    const encoded = base32EncodeLower(bytes);
    expect(encoded).toHaveLength(24);
    expect(encoded).toMatch(/^[a-z2-7]{24}$/);
  });
});

describe("pubkey envelope", () => {
  const sampleRawKey = new Uint8Array(RAW_X25519_PUBKEY_LEN);
  for (let i = 0; i < sampleRawKey.length; i++) sampleRawKey[i] = i;

  it("constants have the expected values", () => {
    expect(PUBKEY_PREFIX).toBe("amk1:");
    expect(WIRE_VERSION).toBe(0x01);
    expect(SUITE_X25519_AES256GCM).toBe(0x01);
    expect(RAW_X25519_PUBKEY_LEN).toBe(32);
    expect(CANONICAL_PUBKEY_LEN).toBe(34);
    expect(ENCAPSULATED_KEY_LEN).toBe(32);
    expect(CIPHERTEXT_PREFIX_LEN).toBe(34);
  });

  it("encodes a 32-byte X25519 key as amk1: + 46 base64url chars", () => {
    const encoded = encodePubkey(sampleRawKey);
    expect(encoded.startsWith(PUBKEY_PREFIX)).toBe(true);
    expect(encoded.slice(PUBKEY_PREFIX.length)).toHaveLength(46);
  });

  it("round-trips an encoded pubkey back to the original raw bytes", () => {
    const { rawKey, canonical } = decodePubkey(encodePubkey(sampleRawKey));
    expect(Array.from(rawKey)).toEqual(Array.from(sampleRawKey));
    expect(canonical[0]).toBe(WIRE_VERSION);
    expect(canonical[1]).toBe(SUITE_X25519_AES256GCM);
    expect(canonical).toHaveLength(CANONICAL_PUBKEY_LEN);
  });

  it("rejects non-32-byte raw keys at encode time", () => {
    expect(() => encodePubkey(new Uint8Array(31))).toThrow(InvalidFormatError);
    expect(() => encodePubkey(new Uint8Array(33))).toThrow(InvalidFormatError);
  });

  it("rejects strings missing the amk1: prefix", () => {
    expect(() => decodePubkey("foo")).toThrow(InvalidFormatError);
    expect(() => decodePubkey(`ssk2:${base64urlEncode(new Uint8Array(34))}`)).toThrow(
      InvalidFormatError,
    );
  });

  it("rejects bodies that are not valid base64url", () => {
    expect(() => decodePubkey("amk1:!!!")).toThrow(InvalidFormatError);
  });

  it("rejects bodies that decode to the wrong byte length", () => {
    expect(() => decodePubkey(`amk1:${base64urlEncode(new Uint8Array(33))}`)).toThrow(
      InvalidFormatError,
    );
  });

  it("rejects bodies with unknown version byte", () => {
    const tampered = new Uint8Array(sampleRawKey.length + 2);
    tampered[0] = 0x99;
    tampered[1] = SUITE_X25519_AES256GCM;
    tampered.set(sampleRawKey, 2);
    expect(() => decodePubkey(`amk1:${base64urlEncode(tampered)}`)).toThrow(InvalidFormatError);
  });

  it("rejects bodies with unknown suite byte", () => {
    const tampered = new Uint8Array(sampleRawKey.length + 2);
    tampered[0] = WIRE_VERSION;
    tampered[1] = 0x99;
    tampered.set(sampleRawKey, 2);
    expect(() => decodePubkey(`amk1:${base64urlEncode(tampered)}`)).toThrow(InvalidFormatError);
  });
});

describe("ciphertext blob", () => {
  const enc = new Uint8Array(ENCAPSULATED_KEY_LEN);
  for (let i = 0; i < enc.length; i++) enc[i] = 100 + i;
  const aeadOutput = new Uint8Array([0xa, 0xb, 0xc, 0xd, 0xe]);

  it("encodes header + encapsulated key + aead output in that order", () => {
    const blob = encodeCiphertextBlob(enc, aeadOutput);
    expect(blob[0]).toBe(WIRE_VERSION);
    expect(blob[1]).toBe(SUITE_X25519_AES256GCM);
    expect(Array.from(blob.slice(2, 34))).toEqual(Array.from(enc));
    expect(Array.from(blob.slice(34))).toEqual(Array.from(aeadOutput));
    expect(blob).toHaveLength(2 + ENCAPSULATED_KEY_LEN + aeadOutput.length);
  });

  it("decodes back to {enc, aeadOutput}", () => {
    const blob = encodeCiphertextBlob(enc, aeadOutput);
    const parsed = decodeCiphertextBlob(blob);
    expect(Array.from(parsed.enc)).toEqual(Array.from(enc));
    expect(Array.from(parsed.aeadOutput)).toEqual(Array.from(aeadOutput));
  });

  it("rejects blobs shorter than the prefix", () => {
    expect(() => decodeCiphertextBlob(new Uint8Array(33))).toThrow();
  });

  it("rejects blobs with the wrong version byte", () => {
    const blob = encodeCiphertextBlob(enc, aeadOutput);
    blob[0] = 0x99;
    expect(() => decodeCiphertextBlob(blob)).toThrow();
  });

  it("rejects blobs with the wrong suite byte", () => {
    const blob = encodeCiphertextBlob(enc, aeadOutput);
    blob[1] = 0x99;
    expect(() => decodeCiphertextBlob(blob)).toThrow();
  });
});
