import { argon2id as nobleArgon2id } from "@noble/hashes/argon2";
import { argon2id as wasmArgon2id } from "hash-wasm";
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetArgon2BackendForTests,
  __setArgon2BackendForTests,
  deriveArgon2id,
} from "../src/argon2.js";

// Wrap.ts parameters (must stay in lockstep with src/wrap.ts).
const M_KIB = 65536;
const T = 3;
const P = 1;
const LEN = 32;

describe("argon2id backend agreement (hash-wasm <-> @noble/hashes)", () => {
  afterEach(() => {
    __resetArgon2BackendForTests();
  });

  it("noble and hash-wasm produce identical bytes for the wrap.ts parameters", {
    timeout: 60_000,
  }, async () => {
    const password = "correct horse battery staple";
    const salt = new Uint8Array(16);
    for (let i = 0; i < salt.length; i++) salt[i] = i + 1;

    const noble = nobleArgon2id(new TextEncoder().encode(password), salt, {
      t: T,
      m: M_KIB,
      p: P,
      dkLen: LEN,
    });
    const wasm = await wasmArgon2id({
      password,
      salt,
      parallelism: P,
      iterations: T,
      memorySize: M_KIB,
      hashLength: LEN,
      outputType: "binary",
    });
    expect(Array.from(noble)).toEqual(Array.from(wasm));
  });

  it("deriveArgon2id returns identical bytes whether forced to wasm or noble", {
    timeout: 60_000,
  }, async () => {
    const password = "another passphrase 🔐";
    const salt = new Uint8Array(16);
    for (let i = 0; i < salt.length; i++) salt[i] = (i * 5 + 3) & 0xff;

    __setArgon2BackendForTests("wasm");
    const fromWasm = await deriveArgon2id(password, salt, M_KIB, T, P, LEN);
    __setArgon2BackendForTests("noble");
    const fromNoble = await deriveArgon2id(password, salt, M_KIB, T, P, LEN);

    expect(fromWasm).toHaveLength(LEN);
    expect(Array.from(fromNoble)).toEqual(Array.from(fromWasm));
  });
});

// The pure-JS noble path does not support parallelism, and cross-backend byte-agreement is only
// tested at p=1. deriveArgon2id must therefore THROW on p≠1 rather than silently mis-derive a key
// that differs between backends (which would make a wrapped identity undecryptable across devices).
describe("argon2id parallelism guard (p must be 1)", () => {
  afterEach(() => {
    __resetArgon2BackendForTests();
  });

  const salt = new Uint8Array(16).fill(7);

  it.each([2, 3, 4])("rejects p = %i", async (p) => {
    // Throws BEFORE any derivation, so the (otherwise expensive) memory cost is irrelevant here.
    await expect(deriveArgon2id("pw", salt, 8, 1, p, LEN)).rejects.toThrow(/parallelism/i);
  });

  it("still accepts p = 1", async () => {
    await expect(deriveArgon2id("pw", salt, 8, 1, 1, LEN)).resolves.toHaveLength(LEN);
  });
});

// SEC-5: the test-only backend overrides mutate module-global state that could flip the whole app
// to the pure-JS backend. They must be inert (throw) outside NODE_ENV === "test".
describe("SEC-5 argon2 backend overrides are NODE_ENV-gated", () => {
  afterEach(() => {
    __resetArgon2BackendForTests();
  });

  it("__setArgon2BackendForTests / __resetArgon2BackendForTests throw when NODE_ENV is not 'test'", () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(() => __setArgon2BackendForTests("noble")).toThrow(/test-only/i);
      expect(() => __resetArgon2BackendForTests()).toThrow(/test-only/i);
    } finally {
      // Restore BEFORE afterEach runs — afterEach itself calls the (now-gated) reset helper.
      process.env.NODE_ENV = original;
    }
  });
});
