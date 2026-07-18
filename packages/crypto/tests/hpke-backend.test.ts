import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetKemBackendForTests,
  __setKemBackendForTests,
  deriveKeypairFromIkm,
  exportRawPublicKey,
  getActiveKemBackend,
} from "../src/hpke.js";

// Exercises the capability-based KEM backend selection in hpke.ts: the default auto-detect path
// (Node has subtle X25519 -> native) and the fallback path taken when crypto.subtle lacks
// X25519 (Hermes -> noble). We perturb crypto.subtle.generateKey rather than the deep internals
// so the public selection behavior is what is under test. Because the two backends produce
// byte-identical output, asserting on the public key alone can NEVER prove which backend ran
// (this is exactly how SEC-1's broken probe went unnoticed) — so every case also asserts the
// backend *identity* via getActiveKemBackend().

const IKM = new Uint8Array(32).fill(0x42);
// Byte-identical across backends, so we assert against the known interop vector public key.
const EXPECTED_PUB_HEX = "ae3bf1cd87c2d2ed25af4a1a239eed04a990f00e7403e4c8065927de010fd17a";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("hpke KEM backend auto-selection", () => {
  afterEach(() => {
    __resetKemBackendForTests();
    vi.restoreAllMocks();
  });

  it("auto-detects the native backend when crypto.subtle supports X25519 (Node default)", async () => {
    __resetKemBackendForTests();
    // Node 22 has a spec-compliant Web Crypto X25519, so the probe MUST select the native KEM.
    // This is the SEC-1 regression guard: the old empty-usages probe threw SyntaxError here and
    // silently fell through to noble.
    expect(await getActiveKemBackend()).toBe("native");
    const kp = await deriveKeypairFromIkm(IKM);
    expect(toHex(await exportRawPublicKey(kp.publicKey))).toBe(EXPECTED_PUB_HEX);
  });

  it("probes X25519 with valid ('deriveBits') usages, not an empty usages array", async () => {
    __resetKemBackendForTests();
    const spy = vi.spyOn(crypto.subtle, "generateKey");
    // Force the memoized suite to build, which runs the capability probe exactly once.
    expect(await getActiveKemBackend()).toBe("native");
    const x25519Calls = spy.mock.calls.filter(([algorithm]) => {
      const name = typeof algorithm === "string" ? algorithm : algorithm.name;
      return name === "X25519";
    });
    expect(x25519Calls.length).toBeGreaterThan(0);
    for (const [, , usages] of x25519Calls) {
      // A spec-mandated SyntaxError is thrown for empty usages regardless of X25519 support;
      // requiring "deriveBits" is what makes the probe actually detect native support.
      expect(usages).toEqual(["deriveBits"]);
    }
  });

  it("falls back to the noble backend when crypto.subtle.generateKey rejects X25519", async () => {
    __resetKemBackendForTests();
    // Simulate Hermes: subtle exists but throws NotSupportedError for X25519. For any other
    // algorithm we delegate to the real implementation so the mock is harmless even if a
    // parallel test in the same worker happens to call generateKey while it is installed.
    const real = crypto.subtle.generateKey.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, "generateKey").mockImplementation(((
      algorithm: AlgorithmIdentifier,
      ...rest: unknown[]
    ) => {
      const name = typeof algorithm === "string" ? algorithm : algorithm.name;
      if (name === "X25519") {
        return Promise.reject(new Error("NotSupportedError"));
      }
      // biome-ignore lint/suspicious/noExplicitAny: delegating untouched args to the real API
      return (real as any)(algorithm, ...rest);
    }) as typeof crypto.subtle.generateKey);

    // When the native probe rejects, selection must land on the pure-JS noble KEM.
    expect(await getActiveKemBackend()).toBe("noble");
    const kp = await deriveKeypairFromIkm(IKM);
    // noble path produces the same byte-identical public key.
    expect(toHex(await exportRawPublicKey(kp.publicKey))).toBe(EXPECTED_PUB_HEX);
    expect(spy).toHaveBeenCalled();
  });

  it("honors the test-only override and still interops (forced noble)", async () => {
    __setKemBackendForTests("noble");
    expect(await getActiveKemBackend()).toBe("noble");
    const kp = await deriveKeypairFromIkm(IKM);
    expect(toHex(await exportRawPublicKey(kp.publicKey))).toBe(EXPECTED_PUB_HEX);
  });

  it("honors the test-only override (forced native)", async () => {
    __setKemBackendForTests("native");
    expect(await getActiveKemBackend()).toBe("native");
    const kp = await deriveKeypairFromIkm(IKM);
    expect(toHex(await exportRawPublicKey(kp.publicKey))).toBe(EXPECTED_PUB_HEX);
  });

  // SEC-5: the overrides mutate module-global singleton state (forcedBackend + the memoized suite)
  // that would flip the whole app to the pure-JS noble KEM. They must be inert (throw) outside test.
  it("__setKemBackendForTests / __resetKemBackendForTests throw when NODE_ENV is not 'test'", () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(() => __setKemBackendForTests("noble")).toThrow(/test-only/i);
      expect(() => __resetKemBackendForTests()).toThrow(/test-only/i);
    } finally {
      // Restore BEFORE afterEach runs — afterEach itself calls the (now-gated) reset helper.
      process.env.NODE_ENV = original;
    }
  });
});
