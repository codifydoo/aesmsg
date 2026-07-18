import { describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/aad.js";
import { DecryptionError, RecipientMismatchError } from "../src/errors.js";
import { exportPublicKey, generateIdentity, importPublicKey } from "../src/identity.js";
import { open, seal } from "../src/seal.js";
import type { Ciphertext } from "../src/types.js";

describe("seal / open", () => {
  it("round-trips a short message", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const plaintext = new TextEncoder().encode("hello world");
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };

    const ct = await seal(plaintext, recipientPk, ctx);
    const recovered = await open(ct, recipient, ctx);
    expect(new TextDecoder().decode(recovered)).toBe("hello world");
  });

  it("fails to open with the wrong identity", async () => {
    const recipientA = await generateIdentity();
    const recipientB = await generateIdentity();
    const recipientAPk = await importPublicKey(exportPublicKey(recipientA));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipientA),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };

    const ct = await seal(new TextEncoder().encode("for A only"), recipientAPk, ctx);
    await expect(open(ct, recipientB, ctx)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails to open with the wrong AAD", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctxSeal: MessageBindingContext = {
      linkId: "link-1-aaaaaaaaa",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ctxOpen: MessageBindingContext = {
      linkId: "link-2-bbbbbbbbb",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("bound to link-1"), recipientPk, ctxSeal);
    await expect(open(ct, recipient, ctxOpen)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails to open a single-byte-tampered ciphertext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), recipientPk, ctx);

    const ctBytes = ct as unknown as Uint8Array;
    const tampered = new Uint8Array(ctBytes);
    const lastIdx = tampered.length - 1;
    tampered[lastIdx] = (tampered[lastIdx] ?? 0) ^ 0x01;
    await expect(open(tampered as unknown as Ciphertext, recipient, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("fails to open a truncated ciphertext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), recipientPk, ctx);

    const ctBytes = ct as unknown as Uint8Array;
    const truncated = ctBytes.slice(0, ctBytes.length - 1);
    await expect(open(truncated as unknown as Ciphertext, recipient, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("fails to open a too-short blob", async () => {
    const recipient = await generateIdentity();
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const tiny = new Uint8Array([0x01, 0x01, 0x00]) as unknown as Ciphertext;
    await expect(open(tiny, recipient, ctx)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails to open a blob with the wrong version byte", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), recipientPk, ctx);
    const tampered = new Uint8Array(ct as unknown as Uint8Array);
    tampered[0] = 0x99;
    await expect(open(tampered as unknown as Ciphertext, recipient, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("fails to open a blob with the wrong suite byte", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), recipientPk, ctx);
    const tampered = new Uint8Array(ct as unknown as Uint8Array);
    tampered[1] = 0x99;
    await expect(open(tampered as unknown as Ciphertext, recipient, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("round-trips a v2 message (createdAtMs omitted)", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("v2 secret"), recipientPk, ctx);
    const recovered = await open(ct, recipient, ctx);
    expect(new TextDecoder().decode(recovered)).toBe("v2 secret");
  });

  it("does NOT open a v2-sealed blob if the caller later supplies a createdAtMs (no two-AAD acceptance)", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const sealCtx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("v2 only"), recipientPk, sealCtx);
    // Opening with createdAtMs present selects the v1 AAD deterministically -> must fail.
    await expect(
      open(ct, recipient, { ...sealCtx, createdAtMs: 1_700_000_000_000 }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("does NOT open a v1-sealed blob if the caller omits createdAtMs", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const sealCtx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("v1 only"), recipientPk, sealCtx);
    const { createdAtMs: _drop, ...v2Ctx } = sealCtx;
    await expect(open(ct, recipient, v2Ctx)).rejects.toBeInstanceOf(DecryptionError);
  });

  // SEC-2: seal must refuse to encrypt to one key while binding the AAD to a different key.
  describe("SEC-2 recipient / AAD consistency", () => {
    it("throws RecipientMismatchError when `recipient` differs from context.recipientPublicKey (no ciphertext produced)", async () => {
      const recipientA = await generateIdentity();
      const recipientB = await generateIdentity();
      const recipientAPk = await importPublicKey(exportPublicKey(recipientA));
      // Seal to A, but bind the AAD to B's public key — the exact silent footgun SEC-2 describes.
      const mismatchedCtx: MessageBindingContext = {
        linkId: "abcdefghij012345",
        recipientPublicKey: exportPublicKey(recipientB),
        createdAtMs: 1_700_000_000_000,
        expiresAtMs: 1_700_086_400_000,
        maxOpens: 1,
      };
      await expect(
        seal(new TextEncoder().encode("who am I for?"), recipientAPk, mismatchedCtx),
      ).rejects.toBeInstanceOf(RecipientMismatchError);
    });

    it("still seals when `recipient` and context.recipientPublicKey name the same key", async () => {
      const recipient = await generateIdentity();
      const recipientPk = await importPublicKey(exportPublicKey(recipient));
      const ctx: MessageBindingContext = {
        linkId: "abcdefghij012345",
        recipientPublicKey: exportPublicKey(recipient),
        createdAtMs: 1_700_000_000_000,
        expiresAtMs: 1_700_086_400_000,
        maxOpens: 1,
      };
      const ct = await seal(new TextEncoder().encode("matched"), recipientPk, ctx);
      expect(await open(ct, recipient, ctx).then((b) => new TextDecoder().decode(b))).toBe(
        "matched",
      );
    });

    it("throws (loudly) when context.recipientPublicKey is not a well-formed amk1 key", async () => {
      const recipient = await generateIdentity();
      const recipientPk = await importPublicKey(exportPublicKey(recipient));
      const badCtx = {
        linkId: "abcdefghij012345",
        recipientPublicKey: "not-a-real-key",
        createdAtMs: 1_700_000_000_000,
        expiresAtMs: 1_700_086_400_000,
        maxOpens: 1,
      } as unknown as MessageBindingContext;
      await expect(seal(new TextEncoder().encode("x"), recipientPk, badCtx)).rejects.toBeInstanceOf(
        Error,
      );
    });
  });

  // SEC-4: server-supplied bad metadata makes encodeAad throw inside open(); it must classify as a
  // TERMINAL DecryptionError (mapped to the "failed" reader screen), never a retryable network error.
  describe("SEC-4 encodeAad failure in open() is a terminal decrypt error", () => {
    async function sealValid(): Promise<{
      ct: Ciphertext;
      recipient: Awaited<ReturnType<typeof generateIdentity>>;
      ctx: MessageBindingContext;
    }> {
      const recipient = await generateIdentity();
      const recipientPk = await importPublicKey(exportPublicKey(recipient));
      const ctx: MessageBindingContext = {
        linkId: "abcdefghij012345",
        recipientPublicKey: exportPublicKey(recipient),
        expiresAtMs: 1_700_086_400_000,
        maxOpens: 1,
      };
      const ct = await seal(new TextEncoder().encode("terminal"), recipientPk, ctx);
      return { ct, recipient, ctx };
    }

    it("maps maxOpens: 0 (bad server metadata) to DecryptionError, not a raw Error", async () => {
      const { ct, recipient, ctx } = await sealValid();
      const rejection = open(ct, recipient, { ...ctx, maxOpens: 0 });
      await expect(rejection).rejects.toBeInstanceOf(DecryptionError);
    });

    it("maps expiresAtMs <= createdAtMs to DecryptionError", async () => {
      const { ct, recipient, ctx } = await sealValid();
      await expect(
        open(ct, recipient, { ...ctx, createdAtMs: 1_700_086_400_000 }),
      ).rejects.toBeInstanceOf(DecryptionError);
    });

    it("maps a non-integer maxOpens to DecryptionError", async () => {
      const { ct, recipient, ctx } = await sealValid();
      await expect(open(ct, recipient, { ...ctx, maxOpens: 1.5 })).rejects.toBeInstanceOf(
        DecryptionError,
      );
    });
  });

  it("produces a blob whose first two bytes are the version + suite header", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), recipientPk, ctx);
    const ctBytes = ct as unknown as Uint8Array;
    expect(ctBytes[0]).toBe(0x01);
    expect(ctBytes[1]).toBe(0x01);
  });
});
