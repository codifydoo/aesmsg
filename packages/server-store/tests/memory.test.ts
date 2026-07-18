import { afterEach, describe, expect, it, vi } from "vitest";
import type { CiphertextStore } from "../src/interfaces.js";
import { MemoryCiphertextStore } from "../src/memory/ciphertext-store.js";
import { MemoryLinkMetadataStore } from "../src/memory/link-metadata-store.js";
import { MemoryRateLimitStore } from "../src/memory/rate-limit-store.js";
import type { LinkId } from "../src/types.js";
import { runCiphertextSuite } from "./shared-ciphertext-suite.js";
import { runLinkMetadataSuite } from "./shared-link-metadata-suite.js";
import { runRateLimitSuite } from "./shared-rate-limit-suite.js";

describe("MemoryLinkMetadataStore", () => {
  runLinkMetadataSuite(() => {
    const ciphertexts = new MemoryCiphertextStore();
    return {
      store: new MemoryLinkMetadataStore(ciphertexts),
      ciphertexts,
      // Fault-inject the ciphertext WRITE so the atomic-create rollback test can prove the link row
      // is rolled back too. put() throws; get/delete delegate to a real map that the write never
      // reached, so both readers report "gone" after the failed create.
      makeRollbackProbe: () => {
        const backing = new MemoryCiphertextStore();
        const throwing: CiphertextStore = {
          put: async () => {
            throw new Error("ciphertext store down");
          },
          get: (id) => backing.get(id),
          delete: (id) => backing.delete(id),
          totalBytes: () => backing.totalBytes(),
        };
        const store = new MemoryLinkMetadataStore(throwing);
        return {
          store,
          getLink: (id) => store.get(id),
          getCiphertext: (id) => backing.get(id),
        };
      },
    };
  });

  describe("revoke purges ciphertext", () => {
    it("physically deletes the ciphertext immediately, not on the expiry sweep", async () => {
      const ciphertexts = new MemoryCiphertextStore();
      const links = new MemoryLinkMetadataStore(ciphertexts);
      const id = "link-revoke-purge" as LinkId;
      await links.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      await ciphertexts.put(id, new Uint8Array([1, 2, 3]));

      await links.revoke(id);

      expect((await links.get(id))?.status).toBe("revoked");
      // The privacy policy promises revocation purges ciphertext immediately — assert it's gone
      // now, not merely flagged for the next expirePastDue() sweep.
      expect(await ciphertexts.get(id)).toBeNull();
    });
  });
});

describe("MemoryCiphertextStore", () => {
  runCiphertextSuite(() => ({ store: new MemoryCiphertextStore() }));
});

describe("MemoryRateLimitStore", () => {
  runRateLimitSuite(() => ({
    store: new MemoryRateLimitStore(),
    keyPrefix: "mem-test",
  }));

  describe("TTL boundary", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("count resets when the wall clock crosses into a new window", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
      const store = new MemoryRateLimitStore();
      expect(await store.incrementAndGet("k", 1)).toBe(1);
      expect(await store.incrementAndGet("k", 1)).toBe(2);
      vi.advanceTimersByTime(1100);
      expect(await store.incrementAndGet("k", 1)).toBe(1);
    });
  });
});
