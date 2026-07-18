import { describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/aad.js";
import { exportPublicKey, generateIdentity, importPublicKey } from "../src/identity.js";
import { open, seal } from "../src/seal.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

// Shared fixed context values used across tests for readability.
const CREATED_AT = 1_700_000_000_000;
const EXPIRES_AT = 1_700_086_400_000;

describe("seal/open round-trip", () => {
  it("recovers an empty plaintext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new Uint8Array(0), recipientPk, ctx);
    const out = await open(ct, recipient, ctx);
    expect(out).toHaveLength(0);
  });

  it("recovers a single-byte plaintext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(new Uint8Array([0x42]), recipientPk, ctx);
    const out = await open(ct, recipient, ctx);
    expect(Array.from(out)).toEqual([0x42]);
  });

  it("recovers a 1KB random plaintext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const plaintext = crypto.getRandomValues(new Uint8Array(1024));
    const ct = await seal(plaintext, recipientPk, ctx);
    const out = await open(ct, recipient, ctx);
    expect(Array.from(out)).toEqual(Array.from(plaintext));
  });

  it("recovers a 1MB random plaintext", { timeout: 60_000 }, async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const plaintext = new Uint8Array(1024 * 1024);
    const CHUNK = 65_536;
    for (let off = 0; off < plaintext.length; off += CHUNK) {
      crypto.getRandomValues(plaintext.subarray(off, Math.min(off + CHUNK, plaintext.length)));
    }
    const ct = await seal(plaintext, recipientPk, ctx);
    const out = await open(ct, recipient, ctx);
    expect(out).toHaveLength(plaintext.length);
    expect(out[0]).toBe(plaintext[0]);
    expect(out[plaintext.length - 1]).toBe(plaintext[plaintext.length - 1]);
    expect(out[12345]).toBe(plaintext[12345]);
  });

  it("recovers UTF-8 with mixed scripts (Latin + CJK + Arabic + emoji + Cyrillic)", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const message = "hello — 你好 — مرحبا — 🔐 — Здравствуйте";
    const ct = await seal(enc.encode(message), recipientPk, ctx);
    const out = await open(ct, recipient, ctx);
    expect(dec.decode(out)).toBe(message);
  });

  // NOTE: The former property-based test "property: seal+open round-trips for arbitrary
  // plaintexts and AADs" generated random Uint8Array AADs and passed them directly to
  // seal/open. That API no longer exists — seal/open now accept MessageBindingContext,
  // not raw bytes. A replacement property test (varying linkId + timestamps across runs)
  // is deferred to Task 5. See: packages/crypto/tests/roundtrip.test.ts property test migration.

  it("pubkey export/import round-trip produces a usable RecipientPublicKey", async () => {
    const recipient = await generateIdentity();
    const exported = exportPublicKey(recipient);
    const recipientPk = await importPublicKey(exported);
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exported,
      createdAtMs: CREATED_AT,
      expiresAtMs: EXPIRES_AT,
      maxOpens: 1,
    };
    const ct = await seal(enc.encode("test"), recipientPk, ctx);
    const out = await open(ct, recipient, ctx);
    expect(dec.decode(out)).toBe("test");
  });
});
