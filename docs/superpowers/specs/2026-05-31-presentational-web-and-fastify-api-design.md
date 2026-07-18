# Presentational web + standalone Fastify API — design spec

- **Date:** 2026-05-31
- **Status:** Draft for review
- **Author:** brainstorming session (Claude + Davor)
- **Branch:** `claude/stupefied-torvalds-628e7c`
- **Hard precondition:** the **aesmsg rebrand** (spec `docs/superpowers/specs/2026-05-31-aesmsg-rebrand-design.md`, branch `claude/hardcore-aryabhata-97a508`) is **merged first**. This spec is written entirely in post-rebrand terms: `@aesmsg/*` scope, `AESMSG_*` env vars, `aesmsg://` scheme, domains `aesmsg.com` / `api.aesmsg.com`.

## 1. Goal

Stop treating the web app as a messaging client. Communication happens **only in the native apps**. The web surface collapses to a **static / presentational** site, and the message API — which the mobile app depends on — moves out of the (now dashboard-less) Next app into a dedicated **Fastify** service.

Three coordinated changes:

1. **New `apps/api`** (Fastify) owns `/api/messages/*`, wrapping `@aesmsg/server-store`.
2. **`apps/web`** is stripped to a marketing **landing page** + a **`/l/[id]` deep-link bouncer**. No crypto, no message API, no authenticated dashboard.
3. **`apps/mobile`** repoints its API base URL at `https://api.aesmsg.com`. No other mobile change.

This is feasible as a clean break because the project is pre-launch: no production users, no published store builds, no live links.

## 2. Locked decisions

| Decision | Value |
|---|---|
| Web role | Static / presentational only (landing + link bouncer) |
| Recipient experience | **Native-only.** Links open the app via universal/app links; app-less recipients see "install aesmsg to open this". The web never decrypts. |
| Message API home | New `apps/api`, **Fastify** (thin REST over `@aesmsg/server-store`) |
| API package name | `@aesmsg/api` |
| Endpoint paths | **Unchanged** (`/api/messages/*`) so mobile changes base URL only |
| Web domain | `https://aesmsg.com` |
| API domain | `https://api.aesmsg.com` |
| Link origin in created links | `https://aesmsg.com/l/:id` (driven by `AESMSG_PUBLIC_LINK_ORIGIN`, **not** request origin) |
| Old web dashboard code | **Deleted outright** (not archived; git history retains it) |
| CORS on the API | Deny-all browser origins (no browser client calls it) |
| Sequencing | Rebrand first, then this pivot |

## 3. Critical product invariants this preserves

From `CLAUDE.md` — the pivot must not weaken any of these:

- **Zero-knowledge backend.** The API stays a thin pass-through over opaque ciphertext + minimal metadata. No plaintext, no keys, no previews server-side. (Unchanged — same `@aesmsg/server-store`.)
- **Public link previews must be safe.** The `/l/[id]` bouncer is **fully static**: it makes **no API calls**, never fetches ciphertext, never consumes an open. A messaging app auto-fetching the URL to build a preview hits a static page and nothing else.
- **Expired / revoked links leak nothing.** The bouncer does not query link state, so it cannot leak metadata. It just attempts the deep link and offers install. The native app performs all real fetch/validation.
- **Private keys never leave the device.** No crypto on web at all post-pivot.

## 4. Target architecture

```
apps/
  api/      ← NEW. Fastify. Owns /api/messages/* over @aesmsg/server-store.
  web/      ← Static/presentational: landing (/) + /l/[id] bouncer. No crypto, no API, no dashboard.
  mobile/   ← Unchanged except API base URL → https://api.aesmsg.com.
packages/
  server-store/   ← unchanged; consumed by apps/api instead of apps/web.
  crypto/         ← consumed by mobile only (API does not decrypt).
  design-tokens/  ← consumed by the landing page.
  ui/             ← trimmed to landing-page needs; dashboard components removed.
  key-store/       ← web dashboard was its consumer; confirm remaining consumers in planning.
```

Web and API deploy as **two independent services** (`aesmsg.com`, `api.aesmsg.com`). Mobile talks only to the API.

## 5. `apps/api` (Fastify) design

### 5.1 Layout

```
apps/api/
  package.json            # name "@aesmsg/api"; deps: fastify, @aesmsg/server-store; node:crypto built-in
  tsconfig.json
  src/
    index.ts              # bootstrap: build server, listen on PORT
    server.ts             # buildServer(): Fastify instance + plugins + routes (exported for tests)
    fastify-adapter.ts    # Fastify request -> web Request; web Response -> Fastify reply
    routes/messages.ts    # registers the 5 routes, wiring handlers via getStores()
    handlers/messages-handler.ts   # relocated; the create*Handler(deps) factories (Web Request/Response)
    stores/stores.ts               # relocated getStores() factory
    stores/store-backend.ts        # relocated shouldUseDbStores() predicate
    lib/hash-ip.ts                 # relocated (node:crypto HMAC; RATE_LIMIT_IP_SALT, fail-closed in prod)
    lib/base64.ts                  # relocated pure util
    lib/link-id.ts                 # relocated LINK_ID_REGEX
  tests/
    messages-handler.test.ts       # relocated handler tests (Memory*Store, fixed clock) — proves parity
    api.smoke.test.ts              # boot buildServer(), hit each route, assert status codes
```

The relocated logic is a **move** (copy in Phase 1, delete the web originals in Phase 3 — see §9), so the proven handler tests travel with the code essentially unchanged.

### 5.2 The adapter (why it's thin)

The existing handlers in `messages-handler.ts` are written against the **Web-standard `Request`/`Response`**, not Next. Node 22 provides global `Request`/`Response` (undici). The adapter therefore:

- Builds `new Request(url, { method, headers, body })` from the incoming Fastify request, where `url` is reconstructed so the handler sees the correct path/query.
- Forwards `x-forwarded-for` / `x-real-ip` headers verbatim (load-bearing for `hash-ip` rate-limit keying behind the Sproobo nginx proxy).
- For dynamic routes, supplies `context.params = Promise.resolve({ id })` (handlers `await context.params`, the Next 16 convention — preserved as-is).
- Reads the handler's `Response` and writes status + headers + body back to the Fastify reply.

**Body handling:** the create/list handlers call `await request.text()` and enforce their own size limits (`MAX_BODY_BYTES = 20 MiB`). The API registers a passthrough content-type parser so the **raw** body reaches the adapter (no premature Fastify JSON parse), and sets Fastify's `bodyLimit` to match. The handler's existing parse + size + base64 validation is the source of truth.

### 5.3 The one behavioral change: link origin

Today `createMessagesHandler` builds the returned URL from `new URL(request.url).origin` → fine when the API and the link host were the same Next app. They no longer are. **Change:** `createMessagesHandler` takes a `publicLinkOrigin: string` dependency and returns `` `${publicLinkOrigin}/l/${id}` ``. Wired from `AESMSG_PUBLIC_LINK_ORIGIN` (default `https://aesmsg.com`). The handler test passes a fixed origin. This is the only intentional logic change; everything else ports verbatim.

### 5.4 Store wiring & config

`getStores()` / `shouldUseDbStores()` keep their current behavior: Postgres + Redis when **both** `DATABASE_URL` and `REDIS_URL` are set, in-memory otherwise. The `globalThis.__aesmsg_stores` memoization global is preserved (rebranded name).

Environment variables:

| Var | Purpose | Default |
|---|---|---|
| `PORT` | Fastify listen port (kept off `3000` so the web dev server can run alongside it) | `4000` |
| `DATABASE_URL` | Postgres (Sproobo) — enables Pg stores | unset → memory |
| `REDIS_URL` | Redis (Sproobo) — enables Pg+Redis stores | unset → memory |
| `AESMSG_PUBLIC_LINK_ORIGIN` | Host used to build `/l/:id` links | `https://aesmsg.com` |
| `RATE_LIMIT_IP_SALT` | HMAC salt for IP rate-limit keys; **fail-closed in production** | unset (dev/test only) |
| `NODE_ENV` | `production` hardens the IP-salt fail-closed check | — |

### 5.5 CORS

No browser client calls this API (mobile native `fetch` is not CORS-bound; the bouncer is static and makes no calls). The API does **not** register permissive CORS — default deny browser origins. If a future browser client appears, add `@fastify/cors` scoped to that origin then.

## 6. `apps/web` (static / presentational) design

### 6.1 Keep / add

- **Landing page** at `/` — migrated from the landing mockup in `all_design_screens/` (post-rebrand folder name, e.g. `landing_page_aesmsg/`), with a prominent **"Get the app"** CTA. Per project design rules, the mockup is the source of truth — no invented visuals.
- **Link bouncer** at `/l/[id]` — attempts to open the native app via the universal/app link; if the app is not installed, shows **"Install aesmsg to open this secure link."** Makes **no network calls** (see §3). Static page.
- **Deep-link association files** under `public/.well-known/`:
  - `apple-app-site-association` (iOS universal links; `appID = <TeamID>.com.aesmsg.app`)
  - `assetlinks.json` (Android app links; `package_name = com.aesmsg.app`, signing-cert SHA-256 fingerprint)
  - Real Team ID and signing fingerprints filled in during planning/deploy.
- Continues to consume `@aesmsg/design-tokens` and (trimmed) `@aesmsg/ui`.

### 6.2 Delete

- The entire authenticated dashboard: `app/(app)/**` (home, create, links, contacts, keys, settings) and their `src/` feature dirs (`src/home/DashboardScreen`, `src/create`, `src/links`, `src/contacts`, `src/keys`, `src/settings`).
- The **web reader / decrypt flow** (current `app/l/[id]/page.tsx` + `src/reader/**`) — replaced by the static bouncer.
- All **API routes**: `app/api/**` (moved to `apps/api`).
- The relocated server code: `src/server/**` (deleted here once `apps/api` owns it).
- `IdentityProvider` wiring in `app/layout.tsx` and client-only crypto/identity usage.
- Client-side stores: `src/lib/sent-links-store.ts`, `src/lib/contacts-store.ts` (IndexedDB; messaging-only).
- Web-only test suites tied to the deleted screens/flows.

Trimming `@aesmsg/ui` to only what the landing page renders (dashboard-specific components removed) is in scope; the exact component list is finalized in the plan after confirming consumers.

## 7. `apps/mobile` change

Single change set:

- `app.config.ts`: production `extra.aesmsgApiBaseUrl` (and/or `AESMSG_API_BASE_URL`) → `https://api.aesmsg.com`; `AESMSG_HOST` → `aesmsg.com` (universal-link host).
- `src/api/client.ts`: **unchanged** — paths stay `/api/messages/*`, only the base URL differs.

No native rebuild is required for the URL change itself (it's config/JS), but the universal-link host must match the web's association files.

## 8. Testing & verification

- **Handler parity:** the relocated `messages-handler.test.ts` runs against `Memory*Store` with a fixed clock — same convention as today, proving the move changed no behavior (plus the new `publicLinkOrigin` assertion).
- **API smoke test:** boot `buildServer()` and exercise each of the 5 routes (create → list → get → open → revoke), asserting status codes and the link-origin in the create response.
- **Workspace gates:** `pnpm typecheck`, `pnpm lint` (Biome), `pnpm test` stay green across all workspaces.
- **Manual end-to-end (Phase 2):** mobile pointed at a locally running `apps/api` — create on one path, open on another, confirm revoke purges.
- **Manual web (Phase 3):** landing renders from tokens; `/l/<id>` deep-links into the app on a device with the app installed and shows the install page without it; confirm the bouncer issues **no** network requests (devtools/network).

## 9. Phasing (for the implementation plan)

Each phase leaves the repo building and tested.

1. **Stand up `apps/api`.** Scaffold the Fastify app; copy the handler logic + stores + libs in; write the adapter, routes, `buildServer()`, and bootstrap; add `AESMSG_PUBLIC_LINK_ORIGIN`; port the handler tests; add the smoke test. `apps/web` is untouched and still functional in parallel.
2. **Repoint mobile** to `https://api.aesmsg.com`; verify the full create/open/revoke loop end-to-end against `apps/api`.
3. **Strip `apps/web`.** Delete the dashboard, web reader, API routes, `src/server/**`, identity wiring, and client stores; add the landing page, the `/l/[id]` bouncer, and the `.well-known` association files; trim `@aesmsg/ui`.

## 10. Risks & mitigations

- **Fastify body parsing** swallowing the raw body before the handler's `request.text()` → register a passthrough content-type parser + matching `bodyLimit`; the smoke test on the create route catches regressions.
- **Proxy headers** (`x-forwarded-for`) not reaching `hash-ip` behind Sproobo nginx → forward them in the adapter and configure nginx/`trustProxy` so production IP-salt keying works (and the fail-closed check has a real IP).
- **`AESMSG_PUBLIC_LINK_ORIGIN` misconfig** → links point at the wrong host → sensible default (`https://aesmsg.com`) + asserted in the handler test + visible in the create smoke test.
- **Universal-link association** must be served at `https://aesmsg.com/.well-known/apple-app-site-association` with `application/json` content-type and **no redirect** (Apple/Google fetch it directly) → deploy checklist item; real Team ID + signing fingerprints required.
- **Rebrand not merged first** (precondition violation) → this spec's `@aesmsg/*` names won't resolve; do not start until the rebrand lands.

## 11. Out of scope

- Additional marketing pages (pricing, docs, security/how-it-works) — landing + bouncer only for now; more can follow in a later pass.
- Recipient-side push notifications (already established as architecturally impossible under ZK — see prior decisions).
- Any change to the crypto wire format, `@aesmsg/server-store` schema, or migrations.
- Auth / RBAC / enterprise admin (Phase 3 concerns; Fastify chosen partly to keep that door open without paying for it now).
