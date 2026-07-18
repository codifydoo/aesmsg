# Slice 4 — Backend storage layer (`@aesmsg/server-store`)

**Date:** 2026-05-09
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** [project init spec](2026-05-09-project-init-design.md), [Slice 1 crypto-core spec](2026-05-09-crypto-core-design.md), [Slice 2 key-store spec](2026-05-09-key-store-design.md), [Slice 3 identity bootstrap spec](2026-05-09-identity-bootstrap-design.md)

## 1. Context

Slices 1–3 shipped the cryptographic foundation and the client-side identity surface. The application has no backend yet: there is no API, no Postgres, no Redis. Slice 4 lands the **server-side storage layer** that subsequent slices (sender flow, recipient flow) will sit on. After Slice 4, a runtime can persist link metadata, store opaque ciphertext blobs, atomically count opens against a max, sweep expired records, and rate-limit by key — all behind the three interfaces locked in the project init spec §7.

Slice 4 is **pure plumbing**. No new UI, no new API routes, no Sproobo provisioning. The deployment platform is intentionally irrelevant: the package consumes connection strings from `DATABASE_URL` and `REDIS_URL` env vars, so it works equally against local Docker, hosted Postgres+Redis, or a Sproobo-provisioned environment whenever that arrives.

The init spec §7 said we would discover whether Sproobo offers S3-compatible blob storage during planning. We are deliberately **not probing** that here — Phase 1 ships the documented Postgres-`bytea` fallback for ciphertext and defers the object-storage swap until either the swap is justified by load or Slice 5+ surfaces a concrete need. The interface boundary is already set up so that swap is a single-package change.

## 2. Goals

- Ship a new Node-only package `@aesmsg/server-store` containing:
  - The three interfaces from init spec §7 (`LinkMetadataStore`, `CiphertextStore`, `RateLimitStore`), now relocated here so consumers depend on this package rather than redefining them.
  - In-memory implementations of all three, suitable for unit tests and local prototyping.
  - Postgres-backed implementations of `LinkMetadataStore` and `CiphertextStore` (separate tables — same database, but distinct enough that swapping the ciphertext store to S3-compatible blob storage later is a one-package change).
  - A Redis-backed implementation of `RateLimitStore` using a fixed-window counter.
- Ship plain-SQL migrations + a tiny TS runner so the schema can be applied on a fresh database with one command.
- Ship a behavioral test suite that runs the same assertions against both Memory and Postgres implementations of each interface, ensuring contract parity.
- Gate integration tests behind `TEST_DATABASE_URL` and `TEST_REDIS_URL` env vars so CI without a database still passes.

## 3. Non-goals

- **No API routes in `apps/web`.** Slice 5 wires `/api/messages` and friends. A `/api/health` smoke route is a Slice 5 concern.
- **No Sproobo provisioning.** Postgres + Redis instance creation is the operator's concern, out of scope for this slice. The package consumes env vars.
- **No object-storage backend for ciphertext.** Phase 1 fallback per init spec §7 is Postgres `bytea`. We track this as a known follow-up but do not implement it here.
- **No backups, replication, disaster recovery, or read replicas.** Out of scope for the package itself.
- **No ORM (Drizzle, Prisma, Knex).** Phase 1's storage surface is 5 functions across 2 tables; raw parameterized SQL is shorter and clearer. Adopt an ORM if/when the schema graph grows.
- **No reversible-down migrations.** Phase 1 only goes forward; rollback is a database restore. Down-migration support arrives if/when Phase 2+ schema churn justifies the complexity.
- **No multi-tenancy or row-level security.** Phase 3.

## 4. Library choices

| Concern | Choice | Notes |
|---|---|---|
| Postgres client | [`pg`](https://github.com/brianc/node-postgres) | Most stable in the ecosystem; pooling via `pg.Pool` |
| Redis client | [`ioredis`](https://github.com/redis/ioredis) | Battle-tested; good TS types; supports the `INCR`/`EXPIRE NX` ops we need |
| Migration tool | None — plain SQL files + ~30-line TS runner | Phase 1 schema is small; external migration tools would be premature |
| Test runner | Vitest (Node) | Same toolchain Slices 1 + 2 already use |

## 5. Public API

```ts
// types.ts
export type LinkId = string & { readonly __linkIdBrand: unique symbol };

export type LinkStatus = "active" | "revoked" | "expired";

export interface LinkMetadata {
  readonly id: LinkId;
  readonly status: LinkStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly maxOpens: number;       // -1 means unlimited until expiry
  readonly opensCount: number;
  readonly recipientFingerprint: string;
}

// interfaces.ts
export interface LinkMetadataStore {
  create(record: Omit<LinkMetadata, "createdAt" | "opensCount" | "status">): Promise<LinkMetadata>;
  get(id: LinkId): Promise<LinkMetadata | null>;
  /** Atomic. Returns null if the link is not active or already past expiry/max-opens. */
  incrementOpens(id: LinkId): Promise<LinkMetadata | null>;
  revoke(id: LinkId): Promise<void>;
  /** Marks expired rows as expired and purges associated ciphertext. Returns number of ciphertexts purged. */
  expirePastDue(): Promise<number>;
}

export interface CiphertextStore {
  put(id: LinkId, blob: Uint8Array): Promise<void>;
  get(id: LinkId): Promise<Uint8Array | null>;
  delete(id: LinkId): Promise<void>;
}

export interface RateLimitStore {
  /** Increments the counter for `key` in the current `windowSeconds`-wide window and returns the new count. */
  incrementAndGet(key: string, windowSeconds: number): Promise<number>;
}

// implementations
export { MemoryLinkMetadataStore } from "./memory/link-metadata-store.js";
export { MemoryCiphertextStore } from "./memory/ciphertext-store.js";
export { MemoryRateLimitStore } from "./memory/rate-limit-store.js";

export { PgLinkMetadataStore } from "./pg/link-metadata-store.js";
export { PgCiphertextStore } from "./pg/ciphertext-store.js";
export { RedisRateLimitStore } from "./redis/rate-limit-store.js";

// connection helpers
export { getPool, closePool } from "./pg/pool.js";
export { getRedis, closeRedis } from "./redis/client.js";

// migrations
export { runMigrations } from "./migrate.js";
```

The connection helpers cache singletons keyed by URL so that calling `new PgLinkMetadataStore()` plus `new PgCiphertextStore()` shares one pool. Tests that need to control the lifecycle call `closePool` / `closeRedis` in `afterAll`.

## 6. Postgres schema

`packages/server-store/migrations/0001_init.sql`:

```sql
CREATE TABLE _migrations (
  filename     text PRIMARY KEY,
  applied_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE links (
  id              text PRIMARY KEY,
  status          text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  max_opens       integer NOT NULL CHECK (max_opens > 0 OR max_opens = -1),
  opens_count     integer NOT NULL DEFAULT 0 CHECK (opens_count >= 0),
  recipient_fp    text NOT NULL
);

CREATE INDEX idx_links_active_expires ON links (expires_at) WHERE status = 'active';

CREATE TABLE link_ciphertexts (
  link_id   text PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE,
  blob      bytea NOT NULL,
  size      integer NOT NULL CHECK (size >= 0)
);
```

`recipient_fp` stores the recipient public-key fingerprint. It is not strictly required for the link/ciphertext flow (decryption only needs the private key, not the fingerprint), but it is cheap to record at-rest and gives audit/grouping queries something to pivot on later. It is **not** indexed in Slice 4 — add the index when a query path actually wants it.

## 7. Atomic operations

### 7.1 `incrementOpens`

```sql
UPDATE links
SET opens_count = opens_count + 1,
    status = CASE
      WHEN max_opens != -1 AND opens_count + 1 >= max_opens THEN 'expired'
      ELSE status
    END
WHERE id = $1 AND status = 'active' AND expires_at > now()
RETURNING id, status, created_at, expires_at, max_opens, opens_count, recipient_fp;
```

- Single statement, no transaction needed.
- Returns 0 rows if the link is already revoked, expired, or past its expiry — caller treats that as "not openable" (404).
- The `CASE` flips status to `'expired'` on the same UPDATE that increments to the cap, so a future GET sees the row as expired without waiting for the sweep.
- Concurrency: Postgres uses MVCC + row locks; two simultaneous `incrementOpens` against the same row are serialized. The integration test asserts that exactly one of two parallel calls succeeds when `max_opens = 1`.

### 7.2 `expirePastDue`

```sql
-- Step 1: mark expired
UPDATE links
SET status = 'expired'
WHERE status = 'active' AND expires_at <= now();

-- Step 2: purge ciphertext for any non-active link
DELETE FROM link_ciphertexts
WHERE link_id IN (SELECT id FROM links WHERE status IN ('expired', 'revoked'));
```

Returns the row count from step 2 (number of ciphertexts purged). Step 1's count is discarded; what matters operationally is bytes freed, not metadata-rows-marked.

The metadata row is **kept** after expiry/revocation. This gives us the ability to surface "link expired" / "link revoked" instead of an undifferentiated "not found" — exactly what the recipient-flow design requires for §8 of the init spec ("expired/revoked links must not leak metadata" — they don't, because the only response is the same opaque "no longer available" error message regardless of which terminal state the metadata records).

The sweep is intended to be invoked by an external scheduler (cron, scheduled-task MCP, or Slice 5's per-request opportunistic sweep). Slice 4 does not schedule anything itself.

## 8. Redis rate-limit

Fixed-window counter:

```
KEY:   ratelimit:<key>:<window-floor-epoch-seconds>
VALUE: integer counter (auto-created at INCR, auto-deleted at TTL)
TTL:   set on first INCR equal to windowSeconds
```

Implementation:

```ts
async incrementAndGet(key: string, windowSeconds: number): Promise<number> {
  const windowFloor = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const redisKey = `ratelimit:${key}:${windowFloor}`;
  const tx = this.redis.multi();
  tx.incr(redisKey);
  tx.expire(redisKey, windowSeconds, "NX");  // only set TTL on first INCR
  const replies = await tx.exec();
  if (!replies) throw new Error("RateLimit: redis multi returned null");
  const [incrErr, count] = replies[0]!;
  if (incrErr) throw incrErr;
  return Number(count);
}
```

Fixed-window is simpler than sliding-window. Phase 1's rate-limit threat model (a recipient hammering `POST /api/messages/:id/ciphertext` to brute-force-fish a ciphertext from a stranger) is well-served by an N-per-minute counter; sub-second precision at the window boundary doesn't matter.

## 9. File layout

After this slice:

```
packages/server-store/
├─ package.json                              (new — Node-only; deps: pg, ioredis)
├─ README.md                                 (new — interfaces, env vars, local-Postgres recipe)
├─ tsconfig.json                             (new — Node lib, no DOM)
├─ vitest.config.ts                          (new — Node env, integration tests gated)
├─ migrations/
│  └─ 0001_init.sql                          (new)
├─ src/
│  ├─ index.ts                               (barrel)
│  ├─ types.ts                               (LinkId brand, LinkMetadata, LinkStatus)
│  ├─ interfaces.ts                          (the three Store interfaces)
│  ├─ migrate.ts                             (TS migration runner)
│  ├─ pg/
│  │  ├─ pool.ts
│  │  ├─ link-metadata-store.ts
│  │  └─ ciphertext-store.ts
│  ├─ redis/
│  │  ├─ client.ts
│  │  └─ rate-limit-store.ts
│  └─ memory/
│     ├─ link-metadata-store.ts
│     ├─ ciphertext-store.ts
│     └─ rate-limit-store.ts
└─ tests/
   ├─ shared-link-metadata-suite.ts          (parameterized contract tests)
   ├─ shared-ciphertext-suite.ts             (parameterized contract tests)
   ├─ shared-rate-limit-suite.ts             (parameterized contract tests)
   ├─ memory.test.ts                         (always runs)
   ├─ pg.test.ts                             (skip if !TEST_DATABASE_URL)
   ├─ redis.test.ts                          (skip if !TEST_REDIS_URL)
   └─ migrate.test.ts                        (skip if !TEST_DATABASE_URL)
```

The `shared-*-suite.ts` files export functions like `runLinkMetadataSuite(factory: () => Promise<LinkMetadataStore>)` so the same assertions run against Memory and Postgres backends — same contract, different backing.

## 10. Tests

### 10.1 Always-run suite (Memory)

`tests/memory.test.ts` exercises every method of every interface against the in-memory implementations. No database needed. Cases:

- `LinkMetadataStore`: create + get round-trip, get of missing, revoke + get returns revoked, incrementOpens correct count + status flip on hitting max_opens, incrementOpens on revoked returns null, expirePastDue marks past-expiry rows expired and purges (no purges in memory because memory ciphertext is keyed separately, but the simulation matches contract).
- `CiphertextStore`: put + get bytes-equal, get of missing returns null, delete + get returns null.
- `RateLimitStore`: first call returns 1, subsequent calls increment, TTL boundary resets the count, different keys are independent.

### 10.2 Gated integration suites

- `pg.test.ts` — connects to `TEST_DATABASE_URL`, runs the migration on a unique per-run schema (`aesmsg_test_<random>`), runs the same shared suites as `memory.test.ts` against `PgLinkMetadataStore` + `PgCiphertextStore`, plus Postgres-specific concurrency tests (two parallel `incrementOpens` calls against `max_opens = 1` — exactly one wins, the other returns null), then drops the schema in `afterAll`. Skipped at the top with `it.skipIf(!process.env.TEST_DATABASE_URL)` if the env var is absent.
- `redis.test.ts` — connects to `TEST_REDIS_URL`, uses a unique key prefix per run (`ratelimit:test_<random>:`) to avoid cross-run pollution, exercises window correctness across a 1-second window. Skipped without env var.
- `migrate.test.ts` — applies `0001_init.sql` against a fresh per-run schema, verifies `_migrations` table content, runs again, verifies idempotency (no rows added the second time, no errors).

### 10.3 Coverage gate

≥85% lines on `src/`. The cap is lower than crypto/key-store (95%) because integration code has unhappy-path branches (DB connection errors, Redis disconnects) that are awkward to cover in a unit test without contrived mocks. We tighten the gate when the package matures.

## 11. Configuration

The package reads configuration **only** from environment variables at the moment of first connection. There is no `Config` object passed to constructors — too much ceremony for a tiny surface.

| Env var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | For `Pg*` stores and `runMigrations` | Standard Postgres connection URL: `postgres://user:pass@host:port/dbname` |
| `REDIS_URL` | For `RedisRateLimitStore` | Standard Redis URL: `redis://[user:pass@]host[:port][/db]` |
| `TEST_DATABASE_URL` | For `pg.test.ts` and `migrate.test.ts` | If absent, those tests skip |
| `TEST_REDIS_URL` | For `redis.test.ts` | If absent, those tests skip |

`getPool()` and `getRedis()` cache the connection singletons keyed by URL. Calling them with a different URL returns a different (also-cached) connection — useful for tests that swap to a per-run schema.

## 12. README content

The package's README documents:

- The three interfaces and their semantics (with the example SQL for the atomic operations).
- A short "local development" section showing how to spin up Postgres + Redis via Docker:

  ```bash
  docker run --name pg -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:16
  docker run --name redis -p 6379:6379 -d redis:7
  export DATABASE_URL=postgres://postgres:secret@localhost:5432/postgres
  export REDIS_URL=redis://localhost:6379
  pnpm --filter @aesmsg/server-store exec tsx src/migrate.ts
  ```

- The fact that this package is **Node-only** and must never be imported from `@aesmsg/ui` or `apps/web`'s client-component code paths. Importing it from a Next.js Server Component or API route is fine.
- A pointer to Slice 5 (sender flow) for the API layer that consumes it.

## 13. Definition of done

- `pnpm typecheck` clean for every workspace.
- `pnpm lint` clean.
- `pnpm --filter @aesmsg/server-store test` passes with **no** database env vars set (only the Memory + migration-runner-shape suites run; integration suites skip cleanly).
- Setting `TEST_DATABASE_URL` and `TEST_REDIS_URL` adds the integration cases and the suite still passes end-to-end against a real Postgres + Redis (verified locally before merging).
- Coverage ≥85% lines on `packages/server-store/src/`.
- The migration runner is idempotent — running twice on the same database is a no-op for the second run, no errors.
- README documents interfaces, env vars, and the Docker recipe.
- The init spec §7 (storage adapter interfaces sketch) gets a cross-reference comment pointing readers to this package as the canonical home.

## 14. Risks and mitigations

- **`pg.Pool` connection storms.** A naive setup creates one client per query. Mitigation: every `Pg*Store` reads its pool from `getPool()` which returns the cached singleton; queries acquire a client, run, release.
- **Long-held transactions.** Slice 4 has none — every operation is one statement. The pattern stays "no transactions" until a real concurrency need surfaces.
- **Migration runner pitfalls.** Running the runner concurrently from two processes against a fresh database can race. Mitigation: the runner uses an advisory lock (`pg_advisory_lock(0xdeadbeef)`) to serialize; second runner waits for the first to finish.
- **Redis TTL edge case.** `EXPIRE … NX` (NX = only-if-no-existing-TTL) requires Redis ≥ 7.0. Most managed Redis is ≥ 7.0; if the deployment target is pinned older, fall back to checking `TTL` first or always `EXPIRE` (cheap, idempotent).
- **bytea size limits.** A single Postgres row's bytea can be up to ~1GB, but practical insert/select performance degrades well below that. Phase 1 messages are text-only and small; this is fine. When Phase 2 adds file attachments, ciphertext moves to object storage and this limitation goes away.
- **Schema drift between Memory and Postgres implementations.** Mitigation: the shared parameterized test suites force both backends to satisfy the same assertions. A drift bug breaks tests for one backend, not silently.

## 15. Out-of-scope, summarized

API routes (Slice 5), `/api/health` (Slice 5), Sproobo provisioning (operator concern), object-storage backend for ciphertext (later refactor), backups/replication/DR (operator concern), multi-tenancy (Phase 3), down-migrations (later if needed), ORM (later if justified).
