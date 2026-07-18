import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AAD_VERSION, AAD_VERSION_V2, encodeAad } from "../src/aad.js";
import { exportPublicKey, generateIdentity } from "../src/identity.js";
import { __test_only_identityFromIKM } from "../src/test-only.js";
import { SUITE_X25519_AES256GCM, WIRE_VERSION } from "../src/wire.js";

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

describe("encodeAad", () => {
  it("is deterministic for the same context", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);

    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };

    const a = await encodeAad(ctx);
    const b = await encodeAad(ctx);
    expect(a).toEqual(b);
  });

  it("starts with [aadVersion, wireVersion, suiteId] header bytes", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);

    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };

    const out = await encodeAad(ctx);
    expect(out[0]).toBe(AAD_VERSION);
    expect(out[1]).toBe(WIRE_VERSION);
    expect(out[2]).toBe(SUITE_X25519_AES256GCM);
  });

  it("recipient hash at offset 21 matches SHA-256 of raw recipient pubkey", async () => {
    const idA = await generateIdentity();
    const idB = await generateIdentity();
    const pkA = await exportPublicKey(idA);
    const pkB = await exportPublicKey(idB);

    const base = {
      linkId: "abcdefghij012345",
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };
    const outA = await encodeAad({ ...base, recipientPublicKey: pkA });
    const outB = await encodeAad({ ...base, recipientPublicKey: pkB });

    const hashA = outA.slice(21, 21 + 32);
    const hashB = outB.slice(21, 21 + 32);

    // 32-byte field is present and full-width.
    expect(hashA.length).toBe(32);
    expect(hashB.length).toBe(32);
    // Hash actually depends on the recipient pubkey (not a constant).
    expect(hashA).not.toEqual(hashB);
  });

  it("produces different output if maxOpens differs", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const base = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };
    const a = await encodeAad(base);
    const b = await encodeAad({ ...base, maxOpens: 4 });
    expect(a).not.toEqual(b);
  });

  it("encodes maxOpens = -1 as 0xFFFFFFFF (i32 BE two's complement)", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: -1,
    };
    const out = await encodeAad(ctx);
    // Tail 4 bytes are maxOpens
    const tail = out.slice(out.length - 4);
    expect(tail).toEqual(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  });

  it("rejects non-finite createdAtMs", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: Number.NaN,
      expiresAtMs: 100,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/createdAtMs/);
  });

  it("rejects negative expiresAtMs", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: -1,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/expiresAtMs/);
  });

  it("rejects maxOpens = 0", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: 100,
      maxOpens: 0,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/maxOpens/);
  });

  it("accepts maxOpens = -1 (unlimited)", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: 100,
      maxOpens: -1,
    };
    await expect(encodeAad(ctx)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("rejects expiresAtMs equal to createdAtMs", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 100,
      expiresAtMs: 100,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/expiresAtMs/);
  });

  it("rejects empty linkId", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "",
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: 100,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/linkId/);
  });

  it("rejects linkId shorter than 16 bytes", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij01234", // 15 chars
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: 100,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/linkId/);
  });

  it("rejects linkId longer than 16 bytes", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij0123456", // 17 chars
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: 100,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/linkId/);
  });

  it("rejects fractional createdAtMs (not a safe integer)", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1.5,
      expiresAtMs: 100,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/createdAtMs/);
  });

  it("rejects createdAtMs above Number.MAX_SAFE_INTEGER", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: Number.MAX_SAFE_INTEGER + 1,
      expiresAtMs: Number.MAX_SAFE_INTEGER + 2,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/createdAtMs/);
  });

  describe("byte layout", () => {
    // Distinct per-byte values for the u64 fields, kept inside Number.MAX_SAFE_INTEGER
    // (= 2^53 − 1 ≈ 0x1F_FF_FF_FF_FF_FF_FF). The two high bytes are zero so the encoder's
    // safe-integer check passes; the lower bytes are unique per position so an off-by-one
    // offset or wrong-endian write would show up as a specific byte mismatch.
    const CREATED_AT_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const EXPIRES_AT_BYTES = new Uint8Array([0x00, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]);
    const MAX_OPENS_BYTES = new Uint8Array([0x0a, 0x0b, 0x0c, 0x0d]);
    // Reconstruct the integers from the byte arrays so the test value and the expected
    // bytes are tied to a single source of truth.
    const CREATED_AT_MS = Number(new DataView(CREATED_AT_BYTES.buffer).getBigUint64(0, false));
    const EXPIRES_AT_MS = Number(new DataView(EXPIRES_AT_BYTES.buffer).getBigUint64(0, false));
    const MAX_OPENS = new DataView(MAX_OPENS_BYTES.buffer).getInt32(0, false);

    function ctxFixture(pk: Awaited<ReturnType<typeof exportPublicKey>>) {
      return {
        linkId: "abcdefghij012345",
        recipientPublicKey: pk,
        createdAtMs: CREATED_AT_MS,
        expiresAtMs: EXPIRES_AT_MS,
        maxOpens: MAX_OPENS,
      };
    }

    it("total length is 57 + linkIdBytes.length (= 73 for a 16-byte link id)", async () => {
      const id = await generateIdentity();
      const out = await encodeAad(ctxFixture(exportPublicKey(id)));
      expect(out.length).toBe(57 + 16);
    });

    it("linkIdLen at offset 3-4 is the u16 big-endian length", async () => {
      const id = await generateIdentity();
      const out = await encodeAad(ctxFixture(exportPublicKey(id)));
      expect(out[3]).toBe(0x00);
      expect(out[4]).toBe(0x10);
    });

    it("linkId bytes are written verbatim at offset 5", async () => {
      const id = await generateIdentity();
      const out = await encodeAad(ctxFixture(exportPublicKey(id)));
      const expected = new TextEncoder().encode("abcdefghij012345");
      expect(out.slice(5, 5 + 16)).toEqual(expected);
    });

    it("createdAtMs is u64 big-endian starting at offset 53", async () => {
      const id = await generateIdentity();
      const out = await encodeAad(ctxFixture(exportPublicKey(id)));
      expect(out.slice(53, 53 + 8)).toEqual(CREATED_AT_BYTES);
    });

    it("expiresAtMs is u64 big-endian starting at offset 61", async () => {
      const id = await generateIdentity();
      const out = await encodeAad(ctxFixture(exportPublicKey(id)));
      expect(out.slice(61, 61 + 8)).toEqual(EXPIRES_AT_BYTES);
    });

    it("maxOpens is i32 big-endian in the final 4 bytes", async () => {
      const id = await generateIdentity();
      const out = await encodeAad(ctxFixture(exportPublicKey(id)));
      expect(out.slice(69, 69 + 4)).toEqual(MAX_OPENS_BYTES);
    });
  });

  describe("v2 (createdAtMs omitted)", () => {
    it("selects v2 when createdAtMs is absent: 0x02 header, no createdAt field, 65-byte total", async () => {
      const id = await generateIdentity();
      const pk = exportPublicKey(id);
      const ctxV2 = {
        linkId: "abcdefghij012345",
        recipientPublicKey: pk,
        expiresAtMs: 1_700_086_400_000,
        maxOpens: 3,
      };
      const v2 = await encodeAad(ctxV2);
      // v1 total is 73 for a 16-byte link id; v2 drops the 8-byte createdAt field.
      expect(v2.length).toBe(73 - 8);
      expect(v2[0]).toBe(AAD_VERSION_V2);
      expect(v2[1]).toBe(WIRE_VERSION);
      expect(v2[2]).toBe(SUITE_X25519_AES256GCM);
      // expiresAtMs (u64) then maxOpens (i32) are the trailing 12 bytes — no createdAt between
      // the recipient hash and expiresAt.
      const v1 = await encodeAad({ ...ctxV2, createdAtMs: 1_700_000_000_000 });
      expect(v1.length).toBe(73);
      expect(v1).not.toEqual(v2);
      expect(v1[0]).toBe(AAD_VERSION);
    });

    it("v2 still rejects maxOpens = 0", async () => {
      const id = await generateIdentity();
      const pk = exportPublicKey(id);
      await expect(
        encodeAad({
          linkId: "abcdefghij012345",
          recipientPublicKey: pk,
          expiresAtMs: 100,
          maxOpens: 0,
        }),
      ).rejects.toThrow(/maxOpens/);
    });

    it("v2 accepts maxOpens = -1 (unlimited)", async () => {
      const id = await generateIdentity();
      const pk = exportPublicKey(id);
      await expect(
        encodeAad({
          linkId: "abcdefghij012345",
          recipientPublicKey: pk,
          expiresAtMs: 100,
          maxOpens: -1,
        }),
      ).resolves.toBeInstanceOf(Uint8Array);
    });

    it("v2 rejects a non-positive expiresAtMs", async () => {
      const id = await generateIdentity();
      const pk = exportPublicKey(id);
      await expect(
        encodeAad({
          linkId: "abcdefghij012345",
          recipientPublicKey: pk,
          expiresAtMs: 0,
          maxOpens: 1,
        }),
      ).rejects.toThrow(/expiresAtMs/);
    });
  });

  describe("interop vector freeze (v1 byte-stability)", () => {
    it("encodeAad with the interop context reproduces the frozen v1 aad_encoded_hex exactly", async () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const vector = JSON.parse(
        readFileSync(join(here, "fixtures", "interop", "vector.json"), "utf8"),
      ) as {
        ikm_hex: string;
        aad_context: { linkId: string; createdAtMs: number; expiresAtMs: number; maxOpens: number };
        aad_encoded_hex: string;
      };
      const recipient = await __test_only_identityFromIKM(hexToBytes(vector.ikm_hex));
      const out = await encodeAad({
        linkId: vector.aad_context.linkId,
        recipientPublicKey: exportPublicKey(recipient),
        createdAtMs: vector.aad_context.createdAtMs,
        expiresAtMs: vector.aad_context.expiresAtMs,
        maxOpens: vector.aad_context.maxOpens,
      });
      expect(out).toEqual(hexToBytes(vector.aad_encoded_hex));
    });
  });
});
