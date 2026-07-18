# Deploying aesmsg

aesmsg deploys via [Sproobo](https://sproobo.com). Sproobo handles containerization, nginx, TLS, and provisions the Postgres and Redis services the backend depends on. **Never deploy to Vercel.**

## The three deployables

The product ships as three independent services. Only the first two are a backend; the web app is a static marketing/bouncer site with no backend of its own.

| Deployable | What it is | Depends on |
|---|---|---|
| **`apps/api`** | Standalone **Fastify** service hosting the message API (`/api/messages/*`) over `@aesmsg/server-store`. The **native apps** are its only clients. | Postgres, Redis |
| **`apps/worker`** | Headless sweeper. Periodically runs `expirePastDue()` to physically purge expired/revoked ciphertext from Postgres. No network ports. | Postgres |
| **`apps/web`** | Static **Next.js 16** site: marketing landing at `/`, deep-link bouncer at `/l/[id]`, plus `/docs`, `/privacy`, `/terms`. **No crypto, no database, no API routes.** | nothing (serves static output) |

All cryptography, identity, and key handling live in the **native apps** and `@aesmsg/crypto`. Neither the API nor the web app ever sees plaintext or a private key — the server stores only ciphertext + minimal metadata (link id, expiry, max-opens, opens count, status).

---

## `apps/api` — the message API (Fastify, port 4000)

Runs via `tsx` (no build step). Deploy it as a long-running container behind the same-host nginx.

### Environment

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **prod** | Postgres for ciphertext + link metadata. Attach a Sproobo Postgres service. |
| `REDIS_URL` | **prod** | Redis for rate limiting. Attach a Sproobo Redis service. |
| `RATE_LIMIT_IP_SALT` | **prod** | HMAC salt for rate-limit IP keys — **≥ 32 bytes**. The process **refuses to boot in production without it** (it fails closed rather than log raw IPs). Generate with `openssl rand -hex 32`. |
| `AESMSG_PUBLIC_LINK_ORIGIN` | **prod** | Origin used to build the `/l/:id` links returned by `POST /api/messages` — the **web** host (e.g. `https://aesmsg.com`), not the API host. |
| `AESMSG_TRUST_PROXY` | **prod** | How much of the `X-Forwarded-For` chain to trust when deriving the client IP for the rate limiter. Behind a single same-host nginx this **must be `1`**. The per-IP limiter is the only abuse control, so proxy trust is opt-in and must match your topology — an over-broad value lets clients forge `X-Forwarded-For` and bypass the limiter. |
| `AESMSG_METRICS_TOKEN` | no (recommended) | Bearer token that gates `GET /metrics` (aggregate ops metrics). **Unset ⇒ `/metrics` returns `404`** (disabled). Set to a `openssl rand -hex 32` value to enable scraping, and keep the path off the public vhost. See [`ops-runbook.md`](ops-runbook.md). |
| `PORT` | no | Listen port (default `4000`). |

> **Fail-closed boot guards (do not "fix" by relaxing them):** in `NODE_ENV=production`, a missing `DATABASE_URL`/`REDIS_URL` or a missing/short `RATE_LIMIT_IP_SALT` makes the process exit non-zero at boot. This is deliberate — the alternative is a green health check silently serving in-memory stores that lose every link on restart, or logging reversible client IPs. `/api/health` is store-free and returns `200` regardless, so it will **not** catch a store misconfiguration; verify the env, not just the health check.

See [`../apps/api/.env.example`](../apps/api/.env.example) for the authoritative list.

### Run

```bash
pnpm --filter @aesmsg/api start
```

---

## `apps/worker` — the expiry sweeper

A closed internal maintenance process: no Redis, no network ports. Deploy as its own long-running Sproobo service.

### Environment

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres. The worker **refuses to start without it** — a separate-process in-memory store shares no state with the API and would purge nothing. |
| `AESMSG_EXPIRY_SWEEP_INTERVAL_MS` | no | Sweep cadence in ms (default `900000` = 15 min). A link stops serving the instant it expires; this only controls how soon the opaque ciphertext blob is physically purged. Set to `0` to disable. |
| `AESMSG_SWEEP_RUN_ON_START` | no | Run one sweep immediately on boot to clear backlog after a deploy (default `true`). |

See [`../apps/worker/.env.example`](../apps/worker/.env.example) for the authoritative list.

### Run

```bash
pnpm --filter @aesmsg/worker start
```

---

## `apps/web` — static marketing + bouncer

A static Next.js site. It makes **zero** backend calls: the bouncer at `/l/[id]` only hands off to the installed native app via the `aesmsg://l/<id>` custom scheme (this is what keeps messaging-app URL unfurlers from consuming an open or touching ciphertext). It needs **no** database, Redis, salt, or link-origin env.

```bash
pnpm --filter web build   # produce apps/web/.next/
pnpm --filter web start   # next start
```

The convenience script `pnpm web:prod` runs that build + start pair.

To serve Universal Links / App Links, the web host must also serve
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` — see
[`../apps/mobile/README.md`](../apps/mobile/README.md) for the required contents.

---

## Database migrations (before starting the API/worker)

The `@aesmsg/server-store` package owns the schema. Apply pending SQL files once per deploy, before the API and worker start:

```bash
DATABASE_URL=postgres://... pnpm migrate
```

`pnpm migrate` applies any new files from [`../packages/server-store/migrations/`](../packages/server-store/migrations/) to Postgres. It is idempotent and holds a Postgres advisory lock, so re-running after a no-op deploy and concurrent invocations are both safe.

---

## Build / release / start order

| Phase | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Migrate (once per deploy, before the API/worker start) | `DATABASE_URL=… pnpm migrate` |
| Start the API | `pnpm --filter @aesmsg/api start` |
| Start the worker | `pnpm --filter @aesmsg/worker start` |
| Build + start the static web | `pnpm --filter web build && pnpm --filter web start` |

---

## Smoke test after deploy

The message flow is a **native-app** flow, so the API is exercised with a client (or `curl`), not a browser.

1. `GET https://<api-host>/api/health` → `200 {"status":"ok"}` (store-free — proves the process is up, **not** that the stores are configured).
2. `POST /api/messages` with a body `{ id, ciphertext, expiresAt, maxOpens }` → `201 { id, url }`, where `url` uses `AESMSG_PUBLIC_LINK_ORIGIN` (the web host).
3. `GET /api/messages/:id` → safe metadata preview, **never consumes an open**.
4. `POST /api/messages/:id/open` → returns the ciphertext and consumes one open; a second call past `maxOpens` returns an opaque `410`.
5. `POST /api/messages/:id/revoke` → `200`; a subsequent `GET` returns an opaque `404` and `/open` an opaque `410` (revoked/expired/missing are indistinguishable).
6. Open `https://<web-host>/` — the landing renders with no backend round-trips. Open `https://<web-host>/l/<id>` — the bouncer offers to open the native app and makes **no** API call.

If step 2+ fail with `500`s or the API refuses to boot, check env first: in production the process exits non-zero without `DATABASE_URL`, `REDIS_URL`, and a `≥ 32`-byte `RATE_LIMIT_IP_SALT`, and `pnpm migrate` must have run since the last schema change.

---

## Operations: metrics + abuse purge

Day-2 ops live in [`ops-runbook.md`](ops-runbook.md):

- **Aggregate metrics** — `GET /metrics` (Prometheus text), gated by `AESMSG_METRICS_TOKEN`. Track
  request/error/rate-limit counts and storage volume; **aggregate only** (no id/IP/ciphertext).
  The `aesmsg_store_memory_fallback` gauge is the runtime signal for the R1 silent-in-memory
  footgun. Wiring a scraper + alerts is your Sproobo config.
- **Purge a reported link id** (abuse/CSAM/legal) —
  `DATABASE_URL=… pnpm --filter @aesmsg/server-store purge <id>`. Purges the ciphertext + marks the
  row terminal, transactionally and idempotently. This is the only moderation lever a
  zero-knowledge store can offer.

---

## Rolling back

Migrations are forward-only — there are no `down` files. To roll back a release, redeploy the previous image. The schema is additive; older builds run against newer schemas as long as the columns they read still exist. A destructive schema change (column drop, type narrowing) must ship with an explicit migration plan documented in the relevant slice spec before merging.
