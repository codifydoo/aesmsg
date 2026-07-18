# aesmsg release / deploy checklist

A single ordered checklist an operator follows to deploy the hardened backend and cut a mobile
release. This is the **flow**; it links out to the existing docs rather than duplicating them:

- Topology + per-service run commands: [`deploy.md`](deploy.md)
- Day-2 metrics, alerts, and id-purge: [`ops-runbook.md`](ops-runbook.md)
- Erasure / DSR context for a purge: [`data-subject-requests.md`](data-subject-requests.md)
- What the crypto does / does not protect: [`security-model.md`](security-model.md)

> Copy discipline (same as the docs above): never claim "unbreakable", "impossible to hack", or
> "military-grade". Describe bounded guarantees.

---

## 1. Overview — what ships

Four surfaces, three of them deployable services (see [`deploy.md`](deploy.md) for the full topology):

| Surface | What it is | Deps |
|---|---|---|
| **`apps/api`** | Fastify message API (`/api/messages/*`), listens on port **4000**. The native apps are its only clients. | Postgres, Redis |
| **`apps/worker`** | Headless expiry sweeper — periodically purges expired/revoked ciphertext. No network ports. | Postgres |
| **`apps/web`** | Static Next.js site (landing `/`, bouncer `/l/[id]`, `/docs`, `/privacy`, `/terms`). No backend, no env. | none |
| **`apps/mobile`** | React Native / Expo app — the real product surface. All crypto + keys live here. | the API |

Deploy order: **migrate → API → worker → web**, then the mobile release.

---

## 2. Pre-deploy blockers (standing gaps — clear these first)

- [ ] **CI has never actually run.** The workflow exists at
  [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (lint + typecheck + unit, browser-mode,
  and pg/redis integration jobs) but no run has executed yet. Enable GitHub Actions for the
  repository so the workflow can run and actually gate merges into `main`. Until then, run
  `pnpm lint && pnpm typecheck && pnpm test` locally before every release.
- [ ] **Register the `@aesmsg` npm scope (defensive).** The packages are all `private`/`workspace:*`
  and nothing is published, but the docs have historically referenced an `@aesmsg/*` scope. Claim the
  scope to prevent a look-alike from being squatted. This is precautionary, not a publish step.

---

## 3. Environment & secrets

Set these on Sproobo per service. `NODE_ENV=production` is baked into both server Dockerfiles
([`apps/api/Dockerfile`](../apps/api/Dockerfile), [`apps/worker/Dockerfile`](../apps/worker/Dockerfile))
— that is what arms the fail-closed boot guards.

> **Fail-closed boot (do not relax):** in `NODE_ENV=production` the API exits non-zero at boot if
> `DATABASE_URL`/`REDIS_URL` is missing (`assertProductionConfig` →
> `apps/api/src/stores/store-backend.ts`) or if `RATE_LIMIT_IP_SALT` is missing / `< 32` bytes
> (`apps/api/src/lib/hash-ip.ts`). `GET /api/health` is store-free and returns `200` regardless, so it
> will **not** catch a store misconfiguration — verify the env, not just the health check.

### `apps/api` (source: [`apps/api/.env.example`](../apps/api/.env.example))

| Var | Required | Purpose | Generate / value | If missing |
|---|---|---|---|---|
| `DATABASE_URL` | **prod** | Postgres for ciphertext + link metadata. | Sproobo Postgres URL | API exits non-zero at boot (`store-backend.ts`). |
| `REDIS_URL` | **prod** | Redis for the per-IP rate limiter. | Sproobo Redis URL | API exits non-zero at boot. |
| `RATE_LIMIT_IP_SALT` | **prod** | HMAC salt so rate-limit keys never embed raw IPs. Must be **≥ 32 bytes** (`hash-ip.ts` `MIN_SALT_BYTES`). | `openssl rand -hex 32` | API exits non-zero at boot (else every request 500s fail-closed). |
| `AESMSG_PUBLIC_LINK_ORIGIN` | **prod** | Origin used to build the `/l/:id` URL returned by create — the **web** host, not the API host. Default `https://aesmsg.com` (`server.ts`). | `https://aesmsg.com` | Falls back to `https://aesmsg.com`; wrong value ⇒ broken links. |
| `AESMSG_TRUST_PROXY` | **prod** | XFF hops to trust for `request.ip` (`lib/trust-proxy.ts`). Behind one same-host nginx this **must be `1`**; too broad lets clients forge XFF and bypass the limiter. | `1` | Defaults to `false` (uses socket addr = nginx) → over-limits behind a proxy. |
| `AESMSG_MAX_RETENTION_MS` | no | Retention ceiling; a create whose lifetime exceeds it is rejected `400` (never clamped — expiry is in the HPKE AAD). Default **`31536000000`** = 365 days (`DEFAULT_MAX_RETENTION_MS` in `handlers/messages-handler.ts`). | leave unset, or ms value **≥** client's longest lifetime | Falls back to 365 days (soft config, never blocks boot). |
| `AESMSG_METRICS_TOKEN` | no (recommended) | Bearer token gating `GET /metrics` (`routes/metrics.ts`). | `openssl rand -hex 32` | **Unset ⇒ `/metrics` returns an opaque `404`** (endpoint disabled/undiscoverable). |
| `PORT` | no | Listen port. Default **`4000`** (`.env.example`, Dockerfile). | `4000` | Defaults to `4000`. |

### `apps/worker` (source: [`apps/worker/.env.example`](../apps/worker/.env.example))

| Var | Required | Purpose | Generate / value | If missing |
|---|---|---|---|---|
| `DATABASE_URL` | **yes** | Postgres. A separate-process in-memory store shares no state with the API and would purge nothing. | Sproobo Postgres URL (same DB as the API) | Worker logs the error and `process.exit(1)` (`apps/worker/src/index.ts`). |
| `AESMSG_EXPIRY_SWEEP_INTERVAL_MS` | no | Sweep cadence in ms. Default **`900000`** = 15 min (`apps/worker/src/config.ts`). `0` disables the job. | leave unset | Defaults to 15 min. |
| `AESMSG_TERMINAL_ROW_RETENTION_MS` | no | How long terminal (expired/revoked) metadata rows are kept before the sweep prunes them. Default **`2592000000`** = 30 days (`DEFAULT_TERMINAL_ROW_RETENTION_MS` in `packages/server-store/src/retention.ts`). | leave unset | Defaults to 30 days. |
| `AESMSG_SWEEP_RUN_ON_START` | no | Run one sweep immediately on boot to clear post-deploy backlog. Default **`true`** (`config.ts`); only the literal string `"false"` disables it. | leave unset | Defaults to `true`. |

### `apps/web`

**No environment variables.** The static site makes zero backend calls (`package.json` has only
`next build` / `next start`); the bouncer hands off to the native app via the `aesmsg://l/<id>`
scheme. Do not set `DATABASE_URL`/`REDIS_URL`/salt here.

---

## 4. Database migrations (before API/worker boot)

`@aesmsg/server-store` owns the schema. Apply pending SQL once per deploy, before the services start:

```bash
DATABASE_URL=postgres://…  pnpm migrate
```

`pnpm migrate` → `pnpm --filter @aesmsg/server-store migrate` → `tsx src/migrate.ts`
(root + package scripts verified in `package.json` and `packages/server-store/package.json`). The
runner (`packages/server-store/src/migrate.ts`) holds a **Postgres advisory lock** (`0xdeadbeef`),
tracks applied files in a `_migrations` table, and applies only new files in sorted order — so it is
**idempotent** and safe under concurrent / blue-green starts. Migrations are **forward-only** (no
`down` files).

Both server containers also run this automatically at boot via their entrypoints
(`apps/api/docker-entrypoint.sh`, `apps/worker/docker-entrypoint.sh`) before `exec`-ing Node, so a
manual run is optional but recommended as an explicit gate.

Migration files ([`packages/server-store/migrations/`](../packages/server-store/migrations/)):

| File | Purpose |
|---|---|
| `0001_init.sql` | Create `links` + `link_ciphertexts` tables and the partial `active`/`expires_at` index. |
| `0002_drop_recipient_fp_and_nullable_createdat.sql` | Drop `recipient_fp`; make `created_at` nullable + drop its default (metadata-leakage mitigation). |
| `0003_add_revocation_token_hash.sql` | Add nullable `revocation_token_hash` for authenticated revocation (BE-1). |
| `0004_add_terminal_at_and_retention_index.sql` | Add `terminal_at` + a partial terminal-row index for the bounded-retention sweep (BE-7). |

---

## 5. Deploy steps (ordered)

Sproobo builds both server images from the repo root against their per-app Dockerfiles. Both images
run as the non-root `node` user, run migrations then `exec node` so **Node is PID 1** (clean
SIGTERM / graceful shutdown), and the API image carries a `HEALTHCHECK` against `/api/health`.

1. [ ] **Migrate** (§4) — `DATABASE_URL=… pnpm migrate` (or rely on the entrypoints).
2. [ ] **Build + run `apps/api`** ([`apps/api/Dockerfile`](../apps/api/Dockerfile)) with the §3 API env.
   Behind the same-host nginx, set `AESMSG_TRUST_PROXY=1`.
   - [ ] **nginx body size:** the create body is the base64-inflated ciphertext. The handler caps
     ciphertext at **26 MiB** (`MAX_CIPHERTEXT_BYTES` in `handlers/messages-handler.ts`) → up to a
     **37 MiB** JSON body (`MAX_BODY_BYTES`), and Fastify's own `bodyLimit` is **38 MiB**
     (`server.ts`). Set nginx **above** that — recommend `client_max_body_size 40m;` — or MB-scale
     attachments 413 at the edge before the app can answer.
   - [ ] **`/metrics` stays internal:** keep the path off the public vhost and scrape it over
     localhost / the internal network (see [`ops-runbook.md` §1](ops-runbook.md)).
3. [ ] **Build + run `apps/worker`** ([`apps/worker/Dockerfile`](../apps/worker/Dockerfile)) with
   `DATABASE_URL` (same DB as the API). No ports, no Redis, no HEALTHCHECK by design.
4. [ ] **Deploy `apps/web`** — `pnpm --filter web build && pnpm --filter web start` (or `pnpm web:prod`).
   No env. Also serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
   (contents in [`../apps/mobile/README.md`](../apps/mobile/README.md)) for Universal / App Links.

---

## 6. Smoke tests

The message flow is a native-app flow, so exercise the API with `curl`, not a browser.

```bash
# 1. Liveness — store-free, proves the process is up (NOT that stores are configured).
curl -sS https://<api-host>/api/health          # → 200 {"status":"ok"}

# 2. /metrics gate (only if AESMSG_METRICS_TOKEN is set; keep this to the internal host).
curl -sS https://<internal-api-host>/metrics                                   # → 404 without a token
curl -sS -H "Authorization: Bearer $AESMSG_METRICS_TOKEN" \
     https://<internal-api-host>/metrics                                       # → 200 text/plain aggregate metrics
```

**Full create → GET → open → revoke** (illustrative — a real create needs a valid body):
`POST /api/messages` with `{ id, ciphertext, expiresAt, maxOpens }` where `id` matches the 16-char
link-id shape (`^[A-Za-z0-9_-]{16}$`, `lib/link-id.ts`) and `ciphertext` is base64 for a blob of
**32 bytes … 26 MiB**. On success it returns `201 { id, url, revocationToken }` (the token is shown
**once**). Then:

- `GET /api/messages/:id` → safe metadata preview; **never consumes an open**.
- `POST /api/messages/:id/open` (empty body) → returns the ciphertext and consumes one open; past
  `maxOpens` → opaque `410`.
- `POST /api/messages/:id/revoke` (empty body, revocation token in the header) → `200`; a later `GET`
  → opaque `404` and `/open` → opaque `410` (revoked/expired/missing are indistinguishable).

Because a valid create requires a real ≥32-byte ciphertext, **the mobile app is the real
end-to-end smoke test** — run a compose → send → open → revoke against production once.

---

## 7. Mobile release (pointer, not a full guide)

1. [ ] **Bundle fonts.** Drop the three `.ttf` assets into `apps/mobile/assets/fonts/`, register the
   `require(...)` entries, and set `FONTS_BUNDLED = true` — the exact 3 steps are in
   [`../apps/mobile/assets/fonts/README.md`](../apps/mobile/assets/fonts/README.md). Without this the
   app falls back to system fonts (mono still renders monospaced).
2. [ ] **EAS build + submit.** Config is in [`../apps/mobile/eas.json`](../apps/mobile/eas.json) and
   [`../apps/mobile/app.config.ts`](../apps/mobile/app.config.ts). Verified ids from source:
   - iOS `bundleIdentifier` **`com.aesmsg.app`**, App Store Connect `ascAppId` **`6775473926`**,
     `appleTeamId` **`YKU945Y6BG`** (`eas.json` submit.production.ios; store listing id6775473926).
   - Android `package` **`com.aesmsg.app`**, Play submit track `internal`
     (`eas.json` submit.production.android).
   - Production build env pins `AESMSG_API_BASE_URL=https://api.aesmsg.com` and
     `AESMSG_HOST=aesmsg.com` (`eas.json` build.production.env).

   Follow the app's own toolchain in [`../apps/mobile/README.md`](../apps/mobile/README.md) for the
   actual `eas build` / `eas submit` invocations and store credentials. Do not invent Apple/Play
   login details here.

---

## 8. Post-deploy / observability

- [ ] **Wire `/metrics` scraping + alerts.** Point a Prometheus-compatible scraper at `/metrics`
  with the bearer token and route alerts to on-call. Full metric list + recommended alerts are in
  [`ops-runbook.md` §1–§2](ops-runbook.md).
- [ ] **Alert on the R1 fallback gauge.** `aesmsg_store_memory_fallback == 1` in production means the
  API is silently serving on in-memory stores (imminent total data loss) — page immediately
  (see [`ops-runbook.md`](ops-runbook.md)).
- [ ] **Confirm the sweeper is purging.** Check `aesmsg_active_links` / `aesmsg_ciphertext_bytes`
  trend down as links expire.
- [ ] **Know the id-purge path.** To remove a reported link (abuse / CSAM / legal):
  `DATABASE_URL=… pnpm --filter @aesmsg/server-store purge <id>` — transactional + idempotent, the
  only moderation lever a zero-knowledge store has. Full procedure in
  [`ops-runbook.md` §3](ops-runbook.md); the DSR / erasure framing is in
  [`data-subject-requests.md`](data-subject-requests.md).

---

## 9. Rollback

Migrations are **forward-only** (no `down` files) and additive, so roll back a release by
**redeploying the previous image** — older builds run against the newer schema as long as the columns
they read still exist. A destructive schema change (column drop / type narrowing) must ship with an
explicit migration plan in its slice spec before merging. See [`deploy.md`](deploy.md#rolling-back).
