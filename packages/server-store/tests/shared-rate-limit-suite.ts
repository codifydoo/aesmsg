import { beforeEach, describe, expect, it } from "vitest";
import type { RateLimitStore } from "../src/interfaces.js";

export interface RateLimitSuiteContext {
  store: RateLimitStore;
  /** Test-run-unique prefix to avoid cross-run bleed against shared Redis. */
  keyPrefix: string;
}

export function runRateLimitSuite(
  setup: () => Promise<RateLimitSuiteContext> | RateLimitSuiteContext,
): void {
  let ctx: RateLimitSuiteContext;

  beforeEach(async () => {
    ctx = await setup();
  });

  describe("incrementAndGet", () => {
    it("first call returns 1", async () => {
      const k = `${ctx.keyPrefix}:first-${Math.random()}`;
      const c = await ctx.store.incrementAndGet(k, 60);
      expect(c).toBe(1);
    });

    it("subsequent calls increment", async () => {
      const k = `${ctx.keyPrefix}:incr-${Math.random()}`;
      expect(await ctx.store.incrementAndGet(k, 60)).toBe(1);
      expect(await ctx.store.incrementAndGet(k, 60)).toBe(2);
      expect(await ctx.store.incrementAndGet(k, 60)).toBe(3);
    });

    it("different keys are independent", async () => {
      const k1 = `${ctx.keyPrefix}:a-${Math.random()}`;
      const k2 = `${ctx.keyPrefix}:b-${Math.random()}`;
      expect(await ctx.store.incrementAndGet(k1, 60)).toBe(1);
      expect(await ctx.store.incrementAndGet(k2, 60)).toBe(1);
      expect(await ctx.store.incrementAndGet(k1, 60)).toBe(2);
      expect(await ctx.store.incrementAndGet(k2, 60)).toBe(2);
      expect(await ctx.store.incrementAndGet(k1, 60)).toBe(3);
    });
  });
}
