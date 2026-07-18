# Sub-project 2 — Web client sender flow + links management (`apps/webapp`) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the standalone web identity (shipped in SP1) the ability to **send**. Compose a message, address it to a recipient's pasted public key, choose expiry + max-opens, **seal locally** with `@aesmsg/crypto` using the *exact* call sequence and v2 AAD binding the mobile app uses, upload only ciphertext + minimal metadata to `apps/api`, and show the shareable `aesmsg.com/l/<id>` link. Then track those links locally in IndexedDB, list them with live status, view details, and **revoke** (server-side purge). Enabling this requires the umbrella spec's single backend change: `@fastify/cors` on `apps/api` allowlisting exactly `AESMSG_WEBAPP_ORIGIN` (default `https://app.aesmsg.com`). Wire-format interop with mobile is non-negotiable: a webapp-sealed message must open on a mobile recipient's device and vice-versa.

**Architecture:** Four concentric layers on top of SP1.
1. **Backend (only change):** `apps/api` registers `@fastify/cors` with a single-origin allowlist resolved from `AESMSG_WEBAPP_ORIGIN` — mirroring the exact env-with-sensible-default pattern of `AESMSG_PUBLIC_LINK_ORIGIN` in [`apps/api/src/server.ts:33-34`](../../../apps/api/src/server.ts). No route, store, rate-limit, or body-cap change.
2. **Webapp transport:** a fetch wrapper `src/api/client.ts` over `NEXT_PUBLIC_AESMSG_API_ORIGIN` (already pre-allowed in the SP1 CSP `connect-src`), typed to the **exact** `/api/messages/*` request/response shapes, with the mobile client's error taxonomy (`ApiError`/`TimeoutError`/`MalformedResponseError`/`NetworkError`).
3. **Webapp sender pipeline:** `src/create/create-and-seal.ts` — a browser port of [`apps/mobile/src/create/create-and-seal.ts`](../../../apps/mobile/src/create/create-and-seal.ts) reproducing the same ordered `importPublicKey → fingerprint → generateLinkId → MessageBindingContext(v2) → encodePayload → seal → postMessage → recordSentLink` sequence so the bytes are identical across surfaces.
4. **Webapp persistence + screens:** a `sent-links` IndexedDB object store (added via a **schema-version bump** to the SP1 DB), the compose screen (`app/new`), the link-created screen, the links list (`app/links`), link details, and revoke — all composed from `@aesmsg/design-tokens` + `@aesmsg/ui`, gated behind an unlocked identity.

`@aesmsg/crypto` and `@aesmsg/server-store` are **frozen** — consumed verbatim, never modified. No mobile changes.

**Tech Stack:** Next.js 16 static export (`output: 'export'`, unchanged from SP1); React 19; `@aesmsg/crypto` (workspace, unchanged); native IndexedDB; Vitest 3 **browser mode** (headless Chromium via Playwright); Biome 2 (repo-wide). `apps/api`: Fastify `^5.2.0` + `@fastify/cors` (the Fastify-5-compatible major — `^11`); Vitest via `app.inject()`.

**Spec:** [`docs/superpowers/specs/2026-07-18-messaging-web-client-design.md`](../specs/2026-07-18-messaging-web-client-design.md) — this plan implements **item 2 of §9** ("Sender flow + links management"), honoring §6.2 (sender flow), §7 (the only backend change — CORS), and §10 (testing). Builds directly on [`2026-07-18-webapp-foundation-identity.md`](./2026-07-18-webapp-foundation-identity.md) (SP1) including its **Deviation** note (hash-pinned CSP via `scripts/inject-csp.mjs`; `connect-src` already carries the API origin).

---

## ⚠️ Pinned decisions — read before starting

### D1. Wire-format interop is pinned to the mobile seal sequence (non-negotiable)

The webapp MUST produce ciphertext a mobile recipient can open and vice-versa. That means byte-identical framing. Reproduce the mobile `createAndSeal` order **exactly** (source of truth: [`apps/mobile/src/create/create-and-seal.ts`](../../../apps/mobile/src/create/create-and-seal.ts)):

1. `const recipient = await importPublicKey(recipientPublicKeyString)` — validates the `amk1:` key; **throws before any network call** on a bad key.
2. `const recipientFingerprint = await fingerprint(recipientPk)` — derived **locally**, for display + the local sent-link record **only**; never sent to the server (recipient fingerprint is no longer stored server-side — metadata-leakage mitigation).
3. `const id = generateLinkId()` — 16-char base64url (12 random bytes), matching `LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/` (identical generator to [`apps/mobile/src/lib/link-id.ts`](../../../apps/mobile/src/lib/link-id.ts) and the server's `LINK_ID_REGEX`).
4. Build the **v2** binding context — **`createdAtMs` is OMITTED**:
   ```ts
   const context: MessageBindingContext = {
     linkId: id,
     recipientPublicKey: recipientPk,   // PublicKeyString, same key as `recipient`
     expiresAtMs: expiresAt.getTime(),
     maxOpens,                           // positive int, or -1 for unlimited
   };
   ```
   Omitting `createdAtMs` deterministically selects **AAD v2** in `encodeAad` ([`packages/crypto/src/aad.ts:82`](../../../packages/crypto/src/aad.ts)). This is mandatory: the current server stores/returns **no** `createdAt` for new links (returns `null`), and an SP3 recipient rebuilds the v2 AAD without it. Including `createdAtMs` would seal a v1 AAD the recipient can never reconstruct → silent decrypt failure.
5. `const plaintext = encodePayload({ text, attachments: [] })` — seal the **v0x02 payload envelope** (with its length-hiding pad trailer), **not** raw `TextEncoder().encode(text)`. Mobile seals the envelope; matching it keeps bytes identical and gives length-hiding for free. (See D5 for the attachments decision — the empty `attachments` array is the interop-correct text-only shape.)
6. `const ciphertext = await seal(plaintext, recipient, context)` — `seal` cross-checks that `recipient` and `context.recipientPublicKey` name the same X25519 key and throws `RecipientMismatchError` otherwise ([`packages/crypto/src/seal.ts:30-33`](../../../packages/crypto/src/seal.ts)); wire that guard through as a user-facing error, not a crash.
7. `const { revocationToken } = await postMessage({ id, ciphertext: bytesToBase64(ciphertext), expiresAt: expiresAt.toISOString(), maxOpens })`.
8. `await recordSentLink({ id, recipientFingerprint, createdAt: new Date().toISOString(), expiresAt: …, maxOpens, label, revocationToken })` — **best-effort**, AFTER a successful POST (a storage failure must not deny the user the link).
9. Shareable link = the server-returned `response.url` (see D2).

### D2. The shareable link is `aesmsg.com/l/<id>` — NOT `app.aesmsg.com`

The create response returns `url = ${AESMSG_PUBLIC_LINK_ORIGIN}/l/${id}` (default `https://aesmsg.com`, [`apps/api/src/handlers/messages-handler.ts:185`](../../../apps/api/src/handlers/messages-handler.ts)). Mobile builds the same shape (`${LINK_ORIGIN}/l/${id}`, `LINK_ORIGIN = aesmsg.com`). **Use the server-returned `url` field verbatim** for display + copy. It points at the **bouncer** host (`aesmsg.com`), which stays 100% static/preview-safe and offers "Open in browser" → `app.aesmsg.com/l/<id>` (SP3). Do **not** synthesize an `app.aesmsg.com` link. Render the link in **`font-mono`** (JetBrains Mono is for links/keys/fingerprints only).

### D3. CORS shape — reflected single origin, not a static string

Register `@fastify/cors` so the allowlisted origin gets a **reflected** `Access-Control-Allow-Origin` and every other origin gets **no CORS headers** (browser-denied). Use a predicate, not a bare string (a bare `origin: "https://app.aesmsg.com"` emits that ACAO on *every* response, including to `evil.com` — the browser still blocks it, but it fails the "other origins get no CORS headers" test):

```ts
app.register(cors, {
  origin(origin, cb) {
    // No Origin header (native app, curl, server-to-server) → let it through unchanged: CORS
    // headers are only meaningful to browsers, and `!origin` must not add/deny anything.
    if (!origin) return cb(null, true);
    cb(null, origin === webappOrigin); // true → reflect this origin; false → omit ACAO (deny)
  },
});
```

With a predicate, `@fastify/cors` reflects the request `Origin` (and sets `Vary: Origin`) only on a match and omits ACAO otherwise; it never rejects the HTTP request itself, so non-browser callers are untouched. `webappOrigin` resolves via the SP1/`AESMSG_PUBLIC_LINK_ORIGIN` pattern (D4).

### D4. `AESMSG_WEBAPP_ORIGIN` mirrors `AESMSG_PUBLIC_LINK_ORIGIN` exactly

In [`apps/api/src/server.ts`](../../../apps/api/src/server.ts), `publicLinkOrigin` is resolved as `options.publicLinkOrigin ?? process.env.AESMSG_PUBLIC_LINK_ORIGIN ?? "https://aesmsg.com"` (line 33-34). Mirror it: add `webappOrigin?: string` to `BuildServerOptions` and resolve `options.webappOrigin ?? process.env.AESMSG_WEBAPP_ORIGIN ?? "https://app.aesmsg.com"`. It is **soft config** (a sensible default, never a boot gate) — do **not** add it to the fail-closed `assertProductionConfig` checks. Dev sets `AESMSG_WEBAPP_ORIGIN=http://localhost:3001` (the webapp dev port).

### D5. Attachments land in **SP5**, not here — justified

**Decision: SP2 sends text-only** (`encodePayload({ text, attachments: [] })`); the file-attachment UI lands in SP5. Justification:
- **No wire-format blocker.** `encodePayload` already supports attachments and the server treats the blob as opaque; deferring costs nothing at the interop layer. The empty-`attachments` envelope is byte-identical to what mobile emits for a text-only message, so cross-surface open works today and adding attachments later is purely additive.
- **Attachments are a large, cohesive surface of their own** (file picker + drag-drop, the 25 MiB guidance the mockup shows, MIME/basename handling, and the reader-side download in SP3) that is unrelated to the seal/link/revoke core this sub-project is about.
- **§9 explicitly scopes "attachments polish" to sub-project 5**, and doing the whole attachment path there keeps it coherent. The compose screen leaves a **clean seam**: no attachment control in SP2 (the mockup's dropzone is omitted, not stubbed with dead UI), and `create-and-seal.ts` takes an already-general `encodePayload({ text, attachments })` call so SP5 only feeds it a non-empty array.

### D6. Expiry / max-opens presets follow the spec, not the mobile numbers

Per spec §6.2 and the task: **expiry** `10m / 1h / 24h / 7d / custom`; **max opens** `1 / 3 / unlimited`. These differ from mobile's `10m/1h/24h/7d/1y` + `1/5/10/unlimited` and the mockup's `1/5/10/Unlimited` — that difference is **UI-only and does not affect interop** (any real future `expiresAt` Date and any positive-int-or-`-1` `maxOpens` seal + upload identically). Constraints that DO matter:
- **No "Never" option.** The server rejects unbounded links (retention ceiling); `custom` is capped at `now + 365d` (`MAX_LINK_LIFETIME_MS`, mirrored from [`apps/mobile/src/create/expiry.ts:16`](../../../apps/mobile/src/create/expiry.ts) / server `DEFAULT_MAX_RETENTION_MS`) and floored just above `now`.
- `unlimited` → `maxOpens = -1`; `1` → burn-on-read; `3` → three opens then gone.
- The chosen expiry is **one `Date`** used for BOTH the sealed AAD (`expiresAtMs`) and the uploaded `expiresAt` (`.toISOString()`) — they must match (mobile invariant).

### D7. Sent-links store holds sender-derivable metadata only — and an honest at-rest caveat

The `sent-links` record stores **only**: `id`, `recipientFingerprint` (public, sender-derivable), `createdAt`, `expiresAt`, `maxOpens`, an **optional local-only `label`** (free text the sender types to recognize the link — never uploaded), the secret `revocationToken`, and `schemaVersion`. **Never** plaintext, ciphertext, the recipient's key material, or anything beyond what the sender entered. Mirrors [`apps/mobile/src/links/sent-links-store.ts`](../../../apps/mobile/src/links/sent-links-store.ts) minus the mobile-only `reminderNotificationId`.

**Honest web-tier caveat (spec §3):** unlike mobile (which seals this blob under a device DEK), the webapp's IndexedDB is **not encrypted at rest**. The `revocationToken` therefore lives in cleartext IndexedDB. This is an **availability** exposure only (someone with local browser-profile access could revoke your links) — it is **not** a confidentiality break (the token cannot decrypt anything). Document it in `AGENTS.md`; a future hardening (wrapping the sent-links blob under the identity key) is noted, not built. This does not violate the zero-knowledge *backend* invariant: nothing here reaches the server except through the existing endpoints.

### D8. Design-token + copy conventions (unchanged from SP1 — [`apps/webapp/AGENTS.md`](../../../apps/webapp/AGENTS.md))

No `.js` import extensions. Never hardcode colors/spacing — use token utilities (`bg-surface-container`, `text-on-surface`, `text-primary`, `border-outline-variant`, `text-error`, `text-success`, `text-warning`) and numeric Tailwind spacing. `font-mono` ONLY for the secure link / fingerprint / public key. Color semantics: **green** = active/verified, **amber** = expiring-soon/unverified, **red** = destructive (revoke) only. Copy is calm SaaS: "end-to-end encrypted", "zero-knowledge backend", "only the intended recipient can decrypt"; **never** "unbreakable", "military-grade", "impossible to hack".

---

## The `/api/messages/*` contract (pinned — verified against `apps/api` source)

The webapp client types MUST match these exactly (source: [`apps/api/src/handlers/messages-handler.ts`](../../../apps/api/src/handlers/messages-handler.ts) + [`routes/messages.ts`](../../../apps/api/src/routes/messages.ts)).

| Method + path | Request | Success | Errors | Rate limit |
|---|---|---|---|---|
| `POST /api/messages` | `{ id, ciphertext (base64), expiresAt (ISO), maxOpens }` | **201** `{ id, url, revocationToken }` | 400 `bad_request`, 409 `id_conflict`, 429 `rate_limited`, 500 `internal_error` | 30 / 60s |
| `POST /api/messages/list` | `{ ids: string[] }` (1–100, each `LINK_ID_REGEX`) | **200** `{ results: ({ id, status:"active", expiresAt, maxOpens, opensCount } \| { id, status:"gone" })[] }` | 400, 429 | 60 / 60s |
| `POST /api/messages/:id/revoke` | **no body**; header `x-aesmsg-revocation-token: <token>` | **200** `{ id, status:"revoked" }` (always opaque 200) | 400, 429 | 30 / 60s |
| `GET /api/messages/:id` | — | **200** `{ status, expiresAt, maxOpens, opensCount }` | 400, 404 `not_found` | 60 / 60s |
| `POST /api/messages/:id/open` | **no body** | **200** `{ ciphertext, createdAt(null for v2), expiresAt, opensCount, maxOpens, status }` | 400, 410 `no_longer_available` | 30 / 60s |

Validation the client must respect before calling: `id` matches `LINK_ID_REGEX`; `maxOpens` is a positive integer or `-1`; `expiresAt` is in the future and `expiresAt - now ≤ 365d (+1h grace)`; ciphertext base64 decodes to 32 B – 26 MiB; request body ≤ 37 MiB. **SP2 uses `POST /api/messages` (create), `POST /api/messages/list` (status refresh), and `POST /api/messages/:id/revoke`.** `GET /:id` and `/open` belong to the SP3 reader — the client may declare their types now but SP2 ships only create/list/revoke.

---

## File-structure target

After this plan completes (⊕ = modified from SP1):

```
apps/api/                                       (BACKEND — the only backend change)
├─ package.json                        ⊕ Task 1  (+ @fastify/cors)
├─ .env.example                        ⊕ Task 1  (+ AESMSG_WEBAPP_ORIGIN)
├─ src/server.ts                       ⊕ Task 1  (register cors; resolve webappOrigin)
└─ tests/cors.integration.test.ts         Task 1

apps/webapp/
├─ src/
│  ├─ lib/
│  │  ├─ base64.ts                         Task 2  (bytesToBase64 / bytesToBase64Url / base64ToBytes)
│  │  └─ link-id.ts                        Task 2  (generateLinkId + LINK_ID_REGEX, mirrors mobile)
│  ├─ api/
│  │  └─ client.ts                         Task 3  (postMessage / listMessages / revokeLink + errors)
│  ├─ identity/db.ts                    ⊕ Task 4  (DB v2: generalize withStore + add sent-links store)
│  ├─ links/
│  │  ├─ sent-links-store.ts               Task 4  (record shape + CRUD over the new store)
│  │  ├─ link-status.ts                    Task 10 (reconcile local records ⨯ /list → display status)
│  │  └─ use-sent-links.ts                 Task 10 (hook: load + reconcile + revoke)
│  ├─ create/
│  │  ├─ compose-options.ts                Task 6  (expiry/max-opens option tables + expiryToDate)
│  │  ├─ recipient.ts                      Task 6  (validate pasted key → fingerprint / error)
│  │  └─ create-and-seal.ts                Task 7  (the pinned seal sequence — D1)
│  ├─ components/
│  │  ├─ RequireUnlocked.tsx               Task 5  (client gate → /unlock or /onboarding)
│  │  ├─ SecureLinkBlock.tsx               Task 9  (mono link + copy)
│  │  └─ ConfirmRevokeDialog.tsx           Task 12 (red/destructive confirm)
│  └─ screens/
│     ├─ ComposeScreen.tsx                 Task 8
│     ├─ LinkCreatedScreen.tsx             Task 9
│     ├─ LinksListScreen.tsx               Task 11
│     └─ LinkDetailsScreen.tsx             Task 12
├─ app/
│  ├─ new/page.tsx                      ⊕ Task 8  (replace placeholder; gated)
│  ├─ links/page.tsx                    ⊕ Task 11 (replace placeholder; gated)
│  └─ links/[id]/page.tsx                  Task 12 (details — static export: generateStaticParams stub + client fetch)
├─ AGENTS.md                           ⊕ Task 13 (sender-flow + sent-links at-rest caveat)
└─ tests/
   ├─ lib/base64.test.ts                   Task 2
   ├─ lib/link-id.test.ts                  Task 2
   ├─ api/client.test.ts                   Task 3
   ├─ links/sent-links-store.test.ts       Task 4
   ├─ links/link-status.test.ts            Task 10
   ├─ create/compose-options.test.ts       Task 6
   ├─ create/recipient.test.ts             Task 6
   ├─ create/create-and-seal.test.ts       Task 7  (no-plaintext-in-body + wire-interop)
   ├─ screens/ComposeScreen.test.tsx       Task 8
   ├─ screens/LinkCreatedScreen.test.tsx   Task 9
   ├─ screens/LinksListScreen.test.tsx     Task 11
   └─ screens/LinkDetailsScreen.test.tsx   Task 12

docs/deploy.md                            Task 13 (forward-ref: AESMSG_WEBAPP_ORIGIN now landed)
```

Visual sources of truth (do not author new mockups): `create_secure_message_aesmsg` (compose), `secure_link_created_aesmsg` (link created), **`secure_links_aesmsg`** (links list — the **desktop/side-nav table** variant with a stats row + per-row Copy/Revoke actions, which matches the webapp's `AppShell`; **not** `my_secure_links_aesmsg`, which is the mobile card variant), and `secure_links_aesmsg`'s row actions for link details/revoke.

---

# PHASE 1 — Backend: `@fastify/cors` single-origin allowlist (the only API change)

## Task 1: Register `@fastify/cors` allowlisting `AESMSG_WEBAPP_ORIGIN`

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/.env.example`
- Create: `apps/api/tests/cors.integration.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add the dependency** — add `"@fastify/cors": "^11"` (the Fastify-5-compatible major) to `apps/api/package.json` `dependencies`, then `pnpm install`. Confirm it resolves against `fastify@^5.2.0`.

- [ ] **Step 2: Resolve `webappOrigin` (mirror `publicLinkOrigin`)** — in `buildServer`, add `webappOrigin?: string` to `BuildServerOptions` (documented like the others) and resolve it right beside `publicLinkOrigin`:
  ```ts
  const webappOrigin =
    options.webappOrigin ?? process.env.AESMSG_WEBAPP_ORIGIN ?? "https://app.aesmsg.com";
  ```
  Do **not** touch `assertProductionConfig` — this is soft config with a default, not a boot gate.

- [ ] **Step 3: Register CORS (predicate allowlist, D3)** — `import cors from "@fastify/cors";` and register it **before** the route registrations (`registerMessageRoutes`), using the D3 predicate. Update the existing "this API registers NO CORS plugin on purpose" comment block in `server.ts` (lines 44-46) to reflect the new reality: CORS is now registered as a **single-origin allowlist** for the browser web client; deny-all remains the posture for every other origin; native/no-Origin callers are unaffected.

- [ ] **Step 4: Document the env** — add to `apps/api/.env.example`, right after the `AESMSG_PUBLIC_LINK_ORIGIN` block, mirroring its tone:
  ```
  # Browser origin allowed to call this API cross-origin (the messaging web client, app.aesmsg.com).
  # Single-origin CORS allowlist: exactly this origin gets Access-Control-Allow-Origin; every other
  # browser origin is denied (no CORS headers). Non-browser callers (native app, curl) are unaffected.
  # Soft config with a sensible default; dev sets it to the local webapp origin.
  AESMSG_WEBAPP_ORIGIN=https://app.aesmsg.com
  # Dev: AESMSG_WEBAPP_ORIGIN=http://localhost:3001
  ```

- [ ] **Step 5: `tests/cors.integration.test.ts`** — mirror the `api.smoke.test.ts` convention (`buildServer({...})` + `await app.ready()` + `app.inject`). Pass `webappOrigin: "https://app.aesmsg.com"` explicitly. Cover the three required cases:
  - **(a) allowlisted origin — preflight + actual.** `OPTIONS /api/messages` with `Origin: https://app.aesmsg.com` + `Access-Control-Request-Method: POST` → 204/200 with `access-control-allow-origin: https://app.aesmsg.com` and an `access-control-allow-methods` including `POST`. A real `POST /api/messages` (valid body) with that `Origin` → 201 **and** `access-control-allow-origin: https://app.aesmsg.com`.
  - **(b) other origin — denied.** Same requests with `Origin: https://evil.example` → the response carries **no** `access-control-allow-origin` header (assert `res.headers["access-control-allow-origin"]` is `undefined`). The actual `POST` still executes server-side (CORS is browser-enforced) but ships no ACAO.
  - **(c) no-Origin — unchanged.** `POST /api/messages` (valid body) with **no** `Origin` header → 201 and no ACAO header; behaves exactly as the pre-CORS smoke test. Add a `GET /api/messages/:id` no-Origin case too for good measure.

- [ ] **Step 6: Verify** — `pnpm --filter @aesmsg/api test` (all existing + new CORS tests green); `pnpm --filter @aesmsg/api typecheck`.

- [ ] **Step 7: Commit**
  ```bash
  git add apps/api/package.json apps/api/src/server.ts apps/api/.env.example apps/api/tests/cors.integration.test.ts pnpm-lock.yaml
  git commit -m "feat(api): @fastify/cors single-origin allowlist from AESMSG_WEBAPP_ORIGIN"
  ```

---

# PHASE 2 — Webapp transport, persistence, gating

## Task 2: Pure browser utils — base64 + link-id (mirror mobile)

**Files:** Create `apps/webapp/src/lib/base64.ts`, `apps/webapp/src/lib/link-id.ts`, `apps/webapp/tests/lib/base64.test.ts`, `apps/webapp/tests/lib/link-id.test.ts`.

- [ ] **Step 1: `base64.ts`** — `bytesToBase64(bytes)` (standard base64 for the ciphertext upload body — the server decodes with `atob` + `/^[A-Za-z0-9+/]*={0,2}$/`), `bytesToBase64Url(bytes)` (url-safe, no padding, for link-id generation), and `base64ToBytes(s)` (for the SP3 reader; declared now). Pure `atob`/`btoa`-based (runs in the browser test env). Do **not** import from `@aesmsg/crypto` internals.
- [ ] **Step 2: `link-id.ts`** — `export const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;` and `generateLinkId()` = `bytesToBase64Url(crypto.getRandomValues(new Uint8Array(12)))` (12 bytes → exactly 16 base64url chars). Identical behavior to `apps/mobile/src/lib/link-id.ts`.
- [ ] **Step 3: Tests** — `base64` round-trips arbitrary bytes; `bytesToBase64Url` emits no `+`/`/`/`=`. `generateLinkId()` always matches `LINK_ID_REGEX`, is 16 chars, and is unique across many calls.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- lib/`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): base64 + link-id utils (mobile-interop parity)`.

## Task 3: API client (`postMessage` / `listMessages` / `revokeLink`) + error taxonomy

**Files:** Create `apps/webapp/src/api/client.ts`, `apps/webapp/tests/api/client.test.ts`.

- [ ] **Step 1: `client.ts`** — `const API_ORIGIN = process.env.NEXT_PUBLIC_AESMSG_API_ORIGIN ?? "https://api.aesmsg.com";` (already in the SP1 CSP `connect-src`). Typed to the pinned contract:
  - `interface CreateMessageRequest { id; ciphertext; expiresAt; maxOpens }` → `CreateMessageResponse { id; url; revocationToken }`.
  - `listMessages(ids)` → `ListMessagesResponse { results: ListMessageResult[] }` with the `"active" | "gone"` union.
  - `revokeLink(id, revocationToken?)` → `void`; sends the token in header `x-aesmsg-revocation-token` (const `REVOCATION_TOKEN_HEADER = "x-aesmsg-revocation-token"`, matching the server), **no body**.
  - (Declare `OpenMessageResponse` / `MessageMetadata` + `getMessage`/`openMessage` types for SP3, but do not wire the reader here.)
  Port the mobile client's transport + validators: an `AbortController` timeout (`DEFAULT_REQUEST_TIMEOUT_MS = 30_000`), minimal `isRecord`/`isKnownStatus` shape checks that throw `MalformedResponseError`, and a non-ok status → `ApiError(status)`.
- [ ] **Step 2: Error taxonomy** — export `ApiError(status)`, `TimeoutError`, `MalformedResponseError`, and a `NetworkError` (fetch rejected: offline / DNS / **CORS-blocked**). Provide a `classifyApiError(err)` → `"network" | "not_found"(404) | "gone"(410) | "rate_limited"(429) | "invalid"(400) | "server"(5xx) | "unknown"` so screens map failures to calm copy without leaking detail. (The links list treats 404/410/`gone` uniformly as "no longer available".)
- [ ] **Step 3: Tests** — stub `globalThis.fetch`. Assert: `postMessage` POSTs JSON to `${API_ORIGIN}/api/messages` with `content-type: application/json` and the exact body keys `{id,ciphertext,expiresAt,maxOpens}` (**and no others** — see Task 7 for the no-plaintext assertion); parses `{id,url,revocationToken}`. `listMessages([])` short-circuits to `{results:[]}` (server rejects `[]`). `revokeLink` sends the token header and no body. Each HTTP status maps to the right `classifyApiError` bucket; a fetch rejection → `NetworkError` → `"network"`; a 200 with a garbage body → `MalformedResponseError`.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- api/client`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): typed /api/messages client (create/list/revoke) + error taxonomy`.

## Task 4: IndexedDB schema v2 + `sent-links` store

`apps/webapp/src/identity/db.ts` (SP1) hardcodes DB `aesmsg-webapp` v1 with a single `identity` store and a `withDB(mode, fn)` bound to it. Add a second store **without** breaking SP1.

**Files:** Modify `apps/webapp/src/identity/db.ts`; create `apps/webapp/src/links/sent-links-store.ts`, `apps/webapp/tests/links/sent-links-store.test.ts`.

- [ ] **Step 1: Generalize + version-bump `db.ts`** — bump `DB_VERSION` to `2`; add `export const SENT_LINKS_STORE = "sent-links";`. In `onupgradeneeded`, keep the existing idempotent `if (!contains(IDENTITY_STORE)) createObjectStore(...)` **and** add the same guarded creation for `SENT_LINKS_STORE` (`keyPath: "id"`). Because the guard is `contains`-based and additive, a v1→v2 upgrade **preserves the existing identity row** and only creates the new store. Introduce `export async function withStore<T>(storeName, mode, fn)` (the current `withDB` body, parameterized on store name) and redefine `withDB(mode, fn)` = `withStore(IDENTITY_STORE, mode, fn)` so `identity-store.ts` needs **no change**. Keep `__deleteDbForTests`/`__resetDbForTests`.
- [ ] **Step 2: `sent-links-store.ts`** — the D7 record + CRUD over `withStore(SENT_LINKS_STORE, …)`:
  ```ts
  export interface SentLinkRecord {
    id: string;
    recipientFingerprint: Fingerprint;
    createdAt: string;  // ISO 8601
    expiresAt: string;  // ISO 8601
    maxOpens: number;
    label: string | null;          // optional local-only, sender-entered; never uploaded
    revocationToken: string | null; // secret; local-only; authenticates revoke
    schemaVersion: 1;
  }
  // recordSentLink(Omit<…,"schemaVersion">) upsert-by-id; listSentLinks() newest-first by createdAt;
  // getSentLink(id); deleteSentLink(id); clearSentLinks(); __deleteSentLinksStoreForTests().
  ```
  Semantics mirror `apps/mobile/src/links/sent-links-store.ts` (minus `reminderNotificationId`).
- [ ] **Step 3: Tests** — save→load equality; newest-first ordering; upsert replaces; delete removes; missing→`null`. **Invariant test:** `JSON.stringify(record)` contains **no** plaintext/ciphertext keys — only the D7 fields (`expect(str).not.toContain('"text"'); not.toContain('"ciphertext"'); not.toContain('"plaintext"')`). **Migration test:** open the DB at v1 with an `identity` row (simulate SP1), then open at v2 and assert the identity row survives AND the `sent-links` store now exists and round-trips.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- links/sent-links-store`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): IndexedDB v2 sent-links store (metadata-only, migration-safe)`.

## Task 5: `RequireUnlocked` gate; wire it for the sender routes

SP1 left `/new` and `/links` as ungated placeholders. Gate them behind an unlocked identity.

**Files:** Create `apps/webapp/src/components/RequireUnlocked.tsx` (used by Tasks 8/11/12).

- [ ] **Step 1: `RequireUnlocked.tsx`** — a `"use client"` wrapper reading `useIdentity().state`: `loading` → calm "Loading your workspace…" panel; `no_identity` → `router.replace("/onboarding")`; `locked` → `router.replace("/unlock")`; `unlocked` → render `children`. Client-side redirect only (a static export can do nothing else — matches `app/page.tsx`). Reuse the existing loading copy from `app/page.tsx`. Wrap the routed screen inside `<AppShell>` at the page level so the gate swaps only the content region.
- [ ] **Step 2: Verify** — `pnpm --filter @aesmsg/webapp typecheck` (component consumed by later tasks; a dedicated render test can live alongside `ComposeScreen.test.tsx`).
- [ ] **Step 3: Commit** — `feat(webapp): RequireUnlocked gate for identity-gated routes`.

---

# PHASE 3 — Sender flow (compose → seal → link created)

## Task 6: Compose options + recipient validation (pure helpers)

**Files:** Create `apps/webapp/src/create/compose-options.ts`, `apps/webapp/src/create/recipient.ts`, and their tests.

- [ ] **Step 1: `compose-options.ts`** (D6) — `ExpiryChoice = "10m"|"1h"|"24h"|"7d"|"custom"`; `EXPIRY_PRESETS` table with labels (`"10 minutes"`, `"1 hour"`, `"24 hours" (default)`, `"7 days"`, `"Custom…"`); `MaxOpensChoice = 1 | 3 | -1` with labels (`"1 view (burn on read)"`, `"3 views"`, `"Unlimited (until expiry)"`) and per-option one-line descriptions (calm, no server-trust implied). `DEFAULT_EXPIRY = "24h"`, `DEFAULT_MAX_OPENS = 1`. `MAX_LINK_LIFETIME_MS = 365*24*60*60*1000` (mirror mobile/server). `expiryToDate(choice, now, customDate?)`: presets add their offset; `custom` returns `customDate` **clamped** to `(now + ~1min, now + MAX_LINK_LIFETIME_MS]`. `validateCustomExpiry(date, now)` → ok / `"past"` / `"too_far"` for inline errors.
- [ ] **Step 2: `recipient.ts`** — `validateRecipientKey(input: string): Promise<{ ok: true; publicKey: PublicKeyString; fingerprint: Fingerprint } | { ok: false; reason: "empty" | "invalid" }>`. Trim input; `importPublicKey` + `fingerprint` under try/catch; a non-`amk1:`/malformed key → `{ok:false, reason:"invalid"}` (no throw to the UI). This is the seam SP4's saved-contact picker will plug into — the screen consumes `{publicKey, fingerprint}` regardless of source.
- [ ] **Step 3: Tests** — preset offsets exact; `custom` past → error, custom > 365d → clamped/`too_far`, custom in-range → passthrough. `validateRecipientKey`: a real `exportPublicKey(generateIdentity())` string → `ok` with an `AM-` fingerprint matching `await fingerprint(pk)`; garbage/empty → the right `reason`.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- create/compose-options create/recipient`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): compose expiry/max-opens options + recipient key validation`.

## Task 7: `create-and-seal.ts` — the pinned seal sequence (interop-critical)

**Files:** Create `apps/webapp/src/create/create-and-seal.ts`, `apps/webapp/tests/create/create-and-seal.test.ts`.

- [ ] **Step 1: `create-and-seal.ts`** — implement D1 exactly. Signature:
  ```ts
  export interface CreateAndSealInput {
    recipientPublicKeyString: string;
    message: string;
    expiresAt: Date;
    maxOpens: number;
    label?: string | null;
  }
  export interface CreateAndSealOutput { id: string; url: string; recipientFingerprint: Fingerprint; }
  export async function createAndSeal(input, opts?: { signal?: AbortSignal }): Promise<CreateAndSealOutput>;
  ```
  Steps 1-9 of D1, verbatim ordering. `encodePayload({ text: input.message, attachments: [] })`. Persist the sent-link record **after** a successful `postMessage`, best-effort (swallow storage errors). Return `{ id, url: response.url, recipientFingerprint }`.
- [ ] **Step 2: Tests (the load-bearing ones)** — browser-mode:
  - **No plaintext in the request body (zero-knowledge).** Mock `postMessage` (or `fetch`) to capture the request body. `createAndSeal({ message: "SUPER-SECRET-MARKER", … })` and assert the serialized body **does not contain** `"SUPER-SECRET-MARKER"`, and that its keys are exactly `{id, ciphertext, expiresAt, maxOpens}` (no `text`, no `plaintext`, no `recipientFingerprint`, no `label`, no `revocationToken`).
  - **Call sequence / v2 AAD.** Assert `ciphertext` base64 decodes to a blob whose first two bytes are `WIRE_VERSION=0x01`, `SUITE=0x01`, and `expiresAt`/`maxOpens` in the uploaded body match the `Date`/number passed in.
  - **Wire-interop round-trip (the must-have).** Generate a recipient identity with `@aesmsg/crypto`; run `createAndSeal` addressed to its public key with a mocked API that captures the uploaded base64 ciphertext; then **open it directly with `@aesmsg/crypto`**: `open(base64ToBytes(captured) as Ciphertext, recipientIdentity, { linkId: id, recipientPublicKey: recipientPk, expiresAtMs, maxOpens })` (the **same v2 context**, no `createdAtMs`) → `decodePayload(plaintextBytes).text === message`. This pins that a webapp-sealed blob opens under the exact context an SP3/mobile recipient reconstructs.
  - **Bad key** → rejects **before** any `postMessage` call (assert the mock was never invoked). **RecipientMismatch** is unreachable here (we pass the same key to both args) — note it, don't force it.
  - **Best-effort persistence** — if `recordSentLink` throws, `createAndSeal` still resolves with the link.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- create/create-and-seal`; `typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): local seal + upload pipeline (mobile-identical v2 AAD, no plaintext leaves the browser)`.

## Task 8: Compose screen at `app/new` (per `create_secure_message` mockup)

**Files:** Create `apps/webapp/src/screens/ComposeScreen.tsx`; replace `apps/webapp/app/new/page.tsx`; create `apps/webapp/tests/screens/ComposeScreen.test.tsx`.

- [ ] **Step 1: `ComposeScreen.tsx`** (`"use client"`) — per the mockup, minus the attachment dropzone (D5):
  - The reassurance banner: "Encryption happens locally in your browser. Your plain text never touches our servers." (token-styled, `shield` icon).
  - **Recipient** — a textarea/input for a pasted `amk1:` public key. On blur/change, run `validateRecipientKey`; on success show the derived **`AM-` fingerprint** (in `font-mono`) with a green `verified`-style chip **only** meaning "valid key" (not "verified contact" — verification is SP4; keep the copy honest, e.g. "Valid key"); on failure show an inline error. **Seam for SP4:** a disabled/"coming soon"-free placement note in code for the saved-contact picker — do not build picker UI.
  - **Message** — textarea (the mockup uses `font-mono-code`, but per D8 general body text is **not** mono; use `font-sans` for the compose textarea and reserve `font-mono` for the resulting link/fingerprint).
  - **Link Expiry** — preset selector (`EXPIRY_PRESETS`); choosing `Custom…` reveals a `datetime-local` input validated via `validateCustomExpiry` (inline "in the past"/"beyond the 365-day maximum" errors).
  - **Max Views** — `MaxOpensChoice` selector with the descriptions.
  - **Encrypt & Create Link** — disabled until a valid recipient + valid expiry; on submit show an "Encrypting…" busy state, call `createAndSeal`, then navigate to the link-created screen passing `{id, url, recipientFingerprint, expiryLabel, maxOpensLabel}` via in-memory state (a client store/context or router state — **never** the URL/query, per zero-knowledge: no metadata in history). On error map via `classifyApiError` to calm copy (rate-limited / network / invalid) with a retry.
  - Wrap the page in `<RequireUnlocked><AppShell>…</AppShell></RequireUnlocked>`.
- [ ] **Step 2: `app/new/page.tsx`** — replace the SP1 placeholder with the gated `<ComposeScreen/>`.
- [ ] **Step 3: Tests** — browser-mode RTL with a mounted `IdentityProvider` (set up + unlock an identity first, else the gate redirects): submit is disabled with an empty/invalid recipient; pasting a valid key shows its `AM-` fingerprint; `Custom…` past date shows an error; a valid compose calls `createAndSeal` (spy) with the chosen `Date` + `maxOpens` and, on resolve, transitions to the link-created view. Assert the recipient's plaintext message never appears in any captured request body (reuse the Task 7 mock). Verify no forbidden copy.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/ComposeScreen`; `typecheck`; `pnpm --filter @aesmsg/webapp build`.
- [ ] **Step 5: Commit** — `feat(webapp): compose screen — recipient key + expiry/max-opens + local seal`.

## Task 9: Link-created screen (per `secure_link_created` mockup)

**Files:** Create `apps/webapp/src/components/SecureLinkBlock.tsx`, `apps/webapp/src/screens/LinkCreatedScreen.tsx`; create `apps/webapp/tests/screens/LinkCreatedScreen.test.tsx`. (Rendered by `ComposeScreen`'s success state — no new route needed; a refresh returns to `/new`, which is acceptable since the link is already saved locally + visible in `/links`.)

- [ ] **Step 1: `SecureLinkBlock.tsx`** — the full secure link in **`font-mono`** on a `bg-surface-container-lowest` block with a **Copy Link** button (`navigator.clipboard.writeText(url)` + transient "Copied" affordance). The link is the server-returned `url` (`aesmsg.com/l/<id>`, D2).
- [ ] **Step 2: `LinkCreatedScreen.tsx`** — "Success: Link Created" + "Your message has been sealed and is ready for delivery." (mockup copy); `<SecureLinkBlock url={url}/>`; a summary bento of the expiry + max-opens choices (e.g. "24-hour expiry / 1-view limit"); the "Encrypted locally with AES-256-GCM — decryption happens only on the recipient's device; we never see your keys." reassurance card; a **"Paste this link into any app"** hint (the product's whole point). A secondary **"Create another"** → `/new` and a link to **"View in Links"** → `/links`. (Revoke lives on the details view — Task 12 — not here, to keep this screen about sharing.)
- [ ] **Step 3: Tests** — renders the exact `url` in a `font-mono` element; Copy writes the full URL (mock `navigator.clipboard.writeText`); the expiry/opens summary reflects the passed choices; no forbidden copy; the `url` host is `aesmsg.com` (not `app.aesmsg.com`).
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/LinkCreatedScreen`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): link-created screen with mono secure link + copy`.

---

# PHASE 4 — Links management (list → details → revoke)

## Task 10: Sent-links reconciliation + hook

**Files:** Create `apps/webapp/src/links/link-status.ts`, `apps/webapp/src/links/use-sent-links.ts`; create `apps/webapp/tests/links/link-status.test.ts`.

- [ ] **Step 1: `link-status.ts`** — pure reconciliation of a local `SentLinkRecord` against its `/api/messages/list` result → a display status. Produce `DisplayStatus = "active" | "expiring" | "expired" | "revoked" | "opened_out"` where:
  - server `"active"` + `opensCount < maxOpens` (or `maxOpens === -1`) + not near expiry → `"active"`; within a threshold (e.g. < 1h) of `expiresAt` → `"expiring"` (amber).
  - server `"gone"` → distinguish locally: if the local `expiresAt` is past → `"expired"`; else → `"revoked"` (the sender revoked or opens ran out). Because the server collapses not-found/revoked/expired/exhausted to `gone`, use the local `expiresAt` + `maxOpens`/`opensCount` (last known) to label; when ambiguous prefer the neutral `"expired"`/`"opened_out"`. Keep the mapping in one tested function.
  - Provide `expiresInLabel(expiresAt, now)` and `opensLabel(opensCount, maxOpens)` for the row copy.
- [ ] **Step 2: `use-sent-links.ts`** — a hook: on mount `listSentLinks()`, batch their ids into `listMessages(ids)` (chunk ≤ 100), reconcile via `link-status`, expose `{ links, loading, error, refresh, revoke(id) }`. `revoke(id)` → `revokeLink(id, record.revocationToken)` then `deleteSentLink(id)` or mark revoked + `refresh()`. All network failures classified via `classifyApiError` (never throw to render).
- [ ] **Step 3: Tests** — `link-status` truth table: active/expiring/expired/revoked/opened-out from representative `(serverResult, localRecord, now)` triples. Labels format sanely.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- links/link-status`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): sent-links reconciliation + hook`.

## Task 11: Links list at `app/links` (per `secure_links` desktop mockup)

**Files:** Create `apps/webapp/src/screens/LinksListScreen.tsx`; replace `apps/webapp/app/links/page.tsx`; create `apps/webapp/tests/screens/LinksListScreen.test.tsx`.

- [ ] **Step 1: `LinksListScreen.tsx`** — follow **`secure_links_aesmsg`** (the side-nav table variant): "Secure Links" header + subcopy; optional filter chips (All / Active / Expired / Revoked); a table/list of rows keyed by link, each showing the local `label` (or a truncated id in `font-mono`), the recipient `AM-` fingerprint (mono, truncated), a **status chip** with D8 color semantics (green active, amber expiring, neutral/red expired-revoked), an expiry/opens line, and per-row **Copy Link** + **open details** (→ `/links/[id]`). Empty state: calm "No secure links yet — create one from New Message." Loading + error states first-class. Uses `useSentLinks()`.
- [ ] **Step 2: `app/links/page.tsx`** — replace the SP1 placeholder with `<RequireUnlocked><AppShell><LinksListScreen/></AppShell></RequireUnlocked>`.
- [ ] **Step 3: Tests** — with seeded `sent-links` records + a mocked `listMessages`, assert each `DisplayStatus` renders its chip/label; the active row's Copy writes the link; empty store → empty state; a `listMessages` failure → the error state (not a crash), rows still shown from local metadata.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/LinksListScreen`; `typecheck`; `build`.
- [ ] **Step 5: Commit** — `feat(webapp): links list with live status per secure_links mockup`.

## Task 12: Link details + revoke (destructive, confirmed)

**Files:** Create `apps/webapp/src/components/ConfirmRevokeDialog.tsx`, `apps/webapp/src/screens/LinkDetailsScreen.tsx`, `apps/webapp/app/links/[id]/page.tsx`; create `apps/webapp/tests/screens/LinkDetailsScreen.test.tsx`.

- [ ] **Step 1: Static-export dynamic route** — `app/links/[id]/page.tsx` needs `export function generateStaticParams() { return []; }` (static export requires it; the real id is read client-side from `useParams()` — the page renders a client `<LinkDetailsScreen/>` that looks the record up in IndexedDB). No id ever hits the server via the URL beyond the existing `/list`/`/revoke` calls the user triggers.
- [ ] **Step 2: `LinkDetailsScreen.tsx`** — for the record `getSentLink(id)`: show label, recipient `AM-` fingerprint (mono), the full `aesmsg.com/l/<id>` link (`<SecureLinkBlock/>`), created/expiry, max-opens + last-known opens, and the reconciled status. Primary **Copy Link**; destructive **Revoke Link** (red, `text-error`/`border-error`) → opens `ConfirmRevokeDialog`. If the record is missing (cleared/never-saved) → calm "This link isn't tracked on this device."
- [ ] **Step 3: `ConfirmRevokeDialog.tsx`** — a red/destructive confirm ("Revoke this link? This permanently purges the ciphertext from the server. Anyone with the link will see 'This secure link is no longer available.' This cannot be undone."). Confirm → `useSentLinks().revoke(id)` (→ `revokeLink(id, token)` server purge, then local update). Opaque success (the server always answers 200); on network failure show a retry, not a leak.
- [ ] **Step 4: Tests** — details renders the record fields + mono link; Revoke opens the confirm; confirming calls `revokeLink` with the stored `revocationToken` in the header (spy) and transitions the row to revoked; cancel is a no-op; missing record → the calm empty copy. Verify destructive styling uses `text-error`/`border-error` tokens (red reserved for destructive per D8).
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/LinkDetailsScreen`; `typecheck`; `build`.
- [ ] **Step 6: Commit** — `feat(webapp): link details + confirmed server-purge revoke`.

---

# PHASE 5 — Docs + final gate

## Task 13: Docs — AGENTS.md caveat + deploy forward-ref

**Files:** Modify `apps/webapp/AGENTS.md`, `docs/deploy.md`.

- [ ] **Step 1: `apps/webapp/AGENTS.md`** — add a short "Sender flow + sent links" note: the seal sequence is pinned to mobile (D1); the shareable link is `aesmsg.com/l/<id>` (bouncer host), not `app.aesmsg.com`; the `sent-links` IndexedDB store holds **metadata only** (no plaintext/ciphertext) but is **not encrypted at rest** on web, so the local `revocationToken` is an availability-only exposure (D7) — never a confidentiality break.
- [ ] **Step 2: `docs/deploy.md`** — in the `apps/webapp` section SP1 added, resolve the forward reference: the API CORS allowlist `AESMSG_WEBAPP_ORIGIN=https://app.aesmsg.com` is **now landed** in `apps/api` (this sub-project). No new webapp env. Never mention Vercel.
- [ ] **Step 3: Verify** — `pnpm lint`; confirm no "Vercel" and no forbidden marketing claims (`git grep -nE "military-grade|unbreakable|impossible to hack" -- apps/webapp docs` → none).
- [ ] **Step 4: Commit** — `docs: webapp sender-flow + sent-links caveats; api CORS env forward-ref`.

## Task 14: Final verification gate (repo-root green) + interop/invariant sweep

- [ ] **Step 1: Typecheck** — `pnpm typecheck` (all workspaces incl. `@aesmsg/api`, `@aesmsg/webapp`).
- [ ] **Step 2: Lint** — `pnpm lint`; if Biome flags new files, `pnpm lint:fix`, re-run, amend.
- [ ] **Step 3: Tests** — `pnpm test` green across all workspaces (the new `apps/api` CORS tests; the webapp lib/api/links/create/screens suites incl. **no-plaintext-in-body** and **wire-interop round-trip**).
- [ ] **Step 4: Static build** — `pnpm --filter @aesmsg/webapp build` succeeds; `/new`, `/links`, `/links/[id]` export; then `pnpm --filter @aesmsg/webapp check:csp` (build must exist first) → zero CSP violations. `rm -rf apps/webapp/out` after.
- [ ] **Step 5: Invariant sweep** —
  ```
  git grep -nE "military-grade|unbreakable|impossible to hack" -- apps/webapp   # none
  git grep -n "app.aesmsg.com/l/" -- apps/webapp/src                             # none (links use aesmsg.com)
  ```
  Manually confirm the compose→seal path builds `MessageBindingContext` **without** `createdAtMs` (v2 AAD) and uploads only `{id,ciphertext,expiresAt,maxOpens}`.
- [ ] **Step 6: Final commit** — `git add -A && git commit -m "chore(webapp): SP2 verification fixes" || echo "clean"`.

---

## Out of scope for SP2 (do NOT implement here)

Per spec §8/§9/§12:
- **Recipient/reader flow** — the webapp reader, explicit-fetch gate, error states, `GET /:id` + `/open` wiring, and the `aesmsg.com` bouncer "Open in browser" action — **SP3**.
- **Contacts directory + verification** — saved-contact recipient picker, paste/QR add, fingerprint verification, key-changed alert — **SP4** (SP2 leaves the recipient-input seam clean).
- **File attachments** (picker/drag-drop/25 MiB UI), key rotation, encrypted backup export/import, security settings, clipboard auto-clear / background blur — **SP5** (D5).
- **aesmsg Pro / web billing, push, passkey/WebAuthn-PRF, cross-surface identity/key sync** — deferred.
- **Any `apps/api` change beyond the single `@fastify/cors` registration** — no route, store, rate-limit, or body-cap change. **Any `packages/crypto` or `packages/server-store` change** — frozen. **Any `apps/mobile` change** — untouched.

---

## Self-review — spec coverage

- **CORS-first, its own task, three test cases** — Task 1 (§7): predicate allowlist from `AESMSG_WEBAPP_ORIGIN` mirroring `AESMSG_PUBLIC_LINK_ORIGIN`; allowlisted-origin preflight+actual ✓, other-origin no-headers ✓, no-Origin unchanged ✓.
- **Typed API client matching `apps/api` exactly + error taxonomy** — Task 3 (the pinned contract table).
- **Compose per mockup: pasted key → `AM-` fingerprint, expiry presets, max-opens, local seal with the exact mobile v2 sequence, upload, navigate** — Tasks 6-8 (D1/D6); saved-contact picker seam left for SP4.
- **Attachments decision stated + justified (→ SP5)** — D5.
- **Link-created: server-returned `aesmsg.com/l/<id>` in mono + copy + summary** — Task 9 (D2).
- **Sent-links IndexedDB (schema-versioned migration), list per `secure_links` desktop mockup with active/expiring/expired/revoked/opened-out, details, confirmed destructive revoke (server purge)** — Tasks 4, 10-12 (D7).
- **Identity gating for `/new` + `/links`** — Task 5 (fixes SP1's ungated placeholders).
- **Zero-knowledge invariants restated + tested** — no plaintext leaves the browser / no plaintext in URL-history-storage / sent-links metadata-only — D7 + Task 4 + Task 7 (no-plaintext-in-body assertion) + Task 8.
- **Tests: component tests, seal-sequence-vs-mocked-API asserting no plaintext, list states, revoke flow, CORS, wire-interop** — Tasks 1, 3, 4, 7, 8, 11, 12 (§10).
- **Copy + color semantics; calm SaaS tone** — D8, enforced throughout, swept in Task 14.
- **Repo-root green gate** — Task 14: `pnpm typecheck && pnpm lint && pnpm test`.
