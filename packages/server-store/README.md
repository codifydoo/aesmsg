# @aesmsg/server-store

Server-side persistence + rate-limit primitives for aesmsg. **Node-only** — never import from `@aesmsg/ui`, browser code, or any client path. Its consumers are the backend services `apps/api` (the Fastify message API) and `apps/worker` (the expiry sweeper).

## Interfaces

```ts
interface LinkMetadataStore {
  create(record: CreateLinkRecord): Promise<LinkMetadata>;
  /** Atomic create: writes the metadata row AND its ciphertext in one transaction (BE-5 / R22). */
  createWithCiphertext(record: CreateLinkRecord, ciphertext: Uint8Array): Promise<LinkMetadata>;
  get(id: LinkId): Promise<LinkMetadata | null>;
  /** Atomic. Returns null if the link is not active or already past expiry/max-opens. */
  incrementOpens(id: LinkId): Promise<LinkMetadata | null>;
  revoke(id: LinkId, providedTokenHash?: string | null): Promise<void>;
  /** Marks expired rows as expired, purges associated ciphertext, and prunes over-retention terminal rows. Returns number of ciphertexts purged. */
  expirePastDue(): Promise<number>;
  /** Deletes terminal (expired/revoked) rows whose terminal transition predates `before` (BE-7 / R18). */
  pruneTerminal(before: Date): Promise<number>;
}

interface CiphertextStore {
  put(id: LinkId, blob: Uint8Array): Promise<void>;
  get(id: LinkId): Promise<Uint8Array | null>;
  delete(id: LinkId): Promise<void>;
}

interface RateLimitStore {
  /** Fixed-window counter. Returns the new count for the current window. */
  incrementAndGet(key: string, windowSeconds: number): Promise<number>;
}
```

Each interface has implementations for both unit-test and production use:

| Interface | Memory | Production backend |
|---|---|---|
| `LinkMetadataStore` | `MemoryLinkMetadataStore` | `PgLinkMetadataStore` |
| `CiphertextStore` | `MemoryCiphertextStore` | `PgCiphertextStore` (bytea — Phase 1 fallback) |
| `RateLimitStore` | `MemoryRateLimitStore` | `RedisRateLimitStore` (fixed-window) |

`Pg*` and `Redis*` accept an injected `pg.Pool` / `Redis` instance for tests; in production, omit it and they pick up the URL-keyed cached singleton from `getPool()` / `getRedis()`.

## Environment variables

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `PgLinkMetadataStore`, `PgCiphertextStore`, `runMigrations` | Standard Postgres URL: `postgres://user:pass@host:port/dbname` |
| `REDIS_URL` | `RedisRateLimitStore` | Standard Redis URL: `redis://[user:pass@]host[:port][/db]`. **Requires Redis ≥ 7** (`EXPIRE … NX`). |
| `AESMSG_TERMINAL_ROW_RETENTION_MS` | `expirePastDue` / `pruneTerminal` | How long terminal (expired/revoked) metadata rows are kept before the sweep prunes them (BE-7 / R18). Defaults to 30 days. |
| `TEST_DATABASE_URL` | `pg.test.ts`, `migrate.test.ts` | If unset, those suites skip |
| `TEST_REDIS_URL` | `redis.test.ts` | If unset, that suite skips |

## Local Postgres + Redis via Docker

```bash
docker run --name pg -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:16
docker run --name redis -p 6379:6379 -d redis:7

export DATABASE_URL=postgres://postgres:secret@localhost:5432/postgres
export REDIS_URL=redis://localhost:6379

# Apply migrations
pnpm --filter @aesmsg/server-store exec tsx src/migrate.ts

# Run the full integration suite
TEST_DATABASE_URL=$DATABASE_URL TEST_REDIS_URL=$REDIS_URL \
  pnpm --filter @aesmsg/server-store test
```

## Atomic operations — quick reference

`createWithCiphertext` writes the link-metadata row **and** the ciphertext row in **one Pg transaction** (BE-5 / R22); any failure rolls both back, so a crash mid-create never strands a live-but-empty link (which would burn the id forever and consume the first open) or a dangling blob. The memory store mirrors this (roll the row back if the blob write throws). The API create path uses this instead of `create()` + `CiphertextStore.put()`.

`incrementOpens` is a single `UPDATE` with a `CASE`-driven status flip; two simultaneous calls against the same row are serialized by Postgres MVCC + row locks, so exactly one wins when `max_opens = 1`. See `src/pg/link-metadata-store.ts`.

`expirePastDue` runs a non-transactional multi-step: mark active rows past expiry as `'expired'` (stamping `terminal_at`), `DELETE FROM link_ciphertexts WHERE link_id IN (... rows in terminal status)`, then **prune terminal metadata rows older than the retention window** (`pruneTerminal`, BE-7 / R18). The metadata row is **kept until retention elapses** so callers can distinguish expired/revoked from "never existed", then deleted so a leaked DB can't retain unbounded historical metadata. Both the ciphertext-purge subquery and the prune DELETE are served by the partial index `idx_links_terminal_at` (migration `0004`).

`terminal_at` is internal bookkeeping — it is stamped on every terminal transition (revoke / last-open / expiry) but is **never returned to the API**, so it leaks no timing to clients.

The Redis rate limit uses a fixed-window counter — `KEY = ratelimit:<key>:<window-floor-epoch>`, `INCR` + `EXPIRE … NX` in a `MULTI`. Requires **Redis ≥ 7** for the `NX` flag on `EXPIRE`. **Fail policy: FAIL-CLOSED** (BE-4 / R16) — when Redis is unreachable, `incrementAndGet` throws `RateLimitUnavailableError` (denying the request) rather than admitting it with a permissive count; the client is configured with connect/command timeouts so that denial is fast, not a hang.

## Migrations

Plain SQL files in `migrations/`, applied in lexicographic order by `runMigrations()` in `src/migrate.ts`. The runner records applied filenames in a `_migrations` table (created on first run) and holds `pg_advisory_lock(0xdeadbeef)` for the duration so two processes running simultaneously serialize. Down-migrations are not supported in Phase 1 — a rollback is a database restore.

## Consumers

The Fastify message API (`apps/api`) calls `PgLinkMetadataStore` + `PgCiphertextStore` + `RedisRateLimitStore` to create, serve, and revoke links, and `apps/worker` calls `expirePastDue()` on a schedule to purge expired/revoked ciphertext. See [`docs/superpowers/specs/`](../../docs/superpowers/specs/) for the relevant specs.
