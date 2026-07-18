# Local Postgres + Redis dev stack

**Date:** 2026-05-30
**Status:** Approved (design); implemented with host ports remapped to 55432/56379
**Author:** brainstormed with Claude

> **Implementation note:** the default host ports 5432/6379 collide with other local
> Postgres/Redis services on the dev machine, so the implementation maps host ports
> **55432 → 5432** and **56379 → 6379**. Connection URLs below that show `5432`/`6379`
> are superseded by the committed `docker-compose.yml` and `.env.local.example`.

## Problem

`apps/web` selects its storage backend at runtime in
`apps/web/src/server/stores.ts`:

```ts
const useProduction =
  process.env.NODE_ENV === "production" && !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
```

When that condition is true it uses the **Postgres** (`PgLinkMetadataStore`,
`PgCiphertextStore`) and **Redis** (`RedisRateLimitStore`) implementations from
`@aesmsg/server-store`; otherwise it falls back to in-memory stores so
`pnpm dev` works without containers.

The Postgres/Redis code, the migration runner
(`packages/server-store/src/migrate.ts` + `migrations/0001_init.sql`), and the
integration suites (`packages/server-store/tests/pg.test.ts`,
`tests/redis.test.ts`) **already exist and are complete**. But:

- The integration suites are gated `describe.skipIf(!TEST_DATABASE_URL)` /
  `skipIf(!TEST_REDIS_URL)`, so in CI and locally they **skip** — the Postgres
  and Redis code paths have never actually run.
- There is no local way to bring up Postgres + Redis, so nobody can run those
  suites or boot `apps/web` in production mode against a real database.

This is config/infra, not application code. The goal is to make the existing
production storage path runnable and provable on a laptop.

## Goals

1. One command brings up local Postgres + Redis.
2. The previously-skipped `pg.test.ts` / `redis.test.ts` suites run against the
   real engines and pass.
3. `apps/web` can boot in **true production mode** against the local containers,
   so a create → fetch round-trip is proven to hit Postgres.
4. **Zero changes to app or store source code.** The runtime switch is already
   env-driven; we only add infra + glue.

## Non-goals

- No changes to `apps/web/src/server/stores.ts` or any `@aesmsg/server-store`
  source. (If a real bug surfaces while running the suites, that is a separate
  fix, out of this scope.)
- No edits to the existing production `.env.example` (it documents real deploy
  config and stays as-is).
- **No CI changes.** The integration suites remain opt-in/local and stay skipped
  in CI. Adding CI service containers is a possible follow-up, explicitly not in
  this slice.
- No Sproobo deploy plumbing (Dockerfile, compose for prod, migration hook in
  deploy). That is the separate "deploy" track noted in CLAUDE.md.

## Design

### 1. `docker-compose.yml` (repo root)

Two services:

- **postgres** — image `postgres:<latest-17-patch>-alpine`, pinned to a specific
  patched tag (exact patch confirmed against Docker Hub at implementation time;
  pinned, not floating `:17` or `:latest`).
  - env: `POSTGRES_DB=aesmsg`, `POSTGRES_USER=aesmsg`,
    `POSTGRES_PASSWORD=aesmsg` — dev-only credentials, never used in prod.
  - ports: `5432:5432`.
  - volume: named `aesmsg-pgdata` for persistence across `db:up`/`db:down`.
  - healthcheck: `pg_isready -U aesmsg`.
- **redis** — image `redis:<latest-7.4-patch>-alpine`, pinned to a specific
  patched tag.
  - ports: `6379:6379`.
  - **no volume** — Redis only holds ephemeral rate-limit counters; losing them
    on restart is correct, not a data-loss bug.
  - healthcheck: `redis-cli ping`.

Notes:

- Both pinned to specific patched tags (defensive CVE posture). The exact patch
  numbers are verified at build time so we pin a tag that actually exists.
- Redis ≥ 7.4 ships under RSALv2/SSPL. Acceptable for local dev. `ioredis` would
  also work against Valkey if a license-clean swap is ever wanted — out of scope
  here.

### 2. Env example files

- Add **`.env.local.example`** (committed) documenting the local URLs:

  ```
  DATABASE_URL=postgres://aesmsg:aesmsg@localhost:5432/aesmsg
  REDIS_URL=redis://localhost:6379/0
  TEST_DATABASE_URL=postgres://aesmsg:aesmsg@localhost:5432/aesmsg
  TEST_REDIS_URL=redis://localhost:6379/0
  ```

- The real `.env.local` is already gitignored (`.gitignore` ignores `.env.local`
  and `.env.*.local`). The existing production `.env.example` is untouched.

### 3. Root `package.json` convenience scripts

- `db:up` → `docker compose up -d --wait` (blocks until both healthchecks pass).
- `db:down` → `docker compose down` (keeps the pg volume).
- `db:reset` → `docker compose down -v` (drops the pg volume for a clean slate).
- `test:integration` → runs the server-store suites with `TEST_DATABASE_URL` and
  `TEST_REDIS_URL` set to the local URLs:

  ```
  TEST_DATABASE_URL=postgres://aesmsg:aesmsg@localhost:5432/aesmsg \
  TEST_REDIS_URL=redis://localhost:6379/0 \
  pnpm --filter @aesmsg/server-store test
  ```

  The pg suite **self-migrates** — it creates a throwaway schema per run and
  calls `runMigrations` itself — so no separate migrate step is required for
  tests.

Inline env-var scripts are unix-shell syntax (macOS/Linux). This repo is
pnpm/unix-oriented and the developer is on macOS; Windows `cmd` is not a target.

### 4. Booting `apps/web` in production mode (the one real gotcha)

`stores.ts` only selects Postgres when `NODE_ENV === "production"`. `next dev`
forces `NODE_ENV=development`, so the dev server would silently use in-memory
stores. Exercising the Pg path through the app therefore requires a **production
build + start**, not dev.

Add a `web:prod` helper that:

1. runs `pnpm migrate` once (reads `DATABASE_URL`) to create the schema, then
2. runs `next build && next start` for `apps/web` with
   `NODE_ENV=production`, `DATABASE_URL`, and `REDIS_URL` set.

This is documented so it is obvious why `pnpm dev` does not hit Postgres.

## Data flow (production path, once running)

```
POST /api/messages
  → createMessagesHandler (apps/web/src/server/messages-handler.ts)
  → getStores() returns Pg + Redis stores (NODE_ENV=production + URLs set)
  → links.create()            → INSERT into links            (Postgres)
  → ciphertexts.put(id, blob) → INSERT into link_ciphertexts (Postgres)
  → rate limiting             → sliding-window counter        (Redis)
```

## Verification

1. `pnpm db:up` → both containers report healthy.
2. `pnpm test:integration` → the previously-skipped `pg.test.ts` and
   `redis.test.ts` suites **run** (no longer skipped) and pass.
3. `pnpm web:prod` → app boots; a create → fetch round-trip confirms the
   ciphertext is stored in and read back from Postgres (e.g. inspect
   `link_ciphertexts` via `docker compose exec postgres psql`).

## Risks / open questions

- Running the Pg/Redis suites for the first time against real engines may surface
  a latent bug in store code that the in-memory suites never exercised. If so,
  that fix is tracked separately (it is not a goal to pre-empt it here, but it is
  the most likely surprise).
- Exact patched image tags are resolved at implementation time; if the chosen
  patch is later superseded, bumping the pin is a one-line change.
