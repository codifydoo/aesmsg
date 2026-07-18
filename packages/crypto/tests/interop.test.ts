import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/aad.js";
import { __resetKemBackendForTests, __setKemBackendForTests } from "../src/hpke.js";
import { exportPublicKey } from "../src/identity.js";
import { open } from "../src/seal.js";
import { __test_only_identityFromIKM } from "../src/test-only.js";
import type { Ciphertext } from "../src/types.js";

type Vector = {
  ikm_hex: string;
  recipient_pubkey_raw_hex: string;
  aad_context: {
    linkId: string;
    createdAtMs: number;
    expiresAtMs: number;
    maxOpens: number;
  };
  aad_encoded_hex: string;
  plaintext_utf8: string;
  ciphertext_blob_hex: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const vector: Vector = JSON.parse(
  readFileSync(join(here, "fixtures", "interop", "vector.json"), "utf8"),
);

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

async function decryptFixture(): Promise<string> {
  process.env.NODE_ENV = "test";
  const recipient = await __test_only_identityFromIKM(hexToBytes(vector.ikm_hex));
  const ciphertext = hexToBytes(vector.ciphertext_blob_hex) as unknown as Ciphertext;
  const context: MessageBindingContext = {
    linkId: vector.aad_context.linkId,
    recipientPublicKey: exportPublicKey(recipient),
    createdAtMs: vector.aad_context.createdAtMs,
    expiresAtMs: vector.aad_context.expiresAtMs,
    maxOpens: vector.aad_context.maxOpens,
  };
  const recovered = await open(ciphertext, recipient, context);
  return new TextDecoder().decode(recovered);
}

describe("cross-implementation interop (pyhpke -> @aesmsg/crypto)", () => {
  afterEach(() => {
    __resetKemBackendForTests();
  });

  it("decrypts a ciphertext sealed by pyhpke (native backend)", async () => {
    __setKemBackendForTests("native");
    expect(await decryptFixture()).toBe(vector.plaintext_utf8);
  });

  it("decrypts a ciphertext sealed by pyhpke (noble backend)", async () => {
    // The RFC 9180 test vector must also decrypt under the pure-JS noble KEM used on Hermes.
    __setKemBackendForTests("noble");
    expect(await decryptFixture()).toBe(vector.plaintext_utf8);
  });
});
