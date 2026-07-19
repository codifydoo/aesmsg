import { exportPublicKey, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import {
  buildContactCard,
  CONTACT_CARD_FILENAME,
  InvalidContactCardError,
  parseContactCard,
} from "@/src/contacts/contact-card";

// Pure + DI module, tested node-env with no renderer and no native mocks — contact-card.ts imports
// only @aesmsg/crypto, the pure label module, and the CACHE_FILE_PREFIX const. The key round-trip
// uses the REAL @aesmsg/crypto, so a card built from a generated identity's public key parses back to
// the same key. The card carries NO fingerprint; parse returns only { label, publicKey }.

describe("buildContactCard", () => {
  it("produces a plaintext contact-card JSON with the fixed filename", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);

    const card = buildContactCard("Alice", pk);

    expect(card.filename).toBe(CONTACT_CARD_FILENAME);
    const parsed = JSON.parse(card.contents);
    expect(parsed).toEqual({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Alice",
      publicKey: pk,
    });
  });

  it("trims the label", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const card = buildContactCard("  Bob  ", pk);
    expect(JSON.parse(card.contents).label).toBe("Bob");
  });

  it("throws InvalidContactCardError on an empty label", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    expect(() => buildContactCard("   ", pk)).toThrow(InvalidContactCardError);
  });

  it("throws InvalidContactCardError on a label longer than 80 chars", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    expect(() => buildContactCard("x".repeat(81), pk)).toThrow(InvalidContactCardError);
  });
});

describe("parseContactCard", () => {
  it("round-trips a built card back to { label, publicKey }", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const card = buildContactCard("Alice", pk);

    const result = await parseContactCard(card.contents);

    expect(result).toEqual({ ok: true, card: { label: "Alice", publicKey: pk } });
  });

  it("ignores any fingerprint field carried in the file (never trusts it)", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    // A hand-crafted card with a bogus fingerprint field: parse must drop it entirely.
    const contents = JSON.stringify({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Mallory",
      publicKey: pk,
      fingerprint: "AM-DEAD-BEEF",
    });

    const result = await parseContactCard(contents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card).toEqual({ label: "Mallory", publicKey: pk });
      expect("fingerprint" in result.card).toBe(false);
    }
  });

  it("returns invalid-file on non-JSON input", async () => {
    expect(await parseContactCard("not json")).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("returns invalid-file on empty input", async () => {
    expect(await parseContactCard("")).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("returns wrong-file-type when the type tag is absent or different", async () => {
    // An identity-backup envelope (a WrappedKey) has no contact-card type tag.
    expect(await parseContactCard('{"v":1,"kdf":{}}')).toEqual({
      ok: false,
      reason: "wrong-file-type",
    });
    expect(await parseContactCard('{"type":"aesmsg.backup","publicKey":"amk1:x"}')).toEqual({
      ok: false,
      reason: "wrong-file-type",
    });
  });

  it("returns invalid-file when the type is right but the key is malformed", async () => {
    const contents = JSON.stringify({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Nope",
      publicKey: "not-an-amk1-key",
    });
    expect(await parseContactCard(contents)).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("recovers a real fingerprint from the parsed key (recomputed downstream, not from file)", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const result = await parseContactCard(buildContactCard("Alice", pk).contents);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The authoritative fingerprint comes from the key, computed here exactly as addContact does.
      expect(await fingerprint(result.card.publicKey)).toEqual(await fingerprint(pk));
    }
  });
});
