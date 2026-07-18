import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeAad, type MessageBindingContext } from "../../src/aad.js";
import {
  __resetKemBackendForTests,
  __setKemBackendForTests,
  exportRawPublicKey,
  type KemBackend,
} from "../../src/hpke.js";
import { exportPublicKey, importPublicKey } from "../../src/identity.js";
import { open, seal } from "../../src/seal.js";
import { __test_only_identityFromIKM } from "../../src/test-only.js";
import type { Ciphertext, IdentityKeypair, RecipientPublicKey } from "../../src/types.js";

// v2-AAD interop coverage (SEC-8 follow-up). Two guarantees:
//   1. A FROZEN v2 vector (vector-v2.json): its v2 AAD bytes are byte-stable, and its captured
//      ciphertext blob decrypts under BOTH KEM backends — the same cross-impl guard the v1 vector
//      gives, but for the v2 AAD format that is now the default for all new links.
//   2. BIDIRECTIONAL cross-backend round-trips at v2: native seal -> noble open AND noble seal ->
//      native open, proving the two KEM backends are byte-compatible for v2 (not just v1).
//
// KEM CryptoKey objects are backend-specific even though their raw bytes are byte-identical, so a
// blob sealed under one backend must be opened with a key DERIVED under the opening backend (from
// the same IKM). The helpers below scope each operation to a backend, mirroring cross-backend.test.

type V2Vector = {
  ikm_hex: string;
  recipient_pubkey_raw_hex: string;
  aad_context: { linkId: string; expiresAtMs: number; maxOpens: number };
  aad_encoded_hex: string;
  plaintext_utf8: string;
  ciphertext_blob_hex: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const vector: V2Vector = JSON.parse(
  readFileSync(join(here, "..", "fixtures", "interop", "vector-v2.json"), "utf8"),
);

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const toHex = (b: Uint8Array): string =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

async function identityFromIkmUnder(
  backend: KemBackend,
  ikm: Uint8Array,
): Promise<IdentityKeypair> {
  __setKemBackendForTests(backend);
  try {
    return await __test_only_identityFromIKM(ikm);
  } finally {
    __resetKemBackendForTests();
  }
}

async function importPublicKeyUnder(backend: KemBackend, s: string): Promise<RecipientPublicKey> {
  __setKemBackendForTests(backend);
  try {
    return await importPublicKey(s);
  } finally {
    __resetKemBackendForTests();
  }
}

async function sealUnder(
  backend: KemBackend,
  plaintext: Uint8Array,
  recipient: RecipientPublicKey,
  ctx: MessageBindingContext,
): Promise<Ciphertext> {
  __setKemBackendForTests(backend);
  try {
    return await seal(plaintext, recipient, ctx);
  } finally {
    __resetKemBackendForTests();
  }
}

async function openUnder(
  backend: KemBackend,
  ct: Ciphertext,
  id: IdentityKeypair,
  ctx: MessageBindingContext,
): Promise<Uint8Array> {
  __setKemBackendForTests(backend);
  try {
    return await open(ct, id, ctx);
  } finally {
    __resetKemBackendForTests();
  }
}

describe("v2-AAD interop vector", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    __resetKemBackendForTests();
  });

  it("the frozen ctx reproduces the v2 aad_encoded_hex exactly (v2 AAD byte-stability)", async () => {
    const ikm = hexToBytes(vector.ikm_hex);
    const recipient = await identityFromIkmUnder("native", ikm);
    const recipientPk = await importPublicKeyUnder("native", exportPublicKey(recipient));
    // Sanity: the deterministic IKM reproduces the fixture's raw pubkey — the value hashed into AAD.
    const rawPub = await exportRawPublicKey(
      (recipientPk as unknown as { cryptoKey: CryptoKey }).cryptoKey,
    );
    expect(toHex(rawPub)).toBe(vector.recipient_pubkey_raw_hex);

    const aad = await encodeAad({
      linkId: vector.aad_context.linkId,
      recipientPublicKey: exportPublicKey(recipient),
      expiresAtMs: vector.aad_context.expiresAtMs,
      maxOpens: vector.aad_context.maxOpens,
    });
    expect(toHex(aad)).toBe(vector.aad_encoded_hex);
    // The v2 header byte is 0x02 (createdAt dropped) — guards against silently reverting to v1.
    expect(aad[0]).toBe(0x02);
  });

  it.each([
    "native",
    "noble",
  ] as const)("decrypts the frozen v2 ciphertext blob under the %s KEM backend", async (backend) => {
    const ikm = hexToBytes(vector.ikm_hex);
    const recipient = await identityFromIkmUnder(backend, ikm);
    const ctx: MessageBindingContext = {
      linkId: vector.aad_context.linkId,
      recipientPublicKey: exportPublicKey(recipient),
      expiresAtMs: vector.aad_context.expiresAtMs,
      maxOpens: vector.aad_context.maxOpens,
    };
    const ct = hexToBytes(vector.ciphertext_blob_hex) as unknown as Ciphertext;
    const recovered = await openUnder(backend, ct, recipient, ctx);
    expect(new TextDecoder().decode(recovered)).toBe(vector.plaintext_utf8);
  });
});

describe("v2-AAD cross-backend interop (bidirectional)", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    __resetKemBackendForTests();
  });

  it("native seal -> noble open round-trips a v2 payload (createdAtMs omitted)", async () => {
    const ikm = new Uint8Array(32).fill(0x51);
    const recipientNoble = await identityFromIkmUnder("noble", ikm);
    const pk = exportPublicKey(recipientNoble);
    const recipientPkNative = await importPublicKeyUnder("native", pk);
    const ctx: MessageBindingContext = {
      linkId: "v2-xbackend-16by",
      recipientPublicKey: pk,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await sealUnder(
      "native",
      new TextEncoder().encode("v2 native->noble"),
      recipientPkNative,
      ctx,
    );
    const recovered = await openUnder("noble", ct, recipientNoble, ctx);
    expect(new TextDecoder().decode(recovered)).toBe("v2 native->noble");
  });

  it("noble seal -> native open round-trips a v2 payload (createdAtMs omitted)", async () => {
    const ikm = new Uint8Array(32).fill(0x52);
    const recipientNative = await identityFromIkmUnder("native", ikm);
    const pk = exportPublicKey(recipientNative);
    const recipientPkNoble = await importPublicKeyUnder("noble", pk);
    const ctx: MessageBindingContext = {
      linkId: "v2-xbackend-16by",
      recipientPublicKey: pk,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await sealUnder(
      "noble",
      new TextEncoder().encode("v2 noble->native"),
      recipientPkNoble,
      ctx,
    );
    const recovered = await openUnder("native", ct, recipientNative, ctx);
    expect(new TextDecoder().decode(recovered)).toBe("v2 noble->native");
  });
});
