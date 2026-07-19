# Deploying aesmsg

aesmsg deploys via [Sproobo](https://sproobo.com). Sproobo handles containerization, nginx, TLS, and provisions the Postgres and Redis services the backend depends on. **Never deploy to Vercel.**

## The four deployables

The product ships as four independent services. Only the first two are a backend; the two web surfaces are static sites with no backend of their own.

| Deployable | What it is | Depends on |
|---|---|---|
| **`apps/api`** | Standalone **Fastify** service hosting the message API (`/api/messages/*`) over `@aesmsg/server-store`. The **native apps** and the `apps/webapp` client are its clients. | Postgres, Redis |
| **`apps/worker`** | Headless sweeper. Periodically runs `expirePastDue()` to physically purge expired/revoked ciphertext from Postgres. No network ports. | Postgres |
| **`apps/web`** | Static **Next.js 16** site: marketing landing at `/`, deep-link bouncer at `/l/[id]`, plus `/docs`, `/privacy`, `/terms`. **No crypto, no database, no API routes.** | nothing (serves static output) |
| **`apps/webapp`** | Static **Next.js 16** messaging web client (`output: 'export'`) served at `https://app.aesmsg.com`. Full sender/recipient/identity flows run **client-side**; all crypto is `@aesmsg/crypto`. | nothing (serves static output; talks only to `api.aesmsg.com` from the browser) |

Cryptography, identity, and key handling run **client-side** — in the native apps and, now, the `apps/webapp` web client — all via `@aesmsg/crypto`. The **server** (`apps/api` / `apps/worker`) and the marketing site (`apps/web`) never see plaintext or a private key — the server stores only ciphertext + minimal metadata (link id, expiry, max-opens, opens count, status).

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
| `AESMSG_WEBAPP_ORIGIN` | no | Single browser origin allowed to call this API cross-origin (the messaging web client). Registers a single-origin CORS allowlist: exactly this origin gets `Access-Control-Allow-Origin`; every other browser origin is denied (no CORS headers). Non-browser callers (native app, curl) are unaffected. **Soft config** with a sensible default `https://app.aesmsg.com` (never a boot gate); dev sets it to the local webapp origin (e.g. `http://localhost:3001`). |
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

## `apps/webapp` — static messaging web client (app.aesmsg.com)

The messaging **web client**, served at `https://app.aesmsg.com`. Unlike `apps/web`, it carries the real sender/recipient/identity flows — but it is still a **fully static export** (`output: 'export'`): no API routes, no server runtime, no SSR touching key material. All crypto runs **client-side** via `@aesmsg/crypto`; the private key is wrapped-at-rest in IndexedDB and unwrapped in memory only.

### Build & serve

```bash
pnpm --filter @aesmsg/webapp build   # -> apps/webapp/out/ (static files, no Node runtime)
```

`build` runs `next build` then `node scripts/inject-csp.mjs` (the CSP baker, below). Serve `apps/webapp/out/` as static files on Sproobo static hosting — there is **no** Node process to run and **no** env, database, Redis, or salt for `apps/webapp` itself.

`NEXT_PUBLIC_AESMSG_API_ORIGIN` is a **build-time** variable (default `https://api.aesmsg.com`). Set it before `build` only if the API origin differs; it is baked into the CSP `connect-src` at build time.

### Content-Security-Policy (per-page meta + authoritative header)

The policy is delivered two ways, both first-party and server-free:

1. **Per-page `<meta http-equiv="Content-Security-Policy">`**, baked into every `out/**/*.html` by `scripts/inject-csp.mjs`. This is the **authoritative source for the resource directives**, and in particular for `script-src`. A static export has no server runtime (so `next.config` `headers()` is inert) and no nonce pipeline, so the baker sha256-hashes each page's own inline hydration / RSC-flight scripts and pins them. `script-src` therefore stays strict — `'self' 'wasm-unsafe-eval'` + per-page hashes, **no `'unsafe-inline'`** (`'wasm-unsafe-eval'` is required for `@aesmsg/crypto`'s WebAssembly Argon2id; there is **no `'unsafe-eval'`** in the production policy). The full meta policy per page is:

   ```
   default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'sha256-…(per page)…'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.aesmsg.com; base-uri 'none'; form-action 'none'
   ```

   `style-src` keeps a bounded `'unsafe-inline'` for inline `style` **attributes** (emitted by `@aesmsg/ui`'s `MaterialIcon` / `Logo` and by Next's font CSS), which CSP hashes cannot cover without `'unsafe-hashes'`; this is a style-only relaxation and never applies to scripts. There are **no third-party or remote origins** anywhere beyond `connect-src` → `https://api.aesmsg.com` (fonts are self-hosted under `/_next` + `/fonts`, so nothing is fetched from Google at runtime). No analytics.

2. **The authoritative host (nginx / Sproobo) response headers**, sent on every response:

   ```
   Content-Security-Policy: frame-ancestors 'none'
   Referrer-Policy: no-referrer
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   ```

   The header CSP carries **only `frame-ancestors 'none'`** — the one directive `<meta>` cannot express (clickjacking / iframe-embedding defense, mirroring `X-Frame-Options: DENY`). It deliberately does **not** repeat `default-src 'none'` or the resource directives: browsers enforce multiple CSPs as an **AND**, so a header carrying `default-src 'none'` without each page's per-script hashes would block the very hydration scripts the meta permits and break the app. The `<meta>` is thus the single source of truth for the resource directives; the header supplies `frame-ancestors` plus the classic hardening headers.

### Backend coupling

The only backend dependency is the CORS allowlist on `apps/api`: `AESMSG_WEBAPP_ORIGIN=https://app.aesmsg.com` (single-origin allowlist; every other origin stays denied). That change is **now landed** in `apps/api` (the SP2 sender-flow sub-project) — see the `AESMSG_WEBAPP_ORIGIN` row in the `apps/api` env table above. It remains **soft config with a default**, so a missing value never blocks API boot; dev sets it to the local webapp origin (`http://localhost:3001`). **No new `apps/webapp` env** is introduced: the sender flow talks only to `api.aesmsg.com` (already in the CSP `connect-src`) and mints the shareable link from the server response. The identity foundation still issues **zero** network requests (keygen + wrap + unlock are all local).

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
| Build the static web client (`app.aesmsg.com`) | `pnpm --filter @aesmsg/webapp build`, then serve `apps/webapp/out/` as static files |

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
