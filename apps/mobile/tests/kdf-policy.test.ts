import { generateIdentity, type WrappedKey, wrapPrivateKey } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { MOBILE_KDF_PARAMS, needsRewrap } from "@/src/identity/kdf-policy";

// needsRewrap decides whether an at-rest envelope should be lazily re-wrapped under the lighter
// mobile params after unlock. These tests pin the OR semantics over BOTH cost dimensions (mKib, t),
// plus idempotency and the malformed-envelope contract. (The state machine exercises needsRewrap
// transitively; this exercises the real predicate directly so every branch is covered.)

describe("kdf-policy", () => {
  it("MOBILE_KDF_PARAMS are the light params {mKib:2048,t:1,p:1}", () => {
    expect(MOBILE_KDF_PARAMS).toEqual({ mKib: 2048, t: 1, p: 1 });
  });

  describe("needsRewrap", () => {
    it("returns false for an envelope already at the mobile params (idempotent)", async () => {
      const id = await generateIdentity();
      const light = await wrapPrivateKey(id, "device secret", MOBILE_KDF_PARAMS);
      expect(needsRewrap(light)).toBe(false);
    });

    it("returns true when the memory cost exceeds the mobile params", async () => {
      const id = await generateIdentity();
      const heavy = await wrapPrivateKey(id, "passphrase"); // default OWASP m=65536
      expect(needsRewrap(heavy)).toBe(true);
    }, 30000);

    it("returns true when ONLY the time cost exceeds the mobile params", async () => {
      // Same light memory (2048) but t=3 > 1 — exercises the `|| params.t >` branch that no
      // real-world envelope hits today.
      const id = await generateIdentity();
      const tHeavy = await wrapPrivateKey(id, "device secret", { mKib: 2048, t: 3, p: 1 });
      expect(needsRewrap(tHeavy)).toBe(true);
    });

    it("throws on a malformed envelope (the unlock flow swallows this in a try/catch)", () => {
      expect(() => needsRewrap("not an envelope" as WrappedKey)).toThrow();
    });
  });
});
