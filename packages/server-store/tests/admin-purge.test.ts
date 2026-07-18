import { describe, expect, it } from "vitest";
import { purgeLink, renderPurgeResult } from "../src/admin/purge.js";
import { MemoryCiphertextStore } from "../src/memory/ciphertext-store.js";
import { MemoryLinkMetadataStore } from "../src/memory/link-metadata-store.js";
import type { LinkId } from "../src/types.js";

function makeStore() {
  const ciphertexts = new MemoryCiphertextStore();
  return { ciphertexts, links: new MemoryLinkMetadataStore(ciphertexts) };
}

describe("purgeLink", () => {
  it("purges a live link's ciphertext and marks it terminal", async () => {
    const { links, ciphertexts } = makeStore();
    const id = "purge-me-000000a" as LinkId;
    await links.createWithCiphertext(
      { id, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 },
      new Uint8Array([1, 2, 3]),
    );

    const result = await purgeLink(links, id);
    expect(result).toEqual({ found: true, wasActive: true, ciphertextRemoved: true });
    expect((await links.get(id))?.status).toBe("revoked");
    expect(await ciphertexts.get(id)).toBeNull();
  });

  it("trims surrounding whitespace from the supplied id", async () => {
    const { links } = makeStore();
    const id = "trim-me-00000000" as LinkId;
    await links.createWithCiphertext(
      { id, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 },
      new Uint8Array([7]),
    );
    const result = await purgeLink(links, `  ${id}\n`);
    expect(result.found).toBe(true);
    expect(result.wasActive).toBe(true);
  });

  it("is idempotent across repeated calls", async () => {
    const { links } = makeStore();
    const id = "purge-twice-0000" as LinkId;
    await links.createWithCiphertext(
      { id, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 },
      new Uint8Array([1]),
    );
    await purgeLink(links, id);
    const second = await purgeLink(links, id);
    expect(second).toEqual({ found: true, wasActive: false, ciphertextRemoved: false });
  });

  it("rejects an empty / whitespace-only id", async () => {
    const { links } = makeStore();
    await expect(purgeLink(links, "   ")).rejects.toThrow(/non-empty link id/);
  });
});

describe("renderPurgeResult", () => {
  it("summarizes a successful active purge", () => {
    const msg = renderPurgeResult("abc123", {
      found: true,
      wasActive: true,
      ciphertextRemoved: true,
    });
    expect(msg).toContain("abc123");
    expect(msg).toContain("PURGED");
    expect(msg).toContain("ciphertext deleted");
    expect(msg).toContain("marked revoked");
  });

  it("summarizes an idempotent re-run (already terminal, nothing left)", () => {
    const msg = renderPurgeResult("abc123", {
      found: true,
      wasActive: false,
      ciphertextRemoved: false,
    });
    expect(msg).toContain("already terminal");
    expect(msg).toContain("already purged");
  });

  it("summarizes an unknown id", () => {
    const msg = renderPurgeResult(" xyz ", {
      found: false,
      wasActive: false,
      ciphertextRemoved: false,
    });
    expect(msg).toContain("xyz");
    expect(msg).toContain("no row found");
  });
});
