import { beforeEach, describe, expect, it } from "vitest";
import type { CiphertextStore } from "../src/interfaces.js";
import type { LinkId } from "../src/types.js";

export interface CiphertextSuiteContext {
  store: CiphertextStore;
  /** PG enforces FK on link_ciphertexts → links. Memory doesn't. Suite calls this before put(). */
  ensureLinkExists?: (id: LinkId) => Promise<void>;
}

export function runCiphertextSuite(
  setup: () => Promise<CiphertextSuiteContext> | CiphertextSuiteContext,
): void {
  let ctx: CiphertextSuiteContext;

  beforeEach(async () => {
    ctx = await setup();
  });

  describe("put + get", () => {
    it("round-trips bytes exactly", async () => {
      const id = "ct-rt" as LinkId;
      await ctx.ensureLinkExists?.(id);
      const blob = new Uint8Array([0, 1, 2, 3, 4, 5, 250, 255]);
      await ctx.store.put(id, blob);
      const fetched = await ctx.store.get(id);
      expect(fetched).not.toBeNull();
      expect(Array.from(fetched ?? [])).toEqual(Array.from(blob));
    });

    it("get returns null for unknown id", async () => {
      const fetched = await ctx.store.get("ct-missing" as LinkId);
      expect(fetched).toBeNull();
    });

    it("put on existing id overwrites", async () => {
      const id = "ct-overwrite" as LinkId;
      await ctx.ensureLinkExists?.(id);
      await ctx.store.put(id, new Uint8Array([1, 2, 3]));
      await ctx.store.put(id, new Uint8Array([9, 9, 9, 9]));
      const fetched = await ctx.store.get(id);
      expect(Array.from(fetched ?? [])).toEqual([9, 9, 9, 9]);
    });
  });

  describe("delete", () => {
    it("removes the row, get returns null after", async () => {
      const id = "ct-del" as LinkId;
      await ctx.ensureLinkExists?.(id);
      await ctx.store.put(id, new Uint8Array([1, 2, 3]));
      await ctx.store.delete(id);
      const fetched = await ctx.store.get(id);
      expect(fetched).toBeNull();
    });

    it("delete on missing id is a no-op (no throw)", async () => {
      await expect(ctx.store.delete("ct-missing-2" as LinkId)).resolves.toBeUndefined();
    });
  });

  describe("totalBytes — aggregate storage metric (PG-18 / R25)", () => {
    it("is 0 on an empty store", async () => {
      expect(await ctx.store.totalBytes()).toBe(0);
    });

    it("sums the byte length across all blobs and tracks put/delete", async () => {
      const a = "ct-bytes-a" as LinkId;
      const b = "ct-bytes-b" as LinkId;
      await ctx.ensureLinkExists?.(a);
      await ctx.ensureLinkExists?.(b);
      await ctx.store.put(a, new Uint8Array(10));
      await ctx.store.put(b, new Uint8Array(25));
      expect(await ctx.store.totalBytes()).toBe(35);

      // Overwrite tracks the new size, not the sum of both.
      await ctx.store.put(a, new Uint8Array(4));
      expect(await ctx.store.totalBytes()).toBe(29);

      await ctx.store.delete(b);
      expect(await ctx.store.totalBytes()).toBe(4);
    });
  });
}
