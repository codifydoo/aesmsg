import type { Redis } from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closePool, getPool } from "../src/pg/pool.js";
import { RateLimitUnavailableError, RedisRateLimitStore } from "../src/redis/rate-limit-store.js";

// These run in every environment (no real Postgres/Redis needed): the pg Pool never connects until a
// query, and the Redis store is fed an injected fake client — so we exercise the failure wiring
// (pool error handler + rate-limit fail-closed policy) directly.

describe("pg pool error handler (BE-4 / R16)", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await closePool();
  });

  it("attaches an 'error' listener so an idle-client error does NOT crash the process", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = getPool("postgres://user:secret@127.0.0.1:1/db");

    // node-postgres emits 'error' on the Pool when an IDLE client dies (DB restart / network blip).
    // Without a listener that unhandled 'error' event crashes Node; the handler getPool attaches must
    // absorb it. A synthetic emit is enough to prove the listener exists and swallows the event.
    expect(pool.listenerCount("error")).toBeGreaterThanOrEqual(1);
    const idleErr = Object.assign(new Error("idle client boom"), {
      code: "ECONNRESET",
      syscall: "read",
    });
    expect(() => pool.emit("error", idleErr)).not.toThrow();

    // It logged, but only non-sensitive markers — never the connection string or credentials.
    expect(errSpy).toHaveBeenCalled();
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("127.0.0.1");
    expect(logged).not.toContain("postgres://");
  });
});

describe("RedisRateLimitStore fail policy — FAIL-CLOSED (BE-4 / R16)", () => {
  it("throws RateLimitUnavailableError when the redis command rejects (outage/timeout)", async () => {
    const failing = {
      multi: () => ({
        incr() {
          return this;
        },
        expire() {
          return this;
        },
        exec: () =>
          Promise.reject(
            Object.assign(new Error("Command timed out"), { name: "MaxRetriesPerRequestError" }),
          ),
      }),
    } as unknown as Redis;

    const store = new RedisRateLimitStore(failing);
    await expect(store.incrementAndGet("k", 60)).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("throws (fail-closed) when the client is entirely down (multi throws synchronously)", async () => {
    const down = {
      multi: () => {
        throw new Error("Connection is closed.");
      },
    } as unknown as Redis;

    const store = new RedisRateLimitStore(down);
    await expect(store.incrementAndGet("k", 60)).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("never falls through to a permissive (low) count on failure — it denies instead of admitting", async () => {
    // Fail-OPEN would resolve to a small number and silently ADMIT the request; fail-CLOSED must
    // reject so the caller (every write route gates on this) denies it.
    let resolvedCount: number | undefined;
    const failing = {
      multi: () => ({
        incr() {
          return this;
        },
        expire() {
          return this;
        },
        exec: () => Promise.reject(new Error("ECONNREFUSED")),
      }),
    } as unknown as Redis;

    const store = new RedisRateLimitStore(failing);
    try {
      resolvedCount = await store.incrementAndGet("k", 60);
    } catch {
      resolvedCount = undefined;
    }
    expect(resolvedCount).toBeUndefined();
  });

  it("still returns the count on the happy path (fail-closed only triggers on failure)", async () => {
    const ok = {
      multi: () => ({
        incr() {
          return this;
        },
        expire() {
          return this;
        },
        exec: async () => [[null, 3] as [Error | null, number]],
      }),
    } as unknown as Redis;

    const store = new RedisRateLimitStore(ok);
    expect(await store.incrementAndGet("k", 60)).toBe(3);
  });
});
