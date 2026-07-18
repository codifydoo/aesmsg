import { Redis } from "ioredis";

const clients = new Map<string, Redis>();

/**
 * ioredis options that make a Redis outage fail FAST instead of hanging every request (BE-4 / R16).
 *
 * By default ioredis buffers commands forever while disconnected and retries a request up to 20
 * times, so during a Redis outage each `incrementAndGet` await could stall for a long time — and
 * because every API route gates on the rate limiter, the whole service would stall. These caps turn
 * an outage into a fast rejection, which the fail-CLOSED rate-limit store (see rate-limit-store.ts)
 * then surfaces as a denied request rather than a hung one.
 *
 *   - connectTimeout  — bound the initial TCP connect so a dead host rejects quickly.
 *   - commandTimeout  — a command that gets no reply within this window rejects (no indefinite hang).
 *   - maxRetriesPerRequest — a queued command retries at most once across reconnects, then rejects.
 *
 * The default reconnect strategy is intentionally LEFT ON (retry forever with backoff) so the client
 * self-heals when Redis returns — we cap per-COMMAND latency, not reconnection.
 *
 * Requires Redis >= 7 (the rate-limit store uses `EXPIRE ... NX`, added in 7.0).
 */
const FAIL_FAST_OPTIONS = {
  connectTimeout: 5_000,
  commandTimeout: 3_000,
  maxRetriesPerRequest: 1,
} as const;

/**
 * Attaches a client-level `error` handler. ioredis emits `'error'` on connection failures; without a
 * listener the noise is unhelpful, and we want a single, secret-free log line. We log ONLY the
 * error's `code`/`syscall` — never the URL, credentials, or any request data.
 */
function attachRedisErrorHandler(client: Redis): void {
  client.on("error", (err: unknown) => {
    const safe = err as { code?: string; syscall?: string } | null;
    console.error(
      "server-store: redis client error",
      safe?.code ? { code: safe.code, syscall: safe.syscall } : {},
    );
  });
}

/** Returns a cached `ioredis` client for `connectionString` (defaults to `process.env.REDIS_URL`). */
export function getRedis(connectionString?: string): Redis {
  const url = connectionString ?? process.env.REDIS_URL;
  if (!url) {
    throw new Error("server-store: REDIS_URL is not set");
  }
  let client = clients.get(url);
  if (!client) {
    client = new Redis(url, FAIL_FAST_OPTIONS);
    attachRedisErrorHandler(client);
    clients.set(url, client);
  }
  return client;
}

export async function closeRedis(connectionString?: string): Promise<void> {
  if (connectionString === undefined) {
    const all = Array.from(clients.values());
    clients.clear();
    await Promise.all(all.map((c) => c.quit()));
    return;
  }
  const client = clients.get(connectionString);
  if (client) {
    clients.delete(connectionString);
    await client.quit();
  }
}
