import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/aad.js";
import { exportPublicKey, generateIdentity, importPublicKey } from "../src/identity.js";
import { open, seal } from "../src/seal.js";
import { __test_only_identityFromIKM } from "../src/test-only.js";

describe("__test_only_identityFromIKM", () => {
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("throws when NODE_ENV is not 'test'", async () => {
    process.env.NODE_ENV = "production";
    await expect(__test_only_identityFromIKM(new Uint8Array(32))).rejects.toThrow(/test-only/i);
  });

  it("returns a usable identity when NODE_ENV is 'test'", async () => {
    process.env.NODE_ENV = "test";
    const ikm = new Uint8Array(32);
    for (let i = 0; i < ikm.length; i++) ikm[i] = 0x42;
    const id = await __test_only_identityFromIKM(ikm);
    expect(id).toBeTruthy();
    const pk = exportPublicKey(id);
    expect(pk.startsWith("amk1:")).toBe(true);
  });

  it("produces deterministic keypairs for the same IKM", async () => {
    process.env.NODE_ENV = "test";
    const ikm = new Uint8Array(32);
    for (let i = 0; i < ikm.length; i++) ikm[i] = 0x11;
    const a = await __test_only_identityFromIKM(ikm);
    const b = await __test_only_identityFromIKM(ikm);
    expect(exportPublicKey(a)).toBe(exportPublicKey(b));
  });

  it("produces different keypairs for different IKMs", async () => {
    process.env.NODE_ENV = "test";
    const ikm1 = new Uint8Array(32);
    const ikm2 = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      ikm1[i] = 0xaa;
      ikm2[i] = 0xbb;
    }
    const a = await __test_only_identityFromIKM(ikm1);
    const b = await __test_only_identityFromIKM(ikm2);
    expect(exportPublicKey(a)).not.toBe(exportPublicKey(b));
  });

  it("the derived identity can decrypt a message sealed for its public key", async () => {
    process.env.NODE_ENV = "test";
    const ikm = new Uint8Array(32);
    for (let i = 0; i < ikm.length; i++) ikm[i] = 0x33;
    const id = await __test_only_identityFromIKM(ikm);
    const recipientPk = await importPublicKey(exportPublicKey(id));
    const plaintext = new TextEncoder().encode("via IKM");
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(plaintext, recipientPk, ctx);
    const recovered = await open(ct, id, ctx);
    expect(new TextDecoder().decode(recovered)).toBe("via IKM");
    void generateIdentity;
  });
});
