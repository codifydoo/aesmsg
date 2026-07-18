import { DecryptionError, type IdentityKeypair } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { allPrivateKeysForDecrypt, decryptWithKeyFallback } from "@/src/identity/decrypt-keys";
import type { IdentityState } from "@/src/identity/identity-machine";

// Pure tests for the reader's decrypt-fallback API — the ordered key set + try-active-then-retired.

// Opaque keypair stand-ins; the fallback only forwards them to `attempt` and never inspects them.
const active = { id: "active" } as unknown as IdentityKeypair;
const retired1 = { id: "retired1" } as unknown as IdentityKeypair;
const retired2 = { id: "retired2" } as unknown as IdentityKeypair;

describe("allPrivateKeysForDecrypt", () => {
  it("returns [] for non-unlocked states", () => {
    expect(allPrivateKeysForDecrypt({ status: "loading" })).toEqual([]);
    expect(allPrivateKeysForDecrypt({ status: "no_identity" })).toEqual([]);
    expect(allPrivateKeysForDecrypt({ status: "locked" })).toEqual([]);
  });

  it("returns active first, then retired (newest→oldest)", () => {
    const state: IdentityState = {
      status: "unlocked",
      identity: active,
      publicKeyString: "amk1:active" as never,
      retiredKeypairs: [retired1, retired2],
    };
    expect(allPrivateKeysForDecrypt(state)).toEqual([active, retired1, retired2]);
  });
});

describe("decryptWithKeyFallback", () => {
  it("returns the first key that succeeds and stops trying further keys", async () => {
    const tried: IdentityKeypair[] = [];
    const out = await decryptWithKeyFallback([active, retired1, retired2], async (key) => {
      tried.push(key);
      if (key === retired1) return "plaintext";
      throw new DecryptionError();
    });
    expect(out).toBe("plaintext");
    // active failed → retired1 succeeded → retired2 never attempted.
    expect(tried).toEqual([active, retired1]);
  });

  it("succeeds on the active key without touching retired keys", async () => {
    const tried: IdentityKeypair[] = [];
    const out = await decryptWithKeyFallback([active, retired1], async (key) => {
      tried.push(key);
      return "ok";
    });
    expect(out).toBe("ok");
    expect(tried).toEqual([active]);
  });

  it("throws DecryptionError when every key is wrong", async () => {
    await expect(
      decryptWithKeyFallback([active, retired1], async () => {
        throw new DecryptionError();
      }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError on an empty key set", async () => {
    await expect(decryptWithKeyFallback([], async () => "unused")).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("rethrows a NON-decrypt error immediately (right key, bad payload) — does not try other keys", async () => {
    const tried: IdentityKeypair[] = [];
    const boom = new Error("malformed payload");
    await expect(
      decryptWithKeyFallback([active, retired1], async (key) => {
        tried.push(key);
        throw boom;
      }),
    ).rejects.toBe(boom);
    // Stopped at the first key — a non-DecryptionError means that key already decrypted.
    expect(tried).toEqual([active]);
  });
});
