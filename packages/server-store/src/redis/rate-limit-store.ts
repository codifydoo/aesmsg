import type { Redis } from "ioredis";
import type { RateLimitStore } from "../interfaces";
import { getRedis } from "./client";

/**
 * Thrown by {@link RedisRateLimitStore.incrementAndGet} when Redis is unavailable (outage, command
 * timeout, protocol error). It exists so the FAIL-CLOSED contract is explicit and identifiable: a
 * caller (or test) can tell "the limiter itself is down" apart from an ordinary over-limit result.
 */
export class RateLimitUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("rate limiter unavailable");
    this.name = "RateLimitUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Fixed-window rate-limit counter backed by Redis (`EXPIRE ... NX` ⇒ requires Redis >= 7).
 *
 * FAIL POLICY — **FAIL-CLOSED** (BE-4 / R16). If Redis is unreachable, `incrementAndGet` THROWS a
 * {@link RateLimitUnavailableError} instead of returning a permissive (low) count. Every create /
 * open / revoke / list route gates on this method, so a throw DENIES the request (the API's error
 * handler turns it into an error response) rather than silently granting unlimited, un-throttled
 * access to the write paths. Failing OPEN here would let an attacker flood the unauthenticated
 * upload/open API the moment Redis blips — a worse outcome than briefly rejecting honest traffic, so
 * the fail-closed tradeoff is chosen deliberately. Paired with the fail-FAST client timeouts in
 * client.ts, that denial happens quickly instead of hanging the request until Redis reconnects.
 */
export class RedisRateLimitStore implements RateLimitStore {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? getRedis();
  }

  async incrementAndGet(key: string, windowSeconds: number): Promise<number> {
    const windowFloor = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const redisKey = `ratelimit:${key}:${windowFloor}`;
    try {
      const tx = this.redis.multi();
      tx.incr(redisKey);
      tx.expire(redisKey, windowSeconds, "NX");
      const replies = await tx.exec();
      if (!replies) throw new Error("RedisRateLimitStore: multi() returned null");
      const incrReply = replies[0];
      if (!incrReply) throw new Error("RedisRateLimitStore: missing INCR reply");
      const [incrErr, count] = incrReply as [Error | null, number | string];
      if (incrErr) throw incrErr;
      return Number(count);
    } catch (err) {
      // Fail-closed: any Redis failure (timeout, connection loss, protocol error, or a malformed
      // reply) is surfaced as a denial rather than falling through to a permissive count. Re-wrap as
      // a single well-known type so callers never mistake "limiter down" for "under the limit".
      if (err instanceof RateLimitUnavailableError) throw err;
      throw new RateLimitUnavailableError(err);
    }
  }
}
