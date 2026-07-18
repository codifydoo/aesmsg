import { Pool } from "pg";

const pools = new Map<string, Pool>();

/**
 * Attaches a pool-level `error` handler (BE-4 / R16).
 *
 * node-postgres emits `'error'` on the Pool when an IDLE pooled client fails out-of-band — a
 * Postgres restart, a network blip, a server-side idle-timeout kill. That event has NO associated
 * query to reject, so if it is unhandled Node treats it as an unhandled `'error'` on an EventEmitter
 * and **crashes the whole API process** (turning a recoverable dependency blip into a crash loop).
 *
 * With a handler attached the pool simply discards the dead client and creates a fresh one on the
 * next checkout, so the API rides out the blip. We log ONLY non-sensitive markers (the error's
 * `code`/`syscall`) — never the connection string, credentials, request IP, or ciphertext — to keep
 * the zero-knowledge posture: an operator sees "a backend client dropped" without any secret leaking
 * into logs.
 */
function attachPoolErrorHandler(pool: Pool): void {
  pool.on("error", (err: unknown) => {
    const safe = err as { code?: string; syscall?: string } | null;
    console.error(
      "server-store: idle pg client error (pool will replace the client)",
      safe?.code ? { code: safe.code, syscall: safe.syscall } : {},
    );
  });
}

/**
 * Returns a cached `Pool` for the given URL (defaults to `process.env.DATABASE_URL`).
 * The same pool is reused across `Pg*Store` instances that target the same URL.
 */
export function getPool(connectionString?: string): Pool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("server-store: DATABASE_URL is not set");
  }
  let pool = pools.get(url);
  if (!pool) {
    pool = new Pool({ connectionString: url });
    attachPoolErrorHandler(pool);
    pools.set(url, pool);
  }
  return pool;
}

/** Closes and forgets the cached pool for `connectionString` (or all pools if omitted). */
export async function closePool(connectionString?: string): Promise<void> {
  if (connectionString === undefined) {
    const all = Array.from(pools.values());
    pools.clear();
    await Promise.all(all.map((p) => p.end()));
    return;
  }
  const pool = pools.get(connectionString);
  if (pool) {
    pools.delete(connectionString);
    await pool.end();
  }
}
