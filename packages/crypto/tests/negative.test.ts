import { describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/aad.js";
import { DecryptionError, InvalidFormatError } from "../src/errors.js";
import { fingerprint } from "../src/fingerprint.js";
import { exportPublicKey, generateIdentity, importPublicKey } from "../src/identity.js";
import { open, seal } from "../src/seal.js";
import type { Ciphertext, PublicKeyString } from "../src/types.js";
import {
  base64urlEncode,
  CANONICAL_PUBKEY_LEN,
  CIPHERTEXT_PREFIX_LEN,
  PUBKEY_PREFIX,
  SUITE_X25519_AES256GCM,
  WIRE_VERSION,
} from "../src/wire.js";

const CREATED_AT = 1_700_000_000_000;
const EXPIRES_AT = 1_700_086_400_000;

describe("importPublicKey rejects malformed input", () => {
  const rejects = (s: string) => async () => {
    await expect(importPublicKey(s)).rejects.toBeInstanceOf(InvalidFormatError);
  };

  it("empty string", rejects(""));
  it("whitespace", rejects("   "));
  it("no prefix", rejects("hello"));
  it("wrong prefix (ssk2:)", rejects(`ssk2:${base64urlEncode(new Uint8Array(34))}`));
  it("wrong prefix (sskx:)", rejects(`sskx:${base64urlEncode(new Uint8Array(34))}`));
  it("non-base64url body", rejects("amk1:!!!"));
  it(
    "body decodes to wrong length (33 bytes)",
    rejects(`amk1:${base64urlEncode(new Uint8Array(33))}`),
  );
  it(
    "body decodes to wrong length (35 bytes)",
    rejects(`amk1:${base64urlEncode(new Uint8Array(35))}`),
  );

  it("inner version byte is wrong", async () => {
    const tampered = new Uint8Array(CANONICAL_PUBKEY_LEN);
    tampered[0] = 0x99;
    tampered[1] = SUITE_X25519_AES256GCM;
    await expect(importPublicKey(PUBKEY_PREFIX + base64urlEncode(tampered))).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });

  it("inner suite byte is wrong", async () => {
    const tampered = new Uint8Array(CANONICAL_PUBKEY_LEN);
    tampered[0] = WIRE_VERSION;
    tampered[1] = 0x99;
    await expect(importPublicKey(PUBKEY_PREFIX + base64urlEncode(tampered))).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });
});

describe("fingerprint rejects malformed input", () => {
  it("rejects non-amk1: strings", async () => {
    await expect(fingerprint("garbage" as unknown as PublicKeyString)).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });
});

describe("open rejects every clean-failure path", () => {
  it("wrong identity", async () => {
    const a = await generateIdentity();
    const b = await generateIdentity();
    const aPk = await importPublicKey(exportPublicKey(a));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(a),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), aPk, ctx);
    await expect(open(ct, b, ctx)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("ciphertext mutated at first AEAD byte", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), pk, ctx);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    bytes[CIPHERTEXT_PREFIX_LEN] = (bytes[CIPHERTEXT_PREFIX_LEN] ?? 0) ^ 0x01;
    await expect(open(bytes as unknown as Ciphertext, id, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("ciphertext mutated in the middle", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const buf = new Uint8Array(64);
    crypto.getRandomValues(buf);
    const ct = await seal(buf, pk, ctx);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    const mid = Math.floor(bytes.length / 2);
    bytes[mid] = (bytes[mid] ?? 0) ^ 0x55;
    await expect(open(bytes as unknown as Ciphertext, id, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("ciphertext mutated at the last byte (AEAD tag)", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), pk, ctx);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] ?? 0) ^ 0x01;
    await expect(open(bytes as unknown as Ciphertext, id, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("truncated by 1 byte", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), pk, ctx);
    const bytes = (ct as unknown as Uint8Array).slice(0, -1);
    await expect(open(bytes as unknown as Ciphertext, id, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("empty blob", async () => {
    const id = await generateIdentity();
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    await expect(open(new Uint8Array() as unknown as Ciphertext, id, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("blob shorter than the prefix length (33 bytes)", async () => {
    const id = await generateIdentity();
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const tiny = new Uint8Array(33);
    tiny[0] = WIRE_VERSION;
    tiny[1] = SUITE_X25519_AES256GCM;
    await expect(open(tiny as unknown as Ciphertext, id, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("AAD changed", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    // Use two contexts differing in linkId — same effect as the old "link-1" vs "link-2" AAD mismatch.
    const ctxSeal: MessageBindingContext = {
      linkId: "link-1-aaaaaaaaa",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ctxOpen: MessageBindingContext = {
      linkId: "link-2-bbbbbbbbb",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), pk, ctxSeal);
    await expect(open(ct, id, ctxOpen)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("AAD differing in one byte fails open", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    // Both link ids are exactly 16 bytes (the canonical wire invariant); they differ by one
    // character. Original test intent: any single-byte AAD difference fails authentication.
    const ctxSeal: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ctxOpen: MessageBindingContext = {
      linkId: "abcdefghij012346",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), pk, ctxSeal);
    await expect(open(ct, id, ctxOpen)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("blob with wrong version byte", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), pk, ctx);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    bytes[0] = 0x99;
    await expect(open(bytes as unknown as Ciphertext, id, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("blob with wrong suite byte", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(id),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("hi"), pk, ctx);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    bytes[1] = 0x99;
    await expect(open(bytes as unknown as Ciphertext, id, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });
});

describe("AAD tamper resistance (per-field)", () => {
  async function setupCtx(): Promise<{
    recipient: Awaited<ReturnType<typeof generateIdentity>>;
    recipientPk: ReturnType<typeof exportPublicKey>;
    ctx: MessageBindingContext;
  }> {
    const recipient = await generateIdentity();
    const recipientPk = exportPublicKey(recipient);
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: recipientPk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };
    return { recipient, recipientPk, ctx };
  }

  it("wrong linkId fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(
      open(ct, recipient, { ...ctx, linkId: "zzzzzzzzzz012345" }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("wrong recipient pubkey in context fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const other = await generateIdentity();
    const otherPk = exportPublicKey(other);
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(
      open(ct, recipient, { ...ctx, recipientPublicKey: otherPk }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("wrong createdAtMs fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    // ctx carries createdAtMs (v1); opening with a different createdAtMs is still v1 but a
    // mismatched AAD, so it must fail.
    await expect(
      open(ct, recipient, { ...ctx, createdAtMs: (ctx.createdAtMs ?? 0) + 1 }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("wrong expiresAtMs fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(
      open(ct, recipient, { ...ctx, expiresAtMs: ctx.expiresAtMs + 1 }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("wrong maxOpens fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(
      open(ct, recipient, { ...ctx, maxOpens: ctx.maxOpens + 1 }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});
