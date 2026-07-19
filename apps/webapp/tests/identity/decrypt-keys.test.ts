import {
  type Ciphertext,
  DecryptionError,
  decodePayload,
  encodePayload,
  exportPublicKey,
  generateIdentity,
  type IdentityKeypair,
  InvalidFormatError,
  importPublicKey,
  type MessageBindingContext,
  open,
  seal,
} from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";
import { allPrivateKeysForDecrypt, decryptWithKeyFallback } from "@/src/identity/decrypt-keys";

const ID = "abcdefghijkl0123";

describe("allPrivateKeysForDecrypt", () => {
  it("returns the active key first, then the retired keys in order", async () => {
    const active = await generateIdentity();
    const r1 = await generateIdentity();
    const r2 = await generateIdentity();
    expect(allPrivateKeysForDecrypt(active, [r1, r2])).toEqual([active, r1, r2]);
    expect(allPrivateKeysForDecrypt(active, [])).toEqual([active]);
  });
});

describe("decryptWithKeyFallback", () => {
  it("returns the first key's result when it succeeds", async () => {
    const keys = [{} as IdentityKeypair, {} as IdentityKeypair];
    const attempt = vi.fn(async () => "first");
    expect(await decryptWithKeyFallback(keys, attempt)).toBe("first");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("advances past a DecryptionError to the next key", async () => {
    const keys = ["a", "b"] as unknown as IdentityKeypair[];
    const attempt = vi.fn(async (key: IdentityKeypair) => {
      if ((key as unknown as string) === "a") throw new DecryptionError();
      return "second";
    });
    expect(await decryptWithKeyFallback(keys, attempt)).toBe("second");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("throws a DecryptionError when every key fails (and when the set is empty)", async () => {
    const keys = [{} as IdentityKeypair, {} as IdentityKeypair];
    const attempt = vi.fn(async () => {
      throw new DecryptionError();
    });
    await expect(decryptWithKeyFallback(keys, attempt)).rejects.toBeInstanceOf(DecryptionError);
    await expect(decryptWithKeyFallback([], attempt)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("rethrows a non-DecryptionError IMMEDIATELY without trying further keys", async () => {
    const keys = [{} as IdentityKeypair, {} as IdentityKeypair];
    const attempt = vi.fn(async () => {
      // A malformed payload after a successful open can only come from the key that decrypted.
      throw new InvalidFormatError("bad payload");
    });
    await expect(decryptWithKeyFallback(keys, attempt)).rejects.toBeInstanceOf(InvalidFormatError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("REAL CRYPTO: a message sealed to A opens under the key set [B, A]", async () => {
    const a = await generateIdentity();
    const b = await generateIdentity();
    const aPk = exportPublicKey(a);
    const expiresAtMs = Date.now() + 60_000;
    const maxOpens = 1;
    const context: MessageBindingContext = {
      linkId: ID,
      recipientPublicKey: aPk,
      expiresAtMs,
      maxOpens,
    };
    const sealed = await seal(
      encodePayload({ text: "legacy", attachments: [] }),
      await importPublicKey(aPk),
      context,
    );

    // Each attempt re-derives the AAD from the tried key's OWN public key (as the reader does).
    const attempt = (key: IdentityKeypair) => {
      const ownPk = exportPublicKey(key);
      const ctx: MessageBindingContext = {
        linkId: ID,
        recipientPublicKey: ownPk,
        expiresAtMs,
        maxOpens,
      };
      return open(sealed as unknown as Ciphertext, key, ctx).then((pt) => decodePayload(pt).text);
    };

    // B is tried first (wrong key → DecryptionError), then A opens it.
    expect(await decryptWithKeyFallback([b, a], attempt)).toBe("legacy");
    // Neither key opens a message sealed to an unrelated identity.
    const c = await generateIdentity();
    await expect(decryptWithKeyFallback([b, c], attempt)).rejects.toBeInstanceOf(DecryptionError);
  });
});
