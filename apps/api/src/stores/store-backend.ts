// Pure store-backend selection, kept in its own module (no `pg` / `ioredis` imports) so it can be
// unit-tested under Vitest browser mode. Importing `stores.ts` directly would pull in `pg`, which
// references Node's `Buffer` and throws in the browser test runtime (see hash-ip.ts for the same
// pure-core / env-wrapper split).

/**
 * Decides whether to back the API with Postgres + Redis. They are used whenever BOTH DATABASE_URL
 * and REDIS_URL are present — independent of NODE_ENV. This is what lets `next dev` pick them up
 * (e.g. from `apps/web/.env.local`) instead of always falling back to in-memory; the old gate also
 * required NODE_ENV === "production", which the dev server can never satisfy. With either URL unset
 * we use the in-memory stores, so a plain `pnpm dev` still boots with no Docker.
 */
export function shouldUseDbStores(env: {
  DATABASE_URL?: string;
  REDIS_URL?: string;
  [key: string]: string | undefined;
}): boolean {
  return !!env.DATABASE_URL && !!env.REDIS_URL;
}

/**
 * Boot-time guard against the ARCH-1 footgun: in production the API MUST be backed by Postgres +
 * Redis. If either URL is missing, `shouldUseDbStores` silently returns false and the API runs every
 * store (ciphertext + link metadata, not just rate limits) in process memory — booting green, then
 * losing every link on the next restart/redeploy and split-braining across replicas. This returns
 * the names of the required-but-missing env vars when `NODE_ENV === "production"`, or an empty array
 * otherwise (dev/test may run on memory stores with no Docker). Pure + env-injected so the caller in
 * `index.ts` can fail closed at boot and the logic stays deterministically testable.
 */
export function missingProductionStoreVars(env: {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
  [key: string]: string | undefined;
}): string[] {
  if (env.NODE_ENV !== "production") return [];
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!env.REDIS_URL) missing.push("REDIS_URL");
  return missing;
}
