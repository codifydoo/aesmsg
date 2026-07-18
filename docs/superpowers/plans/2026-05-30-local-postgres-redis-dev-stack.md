# Local Postgres + Redis dev stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Postgres + Redis production storage path runnable on a laptop — bring up the engines with one command, run the previously-skipped integration suites against them, and boot `apps/web` in true production mode through them.

**Architecture:** Pure infra + glue. `apps/web/src/server/stores.ts` already switches to `Pg*`/`Redis*` stores when `NODE_ENV === "production"` and `DATABASE_URL` + `REDIS_URL` are set; the `@aesmsg/server-store` Pg/Redis code and the `pg.test.ts`/`redis.test.ts` suites already exist but skip without `TEST_DATABASE_URL`/`TEST_REDIS_URL`. We add a `docker-compose.yml`, a committed `.env.local.example`, and root `package.json` scripts. **No app or store source code changes.**

**Tech Stack:** Docker Compose v2, `postgres:17.10-alpine`, `redis:7.4.9-alpine`, pnpm 10, Vitest, Next.js 16.

> **Implementation note (2026-05-30):** host ports were remapped from the defaults to
> **`55432` (Postgres)** and **`56379` (Redis)** because 5432/6379 collide with other
> local services on the dev machine. The committed `docker-compose.yml`, `.env.local.example`,
> and the `test:integration`/`web:prod` scripts use these ports — the snippets below that
> still show `5432`/`6379` are superseded by the committed files. The one-off prod-mode
> verification also ran `apps/web` on port `3100` (not 3000) to avoid a stray local server.

---

## File structure

- **Create** `docker-compose.yml` (repo root) — defines `postgres` + `redis` services with pinned images, healthchecks, and a named pg volume.
- **Create** `.env.local.example` (repo root) — documents local connection + test URLs. The real `.env.local` is already gitignored.
- **Modify** `package.json` (repo root) — add `db:up`, `db:down`, `db:reset`, `test:integration`, `web:prod` scripts.
- **Modify** `README.md` (repo root) — add a "Local Postgres + Redis (dev)" subsection under "Database".

No test files are created — the deliverable's verification is running the *existing* integration suites against real engines plus an end-to-end app round-trip.

---

## Task 1: Compose file + local env example

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.local.example`

- [ ] **Step 1: Write `docker-compose.yml`**

Create `docker-compose.yml` at the repo root with exactly this content (no top-level `version:` key — it is obsolete in Compose v2 and emits a warning):

```yaml
# Local-only Postgres + Redis for exercising the production storage path.
# Brought up with `pnpm db:up`. Credentials here are dev-only and never used in prod.
services:
  postgres:
    image: postgres:17.10-alpine
    environment:
      POSTGRES_DB: aesmsg
      POSTGRES_USER: aesmsg
      POSTGRES_PASSWORD: aesmsg
    ports:
      - "5432:5432"
    volumes:
      - aesmsg-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aesmsg -d aesmsg"]
      interval: 3s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7.4.9-alpine
    ports:
      - "6379:6379"
    # No volume: Redis only holds ephemeral rate-limit counters.
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 10

volumes:
  aesmsg-pgdata:
```

- [ ] **Step 2: Write `.env.local.example`**

Create `.env.local.example` at the repo root with exactly this content:

```bash
# Local development against the docker-compose Postgres + Redis (`pnpm db:up`).
# Copy to `.env.local` (gitignored) if you want to source these into your shell.
# The pnpm scripts (`test:integration`, `web:prod`) already inline these URLs,
# so copying is optional — this file is documentation of the local endpoints.

# App production-mode switch (used by `pnpm web:prod`):
NODE_ENV=production
DATABASE_URL=postgres://aesmsg:aesmsg@localhost:5432/aesmsg
REDIS_URL=redis://localhost:6379/0

# Integration test gating (used by `pnpm test:integration`):
TEST_DATABASE_URL=postgres://aesmsg:aesmsg@localhost:5432/aesmsg
TEST_REDIS_URL=redis://localhost:6379/0
```

- [ ] **Step 3: Verify the compose file is valid**

Run: `docker compose config --quiet && echo OK`
Expected: prints `OK` with no warnings or errors (a non-zero exit or a YAML/validation error means the file is malformed).

- [ ] **Step 4: Confirm `.env.local.example` is tracked but `.env.local` is ignored**

Run: `git check-ignore .env.local; git status --short .env.local.example`
Expected: first command prints `.env.local` (it is ignored); second shows `.env.local.example` as a new untracked/added file. (`git check-ignore` exits 1 when its argument is *not* ignored — here it should print the path and exit 0.)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.local.example
git commit -m "feat: local Postgres + Redis docker-compose + env example"
```

---

## Task 2: Root package.json scripts

**Files:**
- Modify: `package.json` (repo root, `scripts` block)

- [ ] **Step 1: Add the scripts**

In the root `package.json`, the current `scripts` block is:

```json
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --filter web dev",
    "start": "pnpm --filter web start",
    "migrate": "pnpm --filter @aesmsg/server-store migrate",
    "typecheck": "pnpm -r typecheck",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "pnpm -r test"
  },
```

Replace it with this block (adds five scripts; existing ones unchanged). The inline env-var syntax is unix-shell (macOS/Linux), which is this repo's target:

```json
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --filter web dev",
    "start": "pnpm --filter web start",
    "migrate": "pnpm --filter @aesmsg/server-store migrate",
    "typecheck": "pnpm -r typecheck",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "pnpm -r test",
    "db:up": "docker compose up -d --wait",
    "db:down": "docker compose down",
    "db:reset": "docker compose down -v",
    "test:integration": "TEST_DATABASE_URL=postgres://aesmsg:aesmsg@localhost:5432/aesmsg TEST_REDIS_URL=redis://localhost:6379/0 pnpm --filter @aesmsg/server-store test",
    "web:prod": "DATABASE_URL=postgres://aesmsg:aesmsg@localhost:5432/aesmsg pnpm migrate && pnpm --filter web build && NODE_ENV=production DATABASE_URL=postgres://aesmsg:aesmsg@localhost:5432/aesmsg REDIS_URL=redis://localhost:6379/0 pnpm --filter web start"
  },
```

- [ ] **Step 2: Verify the JSON is valid and scripts are registered**

Run: `node -e "const s=require('./package.json').scripts; for (const k of ['db:up','db:down','db:reset','test:integration','web:prod']) if(!s[k]) throw new Error('missing '+k); console.log('all scripts present')"`
Expected: prints `all scripts present` (throws if any script is missing or the JSON is malformed).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add db:up/down/reset, test:integration, web:prod scripts"
```

---

## Task 3: Bring up the stack and run the integration suites

This task runs no commits — it proves the Postgres/Redis store code executes against real engines for the first time.

**Files:** none (verification only)

- [ ] **Step 1: Bring up the containers**

Run: `pnpm db:up`
Expected: Docker pulls `postgres:17.10-alpine` and `redis:7.4.9-alpine` (first run only), then both containers report healthy and the command exits 0. If `--wait` times out, the engines did not become healthy — inspect with `docker compose ps` and `docker compose logs`.

- [ ] **Step 2: Confirm both containers are healthy**

Run: `docker compose ps`
Expected: two services listed, both with State/Status showing `healthy`.

- [ ] **Step 3: Run the integration suites**

Run: `pnpm test:integration`
Expected: the `@aesmsg/server-store` Vitest run executes. Crucially, the suites that were previously skipped now **run**: the `describe("Postgres stores", …)` block (from `tests/pg.test.ts`), the `describe("RedisRateLimitStore", …)` block (from `tests/redis.test.ts`), and the `TEST_DATABASE_URL`-gated `getPool`/migrations blocks. All tests pass; the summary shows 0 failed and the previously-skipped DB suites are no longer reported as skipped.

- [ ] **Step 4: If a previously-unexercised store bug surfaces — STOP and report**

If any Postgres or Redis test *fails* (as opposed to passing), this is the latent-bug risk called out in the spec. Do not paper over it by editing the test. Capture the failing test name + assertion and report it as a separate finding — fixing store source code is out of this plan's scope.
Expected (happy path): this step is a no-op because Step 3 passed.

---

## Task 4: Boot apps/web in production mode and round-trip through Postgres

This task proves the running app selects the Postgres path and actually persists ciphertext. No commits.

**Files:** none (verification only)

- [ ] **Step 1: Build and start the app in production mode (background)**

Ensure containers are up (`pnpm db:up` from Task 3). Then start the production server in the background so the next steps can curl it:

Run: `pnpm web:prod` (run it backgrounded, e.g. append ` &` or use a background runner; it runs `migrate` → `next build` → `next start`)
Expected: `pnpm migrate` applies `0001_init.sql` (or reports it already applied — idempotent), `next build` completes, and `next start` logs `Ready` / listening on `http://localhost:3000`. NODE_ENV is `production`, so `getStores()` returns the Pg + Redis stores.

- [ ] **Step 2: Wait for the server to accept connections**

Run: `until curl -sf -o /dev/null http://localhost:3000; do sleep 1; done; echo UP`
Expected: prints `UP` once the server responds.

- [ ] **Step 3: POST a valid encrypted message**

The server stores ciphertext as opaque bytes (it never decrypts), so any ≥32-byte base64 blob with a well-formed id/fingerprint/expiry passes validation. `id` matches `^[A-Za-z0-9_-]{16}$`; `recipientFingerprint` matches `^SM-[0-9A-F]{4}(-[0-9A-F]{4}){7}$`; `ciphertext` is 64 `A`s = 48 zero bytes (≥32). Dates are generated relative to now (BSD `date`, macOS):

```bash
NOW_MS=$(( $(date +%s) * 1000 ))
EXPIRES=$(date -u -v+1H +%Y-%m-%dT%H:%M:%S.000Z)
curl -sS -X POST http://localhost:3000/api/messages \
  -H 'content-type: application/json' \
  -d "{\"id\":\"AbCdEfGhIjKlMnOp\",\"recipientFingerprint\":\"SM-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF\",\"ciphertext\":\"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\",\"createdAtMs\":$NOW_MS,\"expiresAt\":\"$EXPIRES\",\"maxOpens\":1}"
```

Expected: HTTP 201 with JSON body `{"id":"AbCdEfGhIjKlMnOp","url":"http://localhost:3000/l/AbCdEfGhIjKlMnOp"}`.

- [ ] **Step 4: Confirm the row landed in Postgres (not memory)**

```bash
docker compose exec -T postgres psql -U aesmsg -d aesmsg \
  -c "SELECT id, status, max_opens FROM links;" \
  -c "SELECT link_id, size FROM link_ciphertexts;"
```

Expected: `links` shows one row `AbCdEfGhIjKlMnOp | active | 1`; `link_ciphertexts` shows `AbCdEfGhIjKlMnOp | 48`. This proves the ciphertext was persisted to Postgres by the running app, confirming the production store wiring.

- [ ] **Step 5: Confirm read-back through the API**

Run: `curl -sS http://localhost:3000/api/messages/AbCdEfGhIjKlMnOp`
Expected: HTTP 200 JSON containing `"status":"active"`, `"recipientFingerprint":"SM-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF"`, `"maxOpens":1`, `"opensCount":0`. (This GET is the safe-preview path and does not consume an open.)

- [ ] **Step 6: Tear down the app and reset the DB**

Stop the backgrounded `next start` process (e.g. `kill %1` or kill the pid). Then reset so no test row lingers:

Run: `pnpm db:reset`
Expected: containers stop and the `aesmsg-pgdata` volume is removed; exit 0. (Re-running `pnpm db:up` later starts from a clean schema.)

---

## Task 5: Document the local stack in the README

**Files:**
- Modify: `README.md` (repo root)

- [ ] **Step 1: Add a subsection under "Database"**

In `README.md`, the "Database" section currently ends with the advisory-lock sentence immediately before the `## Deploying` heading. Insert this subsection between them (after the advisory-lock paragraph, before `## Deploying`):

````markdown
### Local Postgres + Redis (dev)

By default `pnpm dev` uses in-memory stores. To exercise the real production
storage path locally, bring up Postgres + Redis with Docker:

```bash
pnpm db:up            # start postgres:17.10-alpine + redis:7.4.9-alpine (waits for healthy)
pnpm test:integration # run the Pg/Redis store suites against the containers
pnpm web:prod         # migrate + build + start apps/web in production mode against them
pnpm db:down          # stop (keep data)   ·   pnpm db:reset   # stop + drop the pg volume
```

`pnpm dev` cannot use Postgres: the store switch requires `NODE_ENV=production`,
which `next dev` does not set. Use `pnpm web:prod` (build + start) to hit Postgres
through the app. Local connection URLs are documented in
[`.env.local.example`](.env.local.example).
````

- [ ] **Step 2: Verify the markdown renders the code block correctly**

Run: `grep -n "Local Postgres + Redis (dev)" README.md`
Expected: prints one matching line, confirming the subsection was inserted.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document local Postgres + Redis dev stack"
```

---

## Self-review notes

- **Spec coverage:** compose file (Task 1), `.env.local.example` (Task 1), root scripts incl. `db:*`/`test:integration`/`web:prod` (Task 2), running the previously-skipped suites (Task 3), prod-mode app boot + round-trip (Task 4), README docs (Task 5). The "no app/store code changes" and "no CI changes" non-goals are respected — no task touches `src/` or CI config. The latent-store-bug risk has an explicit STOP-and-report step (Task 3 Step 4).
- **Pinned tags:** `postgres:17.10-alpine` and `redis:7.4.9-alpine` are the latest patched alpine tags on Docker Hub as of 2026-05-30 (verified against the registry tag list). Bump the pin if a newer patch ships.
- **Types/values consistency:** the same dev credentials (`aesmsg`/`aesmsg`/`aesmsg`), URLs, and the test id `AbCdEfGhIjKlMnOp` are reused verbatim across compose, env example, scripts, README, and the round-trip — they line up with the handler's validation regexes (`LINK_ID_REGEX`, `FINGERPRINT_REGEX`) and the 32-byte minimum ciphertext.
