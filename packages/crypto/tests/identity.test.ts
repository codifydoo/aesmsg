import { describe, expect, it } from "vitest";
import { InvalidFormatError } from "../src/errors.js";
import { exportPublicKey, generateIdentity, importPublicKey } from "../src/identity.js";
import { PUBKEY_PREFIX } from "../src/wire.js";

describe("identity", () => {
  it("generateIdentity returns an opaque keypair", async () => {
    const id = await generateIdentity();
    expect(id).toBeTruthy();
  });

  it("exportPublicKey returns an amk1: string of length 51", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    expect(typeof pk).toBe("string");
    expect(pk.startsWith(PUBKEY_PREFIX)).toBe(true);
    expect(pk).toHaveLength(51);
  });

  it("exportPublicKey is deterministic for a given identity", async () => {
    const id = await generateIdentity();
    const a = exportPublicKey(id);
    const b = exportPublicKey(id);
    expect(a).toBe(b);
  });

  it("two generated identities have distinct public keys", async () => {
    const a = exportPublicKey(await generateIdentity());
    const b = exportPublicKey(await generateIdentity());
    expect(a).not.toBe(b);
  });

  it("importPublicKey accepts an exported amk1: string and returns a usable RecipientPublicKey", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const recipient = await importPublicKey(pk);
    expect(recipient).toBeTruthy();
  });

  it("importPublicKey rejects an empty string", async () => {
    await expect(importPublicKey("")).rejects.toBeInstanceOf(InvalidFormatError);
  });

  it("importPublicKey rejects strings without the amk1: prefix", async () => {
    await expect(importPublicKey("hello world")).rejects.toBeInstanceOf(InvalidFormatError);
  });

  it("importPublicKey rejects amk1: strings whose body is not base64url", async () => {
    await expect(importPublicKey("amk1:!!!")).rejects.toBeInstanceOf(InvalidFormatError);
  });
});
