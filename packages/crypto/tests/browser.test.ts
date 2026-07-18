import { describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/aad.js";
import { exportPublicKey, generateIdentity, importPublicKey } from "../src/identity.js";
import { open, seal } from "../src/seal.js";

const dec = new TextDecoder();

describe("browser round-trip (headless Chromium)", () => {
  it("seal+open round-trips a short message in the browser", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: exportPublicKey(recipient),
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 1,
    };
    const ct = await seal(new TextEncoder().encode("browser hello"), recipientPk, ctx);
    const out = await open(ct, recipient, ctx);
    expect(dec.decode(out)).toBe("browser hello");
  });

  // NOTE: The former property-based test "property: seal+open round-trips for small random
  // plaintexts (50 runs)" generated random Uint8Array AADs and passed them directly to
  // seal/open. That API no longer exists — seal/open now accept MessageBindingContext,
  // not raw bytes. A replacement property test is deferred to Task 5.
});
