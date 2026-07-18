import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/aad.js";
import { __resetArgon2BackendForTests, __setArgon2BackendForTests } from "../src/argon2.js";
import { BadPassphraseError, DecryptionError, InvalidFormatError } from "../src/errors.js";
import { exportPublicKey, generateIdentity, importPublicKey } from "../src/identity.js";
import { open, seal } from "../src/seal.js";
import type { WrappedKey } from "../src/types.js";
import {
  DEFAULT_WRAP_KDF_PARAMS,
  readWrapKdfParams,
  unwrapPrivateKey,
  type WrapKdfParams,
  wrapPrivateKey,
} from "../src/wrap.js";

// High-entropy-secret callers (e.g. mobile's 256-bit device secret) may wrap under lighter params.
const LIGHT_PARAMS: WrapKdfParams = { mKib: 2048, t: 1, p: 1 };

describe("wrapPrivateKey / unwrapPrivateKey", () => {
  afterEach(() => {
    __resetArgon2BackendForTests();
  });

  it("round-trips: same passphrase recovers the same identity", async () => {
    const id = await generateIdentity();
    const pkBefore = exportPublicKey(id);

    const wrapped = await wrapPrivateKey(id, "correct horse battery staple");
    expect(typeof wrapped).toBe("string");

    const recovered = await unwrapPrivateKey(wrapped, "correct horse battery staple");
    const pkAfter = exportPublicKey(recovered);
    expect(pkAfter).toBe(pkBefore);
  });

  it("recovered identity can decrypt a message sealed for the original public key", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "pw");
    const recovered = await unwrapPrivateKey(wrapped, "pw");

    const recipientPk = await importPublicKey(exportPublicKey(id));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hello"), recipientPk, ctx);
    const out = await open(ct, recovered, ctx);
    expect(new TextDecoder().decode(out)).toBe("hello");
  });

  it("emits a JSON envelope with all required fields and the right shapes", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "pw");
    const env = JSON.parse(wrapped);
    expect(env.v).toBe(1);
    expect(env.kdf).toBe("argon2id-aes256gcm");
    expect(env.m_kib).toBe(65536);
    expect(env.t).toBe(3);
    expect(env.p).toBe(1);
    expect(typeof env.salt).toBe("string");
    expect(typeof env.iv).toBe("string");
    expect(typeof env.ct).toBe("string");
    expect(typeof env.pub).toBe("string");
  });

  it("each wrap with the same passphrase produces a different envelope (random salt + iv)", async () => {
    const id = await generateIdentity();
    const a = await wrapPrivateKey(id, "pw");
    const b = await wrapPrivateKey(id, "pw");
    expect(a).not.toBe(b);
  });

  it("defaults to OWASP-interactive params (m=64 MiB, t=3, p=1) when none are passed", async () => {
    expect(DEFAULT_WRAP_KDF_PARAMS).toEqual({ mKib: 65536, t: 3, p: 1 });
    const id = await generateIdentity();
    const env = JSON.parse(await wrapPrivateKey(id, "pw"));
    expect(env.m_kib).toBe(DEFAULT_WRAP_KDF_PARAMS.mKib);
    expect(env.t).toBe(DEFAULT_WRAP_KDF_PARAMS.t);
    expect(env.p).toBe(DEFAULT_WRAP_KDF_PARAMS.p);
  });

  it("wraps under custom (lighter) params and records them in the envelope", async () => {
    const id = await generateIdentity();
    const env = JSON.parse(await wrapPrivateKey(id, "device secret", LIGHT_PARAMS));
    expect(env.m_kib).toBe(2048);
    expect(env.t).toBe(1);
    expect(env.p).toBe(1);
  });

  it("round-trips under custom (lighter) params: unwrap re-derives from the envelope's own params", async () => {
    const id = await generateIdentity();
    const pkBefore = exportPublicKey(id);
    const wrapped = await wrapPrivateKey(id, "device secret", LIGHT_PARAMS);
    // unwrapPrivateKey takes NO params — it reads m_kib/t/p from the envelope.
    const recovered = await unwrapPrivateKey(wrapped, "device secret");
    expect(exportPublicKey(recovered)).toBe(pkBefore);
  });

  it("wrong passphrase throws BadPassphraseError", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "correct");
    await expect(unwrapPrivateKey(wrapped, "wrong")).rejects.toBeInstanceOf(BadPassphraseError);
  });

  it("BadPassphraseError instanceof DecryptionError so existing catches still work", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "correct");
    try {
      await unwrapPrivateKey(wrapped, "wrong");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecryptionError);
      expect(err).toBeInstanceOf(BadPassphraseError);
    }
  });

  it("tampered ciphertext throws DecryptionError", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "pw");
    const env = JSON.parse(wrapped);
    const ct = env.ct as string;
    const lastCh = ct[ct.length - 1] as string;
    const flipped = lastCh === "A" ? "B" : "A";
    env.ct = ct.slice(0, -1) + flipped;
    const tampered = JSON.stringify(env) as WrappedKey;
    await expect(unwrapPrivateKey(tampered, "pw")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("malformed JSON throws InvalidFormatError", async () => {
    await expect(unwrapPrivateKey("not json" as WrappedKey, "pw")).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });

  it("unknown envelope version throws InvalidFormatError", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "pw");
    const env = JSON.parse(wrapped);
    env.v = 999;
    await expect(unwrapPrivateKey(JSON.stringify(env) as WrappedKey, "pw")).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });

  it("unknown kdf throws InvalidFormatError", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "pw");
    const env = JSON.parse(wrapped);
    env.kdf = "scrypt-aes";
    await expect(unwrapPrivateKey(JSON.stringify(env) as WrappedKey, "pw")).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });

  it("missing required field throws InvalidFormatError", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "pw");
    const env = JSON.parse(wrapped);
    env.salt = undefined;
    await expect(unwrapPrivateKey(JSON.stringify(env) as WrappedKey, "pw")).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });

  it("wrong byte length for salt throws InvalidFormatError", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, "pw");
    const env = JSON.parse(wrapped);
    env.salt = "AAAAAAAAAAA";
    await expect(unwrapPrivateKey(JSON.stringify(env) as WrappedKey, "pw")).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });

  // Pure-JS noble argon2id (m=64MiB, t=3) is slow, especially under coverage instrumentation,
  // so these get a generous timeout like the property test below.
  it("wrap with WASM argon2id, unwrap with noble argon2id recovers the identity", {
    timeout: 60_000,
  }, async () => {
    const id = await generateIdentity();
    const pkBefore = exportPublicKey(id);
    __setArgon2BackendForTests("wasm");
    const wrapped = await wrapPrivateKey(id, "cross backend pw");
    __setArgon2BackendForTests("noble");
    const recovered = await unwrapPrivateKey(wrapped, "cross backend pw");
    __resetArgon2BackendForTests();
    expect(exportPublicKey(recovered)).toBe(pkBefore);
  });

  it("wrap with noble argon2id, unwrap with WASM argon2id recovers the identity", {
    timeout: 60_000,
  }, async () => {
    const id = await generateIdentity();
    const pkBefore = exportPublicKey(id);
    __setArgon2BackendForTests("noble");
    const wrapped = await wrapPrivateKey(id, "cross backend pw");
    __setArgon2BackendForTests("wasm");
    const recovered = await unwrapPrivateKey(wrapped, "cross backend pw");
    __resetArgon2BackendForTests();
    expect(exportPublicKey(recovered)).toBe(pkBefore);
  });

  it("property: round-trip works for any reasonable passphrase", { timeout: 120_000 }, async () => {
    const id = await generateIdentity();
    const pkBefore = exportPublicKey(id);
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 64 }), async (passphrase) => {
        const wrapped = await wrapPrivateKey(id, passphrase);
        const recovered = await unwrapPrivateKey(wrapped, passphrase);
        return exportPublicKey(recovered) === pkBefore;
      }),
      { numRuns: 5 },
    );
  });

  describe("readWrapKdfParams", () => {
    it("returns the KDF params recorded in a default-wrapped envelope", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, "pw");
      expect(readWrapKdfParams(wrapped)).toEqual({ mKib: 65536, t: 3, p: 1 });
    });

    it("returns the KDF params recorded in a custom-wrapped envelope", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, "device secret", LIGHT_PARAMS);
      expect(readWrapKdfParams(wrapped)).toEqual(LIGHT_PARAMS);
    });

    it("throws InvalidFormatError on a malformed envelope", () => {
      expect(() => readWrapKdfParams("not json" as WrappedKey)).toThrow(InvalidFormatError);
    });
  });
});
