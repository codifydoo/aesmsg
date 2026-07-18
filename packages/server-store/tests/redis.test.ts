import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeRedis, getRedis } from "../src/redis/client.js";
import { RedisRateLimitStore } from "../src/redis/rate-limit-store.js";
import { runRateLimitSuite } from "./shared-rate-limit-suite.js";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const PREFIX = `test_${Math.random().toString(36).slice(2, 10)}`;

describe.skipIf(!TEST_REDIS_URL)("RedisRateLimitStore", () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(TEST_REDIS_URL as string);
  });

  afterAll(async () => {
    const keys = await redis.keys(`ratelimit:${PREFIX}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  runRateLimitSuite(() => ({
    store: new RedisRateLimitStore(redis),
    keyPrefix: PREFIX,
  }));

  it("TTL boundary resets the counter after windowSeconds elapses", async () => {
    const store = new RedisRateLimitStore(redis);
    const key = `${PREFIX}:ttl-${Math.random().toString(36).slice(2, 6)}`;
    expect(await store.incrementAndGet(key, 1)).toBe(1);
    expect(await store.incrementAndGet(key, 1)).toBe(2);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await store.incrementAndGet(key, 1)).toBe(1);
  }, 5000);
});

describe.skipIf(!TEST_REDIS_URL)("getRedis / closeRedis helpers", () => {
  const helperUrls: string[] = [];

  afterEach(async () => {
    while (helperUrls.length > 0) {
      const url = helperUrls.pop();
      if (url) await closeRedis(url);
    }
  });

  it("caches singletons by URL", () => {
    const url = `${TEST_REDIS_URL}?cache_test`;
    helperUrls.push(url);
    const a = getRedis(url);
    const b = getRedis(url);
    expect(a).toBe(b);
  });

  it("returns different clients for different URLs", () => {
    const u1 = `${TEST_REDIS_URL}?multi_a`;
    const u2 = `${TEST_REDIS_URL}?multi_b`;
    helperUrls.push(u1, u2);
    expect(getRedis(u1)).not.toBe(getRedis(u2));
  });

  it("throws when no URL is available", () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      expect(() => getRedis()).toThrow(/REDIS_URL is not set/);
    } finally {
      if (saved !== undefined) process.env.REDIS_URL = saved;
    }
  });

  it("closeRedis() with no arg closes all cached clients", async () => {
    const u1 = `${TEST_REDIS_URL}?closeall_a`;
    const u2 = `${TEST_REDIS_URL}?closeall_b`;
    getRedis(u1);
    getRedis(u2);
    await closeRedis();
    helperUrls.push(u1, u2);
    expect(getRedis(u1)).not.toBe(getRedis(u2));
  });

  it("closeRedis with unknown URL is a no-op", async () => {
    await expect(closeRedis("redis://nope:1/0")).resolves.toBeUndefined();
  });
});
