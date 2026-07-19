# Sub-project 3 — Web client recipient flow + bouncer integration (`apps/webapp` + `apps/web`) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a standalone web identity (SP1) **receive**. A recipient taps `https://aesmsg.com/l/<id>` in any chat app; the static bouncer (`apps/web`) now offers **"Open in browser"** → `https://app.aesmsg.com/l/<id>`; the webapp reader renders a **static, zero-network landing first**; a single explicit **"Open message"** action runs the *exact* mobile open/decrypt sequence — POST `/api/messages/:id/open` (the one open-consuming call), reconstruct the **v2 AAD** from the open response + the recipient's own public key, `open()` locally, `decodePayload()` — and shows the secure reader. Every failure resolves to a first-class, metadata-free terminal screen. **Link-preview safety is the core invariant:** an auto-fetching preview bot must never consume an open on **either** origin — proven by explicit zero-network tests on both.

Interop with mobile is non-negotiable: a **mobile-sealed** message must open in this reader and a **webapp-sealed** message (SP2) must open on mobile — same wire bytes, same AAD reconstruction.

**Architecture:** Four layers on top of SP1/SP2, plus one change in `apps/web`.
1. **Webapp transport (additive):** wire `openMessage(id)` in the existing [`apps/webapp/src/api/client.ts`](../../../apps/webapp/src/api/client.ts) (its `OpenMessageResponse` type is already declared for SP3, unwired). No new endpoint; relies on SP2's `@fastify/cors` allowlist.
2. **Webapp reader pure logic:** `src/reader/reader-id.ts` (parse the link id from the URL), `src/reader/reader-error.ts` (thrown-error → opaque terminal, mirroring [`apps/mobile/src/reader/reader-error.ts`](../../../apps/mobile/src/reader/reader-error.ts)), `src/reader/open-and-decrypt.ts` (a browser port of [`apps/mobile/src/reader/fetch-and-open.ts`](../../../apps/mobile/src/reader/fetch-and-open.ts) — the interop-critical AAD reconstruction), `src/reader/copy.ts` (the exact opaque strings, mirroring [`apps/mobile/src/reader/copy.ts`](../../../apps/mobile/src/reader/copy.ts)).
3. **Webapp reader UI:** the static `/l` route (`app/l/page.tsx`), the zero-network landing, inline unlock, the secure reader (copy + clipboard auto-clear + blur-on-`visibilitychange`), and the five terminal screens — all composed from `@aesmsg/design-tokens` + `@aesmsg/ui`.
4. **Bouncer integration (`apps/web`):** a plain static "Open in browser" `<a>` on `BouncerScreen`, pointing at `app.aesmsg.com/l/<id>` for valid ids only, from a constant module — **no fetch, no state query, still 100% static.**

`@aesmsg/crypto` and `@aesmsg/server-store` are **frozen** — consumed verbatim. **No `apps/api` change** (the only backend change, `@fastify/cors`, landed in SP2 and already covers `/open`). **No `apps/mobile` change.**

**Tech Stack:** Next.js 16 static export (`output: 'export'`, unchanged from SP1); React 19; `@aesmsg/crypto` (workspace, unchanged); native IndexedDB (read-only here — no schema change); Vitest 3 **browser mode** (headless Chromium via Playwright); Biome 2 (repo-wide). `apps/web`: Next.js 16 **`next start`** (NOT a static export — it keeps `headers()`, so its `/l/[id]` dynamic route builds normally).

**Spec:** [`docs/superpowers/specs/2026-07-18-messaging-web-client-design.md`](../specs/2026-07-18-messaging-web-client-design.md) — this plan implements **item 3 of §9** ("Recipient flow + bouncer integration"), honoring **§6.1 verbatim** (recipient flow & link-preview safety), §3 (honest web-tier scoping — screenshot blocking impossible), and **§10** ("an explicit test asserting `/l/[id]` on **both** origins performs zero network requests before user action"). Builds on [`2026-07-18-webapp-foundation-identity.md`](./2026-07-18-webapp-foundation-identity.md) (SP1) and [`2026-07-18-webapp-sender-links.md`](./2026-07-18-webapp-sender-links.md) (SP2), including SP2's **Deviation** (dynamic `[id]` segments do NOT build under `output: 'export'`; SP2 shipped `/links/details?id=` instead of `/links/[id]`).

---

## ⚠️ Pinned decisions — read before starting

These resolve every open question in the task. They **override** conflicting training-data habits.

### D1. Reader route — a static `/l` page + a host rewrite for `/l/<id>` (RESOLVED)

The public link shape is fixed: the API mints `${AESMSG_PUBLIC_LINK_ORIGIN}/l/<id>` and the bouncer's "Open in browser" points at `https://app.aesmsg.com/l/<id>`. We **cannot** change that shape, and a dynamic `[id]` segment **cannot** build under `output: 'export'` (Next 16 rejects a dynamic route without `generateStaticParams`, and a pre-rendered `[id]` cannot serve an arbitrary id from a static host — SP2 hit exactly this and shipped `/links/details?id=`). Resolution, verified against `apps/webapp/node_modules/next/dist/docs/01-app/02-guides/static-exports.md`:

- **Build a plain static route `/l`** at `app/l/page.tsx`. With the webapp's default `trailingSlash: false`, `next build` emits **`out/l.html`** (routes export as `out/<route>.html`; the doc's own example emits `/out/blog/post-1.html`). No `[id]` segment, no `generateStaticParams`.
- **The client parses the id from the URL** in a `"use client"` component (guarded for the build-time prerender where `window` is undefined — the static-export doc's "Browser APIs" section: read `window` only in the browser). Resolution order in `readLinkId()` (D-below, Task 2):
  1. `window.location.pathname` matches `^/l/([A-Za-z0-9_-]{16})/?$` → the path id (**production**: the host rewrites `/l/<id>` → serves `l.html`, and `try_files`/internal rewrite does **not** change the browser URL, so `pathname` is still `/l/<id>`).
  2. else the `?id=` search param (**dev/local**: `next dev` has no `[id]` route, so `/l/<id>` 404s — developers test via `http://localhost:3001/l?id=<id>`; `useSearchParams` supplies it). Wrap the reader in `<Suspense>` exactly as `app/links/details/page.tsx` does (static export requires a Suspense boundary around `useSearchParams`).
  3. neither (or the id fails `LINK_ID_REGEX`) → the **Invalid** terminal, with **zero network**.
- **Host rewrite (documented in `docs/deploy.md`, Task 10).** The nginx/Sproobo static host must map `/l/<id>` to `l.html` without a redirect (the static-export doc shows this exact pattern for `trailingSlash: false`):
  ```nginx
  # Reader shell: serve the same static l.html for /l and /l/<16-char base64url id>.
  # The client reads the id from location.pathname; try_files serves the file WITHOUT changing the URL.
  location = /l  { try_files /l.html =404; }
  location ~ "^/l/[A-Za-z0-9_-]{16}/?$" { try_files /l.html =404; }
  ```
  The 16-char regex mirrors `LINK_ID_REGEX`, so junk paths still `404` at the edge; the client re-validates regardless (defense in depth).
- **Do NOT add `next.config` `rewrites()`** — rewrites are an *Unsupported Feature* under `output: 'export'` and *error* under `next dev` per the static-export doc. Dev relies on the `?id=` fallback only.
- The existing SP1 placeholder `app/reader/page.tsx` is **deleted** (it is unlinked from nav; the real reader is `/l`). The CSP inject/verify pipeline (`scripts/inject-csp.mjs`, `check:csp`) walks `out/**/*.html`, so `l.html` is covered with **no pipeline change**.

### D2. The open/decrypt sequence is pinned to mobile — one POST `/open`, no GET metadata (interop-critical)

Source of truth: [`apps/mobile/src/reader/fetch-and-open.ts`](../../../apps/mobile/src/reader/fetch-and-open.ts). The webapp reader reproduces it **byte-for-byte**, with **one deliberate divergence** (no metadata GET — justified below):

1. `const response = await openMessage(id)` — **POST `/api/messages/:id/open`, empty body** (the server rejects any body). This is the **single open-consuming call**; it returns `OpenMessageResponse { ciphertext, createdAt, expiresAt, opensCount, maxOpens, status }`.
2. `const ownPublicKey = exportPublicKey(identity)`.
3. Reconstruct the binding context — **deterministic AAD version, no fallback**, exactly as mobile:
   ```ts
   const base = {
     linkId: id,                              // from the URL
     recipientPublicKey: ownPublicKey,        // the reader's OWN public key
     expiresAtMs: new Date(response.expiresAt).getTime(),
     maxOpens: response.maxOpens,
   };
   const context: MessageBindingContext =
     response.createdAt !== null
       ? { ...base, createdAtMs: new Date(response.createdAt).getTime() }  // legacy v1 link
       : base;                                                             // v2 link → omit createdAtMs
   ```
   New links store no `createdAt` (`createdAt: null`) → the v2 AAD is rebuilt without it, matching SP2's seal (which **omits** `createdAtMs`). This closes the interop loop: SP2 seals v2, SP3 opens v2.
4. `const plaintextBytes = await open(base64ToBytes(response.ciphertext) as Ciphertext, identity, context)`.
5. `const payload = decodePayload(plaintextBytes)` → `{ text, attachments }`. A successful `open()` proves the message was sealed for **this** identity; the recipient fingerprint is the reader's own (`await fingerprint(ownPublicKey)`), never trusted from the server.

**No GET `/api/messages/:id` in the reader.** Mobile GETs metadata first only to render a *pre-open* landing (expiry recap, "opens once" caution) — but the webapp landing is **intentionally metadata-free** to hold the zero-network-before-action invariant (§6.1.3), and `decryptOpenResponse` needs **only** the open response. A GET would be a wasted round-trip that displays nothing. So the reader's minimal fetch sequence is **exactly one POST**. `getMessage`'s type stays declared in `client.ts` (unused by the reader).

Key rotation fallback (mobile's `decryptWithKeyFallback` over retired keys) is **out of scope** — SP1/SP2 web identities have exactly one key (rotation lands in SP5). Open with the single active key; a `DecryptionError` is terminal.

### D3. Identity gate is BEFORE the open POST, NOT after (don't burn a view-once open)

The task's loose phrasing ("action triggers the fetch sequence; then unlock prompt if locked") is **refined here for a correctness reason**: a POST `/open` **consumes** the only view of a view-once link. If we POST before unlocking and the recipient then **can't** unlock (forgot passphrase) or has **no identity**, we would have destroyed the message for nothing. So the "Open message" tap gates on identity **first**, then POSTs — matching mobile (whose identity gate is applied *before* the reader flow even mounts). The exact state flow (D5) is:

- `entry` (static landing, zero network) → user taps **Open message** →
  - `state === "no_identity"` → **`no_identity` terminal** (calm explanation; NO network, NO open consumed).
  - `state === "locked"` → **inline unlock** (no navigation away — see D5); on a successful unlock, auto-continue to the POST.
  - `state === "unlocked"` → **`opening`** → POST `/open` → decrypt → `decrypted`.

The tap's *intent to open* carries through the unlock: after `unlock()` flips identity to `unlocked`, the flow proceeds to the POST without a second tap.

### D4. Error → screen mapping (pinned; expired/revoked/exhausted are indistinguishable)

The classifier (`src/reader/reader-error.ts`, pure, no React, no `@aesmsg/crypto` import — matches errors by `Error.name`) mirrors mobile's security invariant and the design's five terminal screens. **The server deliberately collapses revoked / expired / max-opens-exhausted / never-existed into one status** (`/open` → `410 no_longer_available`; there is no distinguishable "already opened" — confirmed in [`apps/api/src/handlers/messages-handler.ts:270-273`](../../../apps/api/src/handlers/messages-handler.ts) and mobile's `reader-error.ts` invariant comment). The webapp **must not invent** an already-opened state.

| Thrown by | Condition | Outcome | Screen | Copy |
|---|---|---|---|---|
| pre-flight | id fails `LINK_ID_REGEX` | `invalid` | InvalidPayload | (no network) |
| `open` POST | `ApiError(410)` **or** `ApiError(404)` | `gone` | **LinkUnavailable** | `"This secure link is no longer available."` — **nothing more** |
| `open` POST | `ApiError(400)` | `invalid` | InvalidPayload | structural "not a aesmsg link" |
| `open` POST | `ApiError(429)`, `ApiError(5xx)`, `NetworkError`, `TimeoutError`, `MalformedResponseError` | `network` | **NetworkError (retryable)** | "No open was consumed." |
| `open()` (crypto) | `DecryptionError` (incl. bad AAD metadata) | `failed` | **DecryptionFailed** | wrong key, **no recovery, no retry** |
| `decodePayload()` | `InvalidFormatError` | `invalid` | InvalidPayload | malformed envelope |

Notes:
- **`gone` never splits.** 410 and 404 both → the single opaque LinkUnavailable. Never reveal which of revoked/expired/exhausted a link is.
- **One intentional divergence from mobile's `classifyReaderError`:** mobile lumps a post-open `InvalidFormatError` into its `failed`/`network` path; the webapp routes it to the dedicated **InvalidPayload** screen (which the task requires and which leaks nothing — a malformed-envelope signal is structural, not metadata). Document this in the file comment.
- **`already-opened` is NEVER produced.** No `AlreadyOpened` screen ships (mobile keeps one presentationally for a future sanctioned signal; the webapp omits it entirely to avoid dead UI).
- **Network is retryable because no open was consumed** on 429/5xx (rate-limit is checked before `incrementOpens`) and on a transport failure that never reached the store. A retry re-issues a fresh POST.

### D5. The reader is a focused full-screen surface — NOT `RequireUnlocked`, NOT inside `AppShell`

A recipient arrives from an external chat app and **may have no identity at all**. The reader therefore:
- **Is NOT wrapped in `<RequireUnlocked>`** (that redirects `no_identity`→`/onboarding`, `locked`→`/unlock`, which would blow away the reader URL and its link id). The reader renders its **static landing regardless of identity state**, and handles identity inline.
- **Inline unlock, not a redirect to `/unlock`.** A locked recipient unlocks *in place* using a lightweight passphrase form built from the existing `PasswordField` + `PrimaryButton` primitives calling `useIdentity().unlock()` — so the link id and reader context survive. (Reusing the full `UnlockScreen` would navigate/offer wipe; keep the recipient in-context.)
- **Renders OUTSIDE `AppShell`** (no side-nav). The reader is a single-purpose surface, like mobile's full-screen `ReaderFlow`. Showing the sender's workspace chrome to a bare recipient is wrong.
- Identity is consumed via the existing `IdentityProvider` (already mounted in `app/layout.tsx`); `no_identity` copy points the user to create/import an identity or open in the app.

### D6. Secure-reader web mechanics — honest about the platform (§3, §6.1.5)

- **Plaintext is memory-only.** The decrypted `text` lives in React state; it is **never** written to the URL, `history`, `localStorage`, `sessionStorage`, IndexedDB, or any cache. On unmount/navigation a cleanup effect drops it. No `?text=`, no hash, nothing.
- **Clipboard copy + auto-clear (30–60 s), documented limits.** `navigator.clipboard.writeText(text)`; schedule a timeout (default **45 s**, in the 30–60 s band). On fire, **read back** `navigator.clipboard.readText()` and overwrite with `""` **only if it still equals our text** (never clobber unrelated clipboard content) — mirroring mobile `ReaderScreen.onCopy`. **Honest caveats to code-comment + AGENTS.md:** `readText()` needs clipboard-read permission and a focused document; Firefox/Safari may deny it; a timer firing while the tab is unfocused will reject. When read-back is unavailable we **do not blind-clear** (could wipe the user's later copy) — we surface calm copy that auto-clear could not be confirmed. This is strictly weaker than mobile's native clipboard control — stated plainly, not papered over.
- **Blur-on-`visibilitychange`.** A `usePrivacyShield` hook listens to `document.visibilitychange` (and `window.blur`); when hidden, render an **opaque overlay** covering the plaintext (mirrors mobile `isObscured` cover). Best-effort.
- **Screenshot blocking is impossible on web.** Documented gap — **not** attempted, **not** implied. The reader shows the mobile caution "Anyone who can see your screen can read this now."; the fuller "native offers stronger delivery guarantees" copy lands with security settings in SP5. Note the gap in `AGENTS.md`.

### D7. Attachments in the reader — deferred to SP5, but never crash NOW

SP3 is **text-first**, matching SP2's text-only seal (D5 there) and §8 ("attachments polish" → SP5). But `decodePayload` **surfaces** `attachments: PayloadAttachment[]`, and a *mobile-sealed* message could carry them. The reader must handle that **without crashing**:
- The decrypted **text still renders** normally.
- If `payload.attachments.length > 0`, show a **calm notice** (amber/info, not error): e.g. *"This message includes N attachment(s). Saving attachments in the browser isn't supported yet — open it in the aesmsg app to download them."* No download UI, no file writes.
- Never throw on a non-empty `attachments` array. Covered by a test (Task 7).

### D8. Bouncer stays 100% static (§6.1.2, §11)

- Add a plain static `<a href="https://app.aesmsg.com/l/<id>">Open in browser</a>` **secondary** action to `BouncerScreen` — only when `id` passes `LINK_ID_REGEX` (reuse `isValidLinkId` from `deep-link.ts`). The existing "Open in app" deep-link stays the **primary** action; store buttons stay.
- The origin lives in a **constant module** `apps/web/src/bouncer/reader-link.ts` (mirroring the `app-store-links.ts` constant pattern), **build-time overridable**: `export const WEBAPP_ORIGIN = process.env.NEXT_PUBLIC_AESMSG_WEBAPP_ORIGIN ?? "https://app.aesmsg.com";` and `browserReaderUrl(id)` returning `${WEBAPP_ORIGIN}/l/${id}` for a valid id, `null` otherwise (so a malformed id never builds a misleading link — same stance as `appDeepLink`).
- **No fetch, no state query, no analytics** — the button is an inert anchor. Guarded by the zero-network test (Task 8).

### D9. Conventions unchanged (SP1/SP2 [`apps/webapp/AGENTS.md`](../../../apps/webapp/AGENTS.md) D8)

No `.js` import extensions. Never hardcode colors/spacing — token utilities only (`bg-surface`, `bg-surface-container`, `text-on-surface`, `text-on-surface-variant`, `text-primary`, `border-outline-variant`, `text-error`, `text-success`, `text-warning`) + numeric Tailwind spacing. `font-mono` **only** for the link id / fingerprint. Color semantics: **green** = decrypted/safe, **amber** = caution (view-once, attachments-not-supported), **red** = destructive only. Calm SaaS copy; error screens are **where users learn the security model** — match the mobile terminal copy tone; **never** "unbreakable"/"military-grade"/"impossible to hack".

---

## File-structure target

After this plan completes (⊕ = modified; ✖ = deleted):

```
apps/webapp/
├─ src/
│  ├─ api/client.ts                          ⊕ Task 1  (wire openMessage — POST /open, no body)
│  ├─ reader/
│  │  ├─ reader-id.ts                          Task 2  (readLinkId: pathname → ?id= → invalid)
│  │  ├─ reader-error.ts                       Task 3  (classifyReaderError + screenForOutcome)
│  │  ├─ copy.ts                               Task 3  (LINK_UNAVAILABLE_COPY etc. — exact strings)
│  │  ├─ open-and-decrypt.ts                   Task 4  (mobile fetch-and-open port — v2 AAD)
│  │  ├─ use-clipboard-auto-clear.ts           Task 5  (write + verified 45s clear)
│  │  └─ use-privacy-shield.ts                 Task 5  (visibilitychange blur overlay)
│  ├─ components/
│  │  └─ InlineUnlock.tsx                       Task 6  (in-context passphrase → useIdentity().unlock)
│  └─ screens/reader/
│     ├─ ReaderLandingScreen.tsx                Task 6  (static entry, ZERO network)
│     ├─ SecureReaderScreen.tsx                 Task 7  (decrypted: text + copy + blur + attach notice)
│     ├─ LinkUnavailableScreen.tsx              Task 6
│     ├─ DecryptionFailedScreen.tsx             Task 6
│     ├─ InvalidPayloadScreen.tsx               Task 6
│     ├─ NetworkErrorScreen.tsx                 Task 6  (retryable)
│     ├─ NoIdentityScreen.tsx                   Task 6
│     └─ ReaderFlowScreen.tsx                   Task 8  (orchestrator: state + identity gate + open)
├─ app/
│  ├─ l/page.tsx                                Task 8  (static /l route → <Suspense><ReaderFlowScreen/>)
│  └─ reader/page.tsx                         ✖ Task 8  (delete SP1 placeholder)
├─ AGENTS.md                                  ⊕ Task 10 (recipient flow + web mechanics + gaps)
└─ tests/
   ├─ api/client.test.ts                      ⊕ Task 1  (openMessage: POST, no body, parse/validate)
   ├─ reader/reader-id.test.ts                  Task 2
   ├─ reader/reader-error.test.ts               Task 3
   ├─ reader/open-and-decrypt.test.ts           Task 4  (wire-interop round-trip + wrong-key)
   ├─ reader/use-clipboard-auto-clear.test.ts   Task 5
   ├─ reader/use-privacy-shield.test.ts         Task 5
   ├─ screens/reader/ReaderLandingScreen.test.tsx  Task 6
   ├─ screens/reader/SecureReaderScreen.test.tsx   Task 7 (copy/blur/attachments/no-plaintext-leak)
   └─ screens/reader/ReaderFlowScreen.test.tsx     Task 8 (ZERO-NETWORK + sequence + errors + happy)

apps/web/
├─ src/bouncer/reader-link.ts                   Task 9  (WEBAPP_ORIGIN + browserReaderUrl)
├─ src/bouncer/BouncerScreen.tsx              ⊕ Task 9  (+ "Open in browser" static secondary link)
└─ tests/bouncer/
   ├─ reader-link.test.ts                       Task 9
   └─ BouncerScreen.test.tsx                   ⊕ Task 9  (href + ZERO-NETWORK instrumentation)

docs/deploy.md                                ⊕ Task 10 (nginx /l/<id> rewrite; bouncer Open-in-browser)
```

Visual sources of truth (do not author new mockups): `secure_link_aesmsg` (reader link-landing), `secure_reader_aesmsg` (decrypted reader), `link_expired_aesmsg` (LinkUnavailable), `decryption_failed_aesmsg` (DecryptionFailed). Where mockup copy is crypto-dramatic (`ISO 27001 Certified`, `RSA_4096_SHA256`, biometric-vault language), **translate to the calm shipped strings** used by the mobile terminal screens ([`apps/mobile/src/reader/copy.ts`](../../../apps/mobile/src/reader/copy.ts) + the terminal `*.tsx`) — those are the real product voice, and the mockups predate the current copy/crypto.

---

# PHASE 1 — Reader transport + pure logic (no UI)

Each task leaves the repo green. Verify per-workspace with `pnpm --filter @aesmsg/webapp …` until the final gate (Task 11).

## Task 1: Wire `openMessage` in the API client

**Files:** Modify `apps/webapp/src/api/client.ts`, `apps/webapp/tests/api/client.test.ts`.

- [ ] **Step 1: `openMessage(id, options?)`** — add below the declared reader types. POST `/api/messages/${encodeURIComponent(id)}/open` via the existing `fetchJson` helper with **`method: "POST"` and NO body** (the server 400s any body; do not send `content-type`/body). Add `cache: "no-store"`. Validate with a new `validateOpenMessageResponse(body)`: require `ciphertext: string`, `createdAt: string | null`, `expiresAt: string`, `opensCount: number`, `maxOpens: number`, `status: "active"|"revoked"|"expired"` — else `MalformedResponseError`. Reuse the existing `ApiError`/`TimeoutError`/`NetworkError`/`MalformedResponseError` taxonomy (a non-2xx → `ApiError(status)`; the 410/400 the reader depends on flow through unchanged). Leave `getMessage` **declared but unwired** (the reader does not use it — D2).
- [ ] **Step 2: Tests** — stub `globalThis.fetch`: `openMessage("<16-char id>")` POSTs to `${API_ORIGIN}/api/messages/<id>/open` with **no request body** and returns the parsed `OpenMessageResponse`; a 410 → `ApiError` with `status === 410`; a 400 → `status === 400`; a 200 with a garbage body → `MalformedResponseError`; a fetch rejection → `NetworkError`. Keep the existing create/list/revoke tests green.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- api/client`; `pnpm --filter @aesmsg/webapp typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): wire openMessage (POST /open, no body) for the reader`.

## Task 2: `reader-id.ts` — parse the link id from the URL

**Files:** Create `apps/webapp/src/reader/reader-id.ts`, `apps/webapp/tests/reader/reader-id.test.ts`.

- [ ] **Step 1: `reader-id.ts`** — a **pure** function so it is testable in Node/browser without a router:
  ```ts
  export const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;
  export type ReadLinkIdResult = { ok: true; id: string } | { ok: false };
  // pathname e.g. "/l/abcdefghijkl0123" (prod, after host rewrite) or "/l"; search e.g. "?id=abc…" (dev).
  export function readLinkId(pathname: string, search: string): ReadLinkIdResult;
  ```
  Order (D1): (1) `pathname` match `^/l/([A-Za-z0-9_-]{16})/?$` → `{ ok, id }`; (2) else `new URLSearchParams(search).get("id")` validated against `LINK_ID_REGEX`; (3) else `{ ok: false }`. Mirror the local-regex convention (`apps/web/src/bouncer/deep-link.ts`, mobile `link-id.ts`).
- [ ] **Step 2: Tests** — `/l/abcdefghijkl0123` (+ trailing slash) → ok; `/l?id=abcdefghijkl0123` (via `search`) → ok; `/l` with empty search → `ok:false`; a 15/17-char or `+`/`/`-containing id → `ok:false`; a path id takes precedence over a conflicting `?id=`.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- reader/reader-id`; `typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): reader link-id parse (path + ?id= fallback)`.

## Task 3: `reader-error.ts` + `copy.ts` — opaque terminal mapping

**Files:** Create `apps/webapp/src/reader/reader-error.ts`, `apps/webapp/src/reader/copy.ts`, `apps/webapp/tests/reader/reader-error.test.ts`.

- [ ] **Step 1: `copy.ts`** — dependency-free constants (no React), mirroring [`apps/mobile/src/reader/copy.ts`](../../../apps/mobile/src/reader/copy.ts) so they are Node-assertable and interpolate nothing from the API:
  ```ts
  export const LINK_UNAVAILABLE_COPY = "This secure link is no longer available.";
  export const DECRYPTION_FAILED_COPY =
    "This message could not be decrypted with your identity. It was sealed for a different key. " +
    "There is no recovery.";
  export const INVALID_PAYLOAD_TITLE = "This doesn't look like a valid secure message";
  export const INVALID_PAYLOAD_BODY = "The link may be incomplete or wasn't created by aesmsg.";
  export const NETWORK_ERROR_TITLE = "Couldn't fetch the encrypted message";
  export const NETWORK_ERROR_HINT = "No open was consumed.";
  ```
- [ ] **Step 2: `reader-error.ts`** — **pure, no React, no `@aesmsg/crypto` import** (match crypto errors by `Error.name`). Port [`apps/mobile/src/reader/reader-error.ts`](../../../apps/mobile/src/reader/reader-error.ts) with the D4 table:
  ```ts
  export type ReaderOutcome = "gone" | "invalid" | "network" | "failed";
  export function classifyReaderError(err: unknown): ReaderOutcome;
  ```
  - `err.name === "DecryptionError" || "BadPassphraseError"` → `"failed"` (checked FIRST).
  - `err.name === "InvalidFormatError"` → `"invalid"` (the intentional divergence from mobile — document it in the file header).
  - `err instanceof ApiError`: `410 || 404` → `"gone"`; `400` → `"invalid"`; else → `"network"`.
  - anything else (`NetworkError`/`TimeoutError`/`MalformedResponseError`/non-Error) → `"network"`.
  Include the security-invariant comment from mobile verbatim in spirit: 410/404 collapse to the single opaque `gone`; never split; `already-opened` is never produced.
- [ ] **Step 3: Tests** — the full truth table: a `DecryptionError` → `failed`; an `InvalidFormatError` → `invalid`; `new ApiError(410)`/`(404)` → `gone`; `new ApiError(400)` → `invalid`; `new ApiError(429)`/`(500)` → `network`; `new NetworkError()`/`new TimeoutError()`/`new MalformedResponseError("x")` → `network`; a plain `{}` → `network`. **Explicit invariant assertion:** 410 and 404 map to the *same* `gone` outcome (no distinguishability).
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- reader/reader-error`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): reader error classifier + opaque terminal copy (mobile parity)`.

## Task 4: `open-and-decrypt.ts` — the interop-critical open/decrypt

**Files:** Create `apps/webapp/src/reader/open-and-decrypt.ts`, `apps/webapp/tests/reader/open-and-decrypt.test.ts`.

- [ ] **Step 1: `open-and-decrypt.ts`** — implement D2 exactly. Signature:
  ```ts
  export interface OpenAndDecryptOutput {
    text: string;
    attachments: PayloadAttachment[];
    recipientFingerprint: Fingerprint;
    opensCount: number;
    maxOpens: number;
    status: "active" | "revoked" | "expired";
  }
  export async function openAndDecrypt(id: string, identity: IdentityKeypair): Promise<OpenAndDecryptOutput>;
  ```
  Steps 1–5 of D2 verbatim: `openMessage(id)` → reconstruct the v2 (or v1-if-`createdAt`) context from `ownPublicKey = exportPublicKey(identity)` + the response → `open(base64ToBytes(ciphertext) as Ciphertext, identity, context)` → `decodePayload`. Derive `recipientFingerprint` locally from `ownPublicKey`. **Do not** trust any server fingerprint (the server returns none). Keep it a single-key open (no rotation fallback — D2). Split the POST from the decrypt only if a test needs it; otherwise a one-shot is fine (no background-lock coordinator on web — D-note in Task 8).
- [ ] **Step 2: Tests (load-bearing wire-interop)** — browser-mode:
  - **Round-trip (must-have).** In-test, `const rid = await generateIdentity(); const rpk = exportPublicKey(rid);`. Build a v2 context (`linkId`, `recipientPublicKey: rpk`, `expiresAtMs`, `maxOpens`, **no `createdAtMs`**), `seal(encodePayload({ text: "SP3-INTEROP", attachments: [] }), <RecipientPublicKey>, context)`. **Mock `openMessage`** to return `{ ciphertext: bytesToBase64(sealed), createdAt: null, expiresAt: new Date(expiresAtMs).toISOString(), opensCount: 1, maxOpens, status: "active" }`. Assert `openAndDecrypt(id, rid)` → `text === "SP3-INTEROP"`, `attachments.length === 0`, `recipientFingerprint === await fingerprint(rpk)`. This pins that a webapp/mobile v2-sealed blob opens under the exact reconstructed context.
  - **Wrong key → `DecryptionError`.** Open the same ciphertext with a *different* identity → rejects with a `DecryptionError` (name check).
  - **Exactly one POST.** Assert the `openMessage` mock was called **once**.
  - **Attachments survive.** Seal `encodePayload({ text: "hi", attachments: [{ filename: "a.txt", mimetype: "text/plain", bytes: new Uint8Array([1,2,3]) }] })` → `openAndDecrypt` returns `attachments.length === 1` with the bytes intact (used by the Task 7 notice; proves no crash).
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- reader/open-and-decrypt`; `typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): open+decrypt pipeline (mobile-identical v2 AAD reconstruction)`.

---

# PHASE 2 — Reader UI

## Task 5: Web privacy hooks — clipboard auto-clear + blur shield

**Files:** Create `apps/webapp/src/reader/use-clipboard-auto-clear.ts`, `apps/webapp/src/reader/use-privacy-shield.ts`, and their tests.

- [ ] **Step 1: `use-clipboard-auto-clear.ts`** (D6) — `useClipboardAutoClear(delayMs = 45_000)` exposing `copy(text): Promise<CopyResult>` where `CopyResult = "copied" | "copied-no-autoclear" | "failed"`. `copy`: `await navigator.clipboard.writeText(text)`; schedule a timeout that reads back `navigator.clipboard.readText()` and, **only if it still equals `text`**, writes `""` (verified clear — never clobber unrelated content). If `writeText` rejects → `"failed"`; if `readText` is unavailable/denied → resolve the copy as `"copied-no-autoclear"` and skip the blind clear (honest — D6). Clear the timer on unmount. Mirror the semantics of mobile `ReaderScreen.onCopy` (`getStringAsync` → compare → set `""`).
- [ ] **Step 2: `use-privacy-shield.ts`** (D6) — `usePrivacyShield(): { isObscured: boolean }`. Subscribe to `document` `visibilitychange` (obscured when `document.visibilityState === "hidden"`) and `window` `blur`/`focus`; clean up on unmount. Best-effort; SSR-safe (guard `typeof document`).
- [ ] **Step 3: Tests** — clipboard: `copy("x")` calls `writeText("x")`; advancing fake timers past `delayMs` triggers a `readText` that returns `"x"` → `writeText("")` is called; if `readText` returns `"other"` → **no** clear; if `readText` throws → **no** clear and result is `"copied-no-autoclear"`. Shield: dispatching a `visibilitychange` with `document.visibilityState` stubbed to `"hidden"` flips `isObscured` true; back to `"visible"` flips it false.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- reader/use-clipboard reader/use-privacy`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): clipboard auto-clear (verified) + visibilitychange blur shield`.

## Task 6: Landing, inline unlock, and the terminal screens

**Files:** Create `apps/webapp/src/screens/reader/ReaderLandingScreen.tsx`, `LinkUnavailableScreen.tsx`, `DecryptionFailedScreen.tsx`, `InvalidPayloadScreen.tsx`, `NetworkErrorScreen.tsx`, `NoIdentityScreen.tsx`; `apps/webapp/src/components/InlineUnlock.tsx`; test `apps/webapp/tests/screens/reader/ReaderLandingScreen.test.tsx`.

- [ ] **Step 1: `ReaderLandingScreen.tsx`** (`"use client"`, per `secure_link_aesmsg`, **zero network on mount**) — a `lock`/`encrypted` medallion, "Secure message" title, calm lead ("This link holds an end-to-end encrypted message. Decryption happens in your browser — only your device's private key can open it."), a **static** view-once caution (NOT metadata-driven — we have no metadata pre-open): "Some links can be opened only once. Opening now may use the only view." The link **id** rendered in `font-mono` (it is a public pointer). A single primary **"Open message"** button (`onOpen` prop). **No `fetch`, no effect that touches the network.**
- [ ] **Step 2: `InlineUnlock.tsx`** (D5) — a compact passphrase form (`PasswordField` + `PrimaryButton`) calling `useIdentity().unlock(passphrase)`; shows the `wrongPassphrase` flag as "That passphrase didn't work." (opaque); a spinner while Argon2id runs. On success the identity context flips to `unlocked` (the flow's effect continues the open — Task 8). No wipe/navigation here (keep the recipient in-context). Header copy: "Unlock to open this message."
- [ ] **Step 3: Terminal screens** — presentational, `onClose`/`onRetry` props, token-styled, calm copy from `copy.ts`:
  - `LinkUnavailableScreen` (per `link_expired_aesmsg`): `link_off` icon, `LINK_UNAVAILABLE_COPY` and **nothing more** (no reason list, no id, no status), a single "Done" that calls `onClose`.
  - `DecryptionFailedScreen` (per `decryption_failed_aesmsg`): `lock_reset` icon, `DECRYPTION_FAILED_COPY`, **no retry** (D4), a single non-consuming "Close". No target-fingerprint dump (mockup's is fictional and would leak nothing real — omit it).
  - `InvalidPayloadScreen`: `INVALID_PAYLOAD_TITLE` + `INVALID_PAYLOAD_BODY`, a "Close".
  - `NetworkErrorScreen`: `NETWORK_ERROR_TITLE` + `NETWORK_ERROR_HINT`, a **"Try again"** (`onRetry`) + "Close".
  - `NoIdentityScreen` (D5): calm explanation that **this browser has no identity yet**, so it cannot hold the private key this message was sealed to; primary "Create an identity" → `/onboarding`, secondary "Open in the app" (store/app link) + "Import a backup" note (import lands in SP5 — link to the app for now). No network.
- [ ] **Step 4: Test (`ReaderLandingScreen`)** — renders the id in a `font-mono` element and the "Open message" button; clicking it calls `onOpen`; **assert no `fetch` occurred on mount** (spy `window.fetch`); assert the static caution copy is present; no forbidden marketing copy.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/reader/ReaderLandingScreen`; `typecheck`.
- [ ] **Step 6: Commit** — `feat(webapp): reader landing (zero-network) + inline unlock + terminal screens`.

## Task 7: Secure reader screen (per `secure_reader_aesmsg`)

**Files:** Create `apps/webapp/src/screens/reader/SecureReaderScreen.tsx`, `apps/webapp/tests/screens/reader/SecureReaderScreen.test.tsx`.

- [ ] **Step 1: `SecureReaderScreen.tsx`** (`"use client"`) — props `{ text, attachments, onDone }`. Uses `usePrivacyShield` + `useClipboardAutoClear` (Task 5):
  - A green **"Decrypted on this device"** chip; the caution "Anyone who can see your screen can read this now." (mobile copy).
  - The plaintext `text` in a `bg-surface-container-lowest` block, `selectable`. **Body text, not `font-mono`** (per D9 — `font-mono` is for keys/links/fingerprints only; the mockup's mono-code panel is a no-op token here).
  - A **Copy** button → `copy(text)`; transient affordance reflecting the `CopyResult` ("Copied — clears in 45s" / "Copied" / "Couldn't copy"). 
  - **Attachments (D7):** if `attachments.length > 0`, an **amber info notice** with the count and "Saving attachments in the browser isn't supported yet — open it in the aesmsg app to download them." **No download control.** Never crash.
  - **Blur overlay:** when `isObscured`, render an opaque cover **instead of** the plaintext (early return, like mobile `if (isObscured) return <cover/>`), so the text is not in the painted DOM while hidden.
  - **Memory-only cleanup:** the component holds `text` only via props/state; nothing is written to storage/URL. A "Close and wipe" primary → `onDone` (the flow drops the decrypted output — Task 8).
- [ ] **Step 2: Tests** — text renders; **not** in a `font-mono` element. Copy: mock `navigator.clipboard.writeText`/`readText`; clicking Copy writes the exact `text`; advancing timers verifies the auto-clear (writes `""` only when read-back matches). Blur: dispatch `visibilitychange` hidden → the plaintext is **absent** from the DOM (cover shown); visible again → present. **Attachments:** render with a 1-item `attachments` array → the amber notice with the count is shown, the text still renders, **no throw**. No plaintext in `location.href`/`document.title`. No forbidden copy.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/reader/SecureReaderScreen`; `typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): secure reader — copy+auto-clear, blur shield, attachments-not-supported notice`.

## Task 8: Reader flow orchestrator + the static `/l` route

**Files:** Create `apps/webapp/src/screens/reader/ReaderFlowScreen.tsx`, `apps/webapp/app/l/page.tsx`; delete `apps/webapp/app/reader/page.tsx`; create `apps/webapp/tests/screens/reader/ReaderFlowScreen.test.tsx`.

- [ ] **Step 1: `ReaderFlowScreen.tsx`** (`"use client"`) — owns the state machine (D3/D4/D5). State: `{ kind: "entry" } | { kind: "no_identity" } | { kind: "unlock" } | { kind: "opening" } | { kind: "decrypted"; output } | { kind: "gone" } | { kind: "invalid" } | { kind: "network" } | { kind: "failed" }`.
  - **Id resolution:** on mount (browser only — guard `typeof window`), `readLinkId(location.pathname, location.search)` (falling back through `useSearchParams` within the `<Suspense>` boundary). `ok:false` → `{ kind: "invalid" }` with **zero network**. Else hold the `id` and render `entry` — **still zero network** (the landing has no metadata fetch).
  - **Open action** (`onOpen` from the landing): gate on `useIdentity().state` (D3):
    - `no_identity` → `{ kind: "no_identity" }` (no POST).
    - `locked` → `{ kind: "unlock" }`; an effect watches identity: when it flips to `unlocked` while `kind === "unlock"`, auto-continue to the POST.
    - `unlocked` → `runOpen()`.
  - **`runOpen()`** — set `{ kind: "opening" }`; **exactly-once guard** (a `useRef` in-flight flag + the button disabled once tapped) so a double-tap issues a single POST. Call `openAndDecrypt(id, identity)`; on success `{ kind: "decrypted", output }`; on error `setState({ kind: classifyReaderError(err) })` (`gone`/`invalid`/`network`/`failed`). **No module-level open-coordinator** (mobile's exists to survive a background-lock *unmount* during the biometric prompt; the web reader page persists across a `visibilitychange` blur — it is not unmounted — so a simple in-flight ref suffices; document this scoping choice in a code comment).
  - **Screen mapping:** `entry`→`ReaderLandingScreen`; `no_identity`→`NoIdentityScreen`; `unlock`→`InlineUnlock`; `opening`→a calm "Decrypting…" surface; `decrypted`→`SecureReaderScreen`; `gone`→`LinkUnavailableScreen`; `invalid`→`InvalidPayloadScreen`; `network`→`NetworkErrorScreen` (its `onRetry` re-runs `runOpen` — a fresh POST, since no open was consumed); `failed`→`DecryptionFailedScreen`. **Not** wrapped in `RequireUnlocked`, **not** in `AppShell` (D5). On leaving `decrypted` (Close/unmount), drop the `output` from state (memory-only — D6).
- [ ] **Step 2: `app/l/page.tsx`** — the static route (D1): `export default function ReaderPage()` returning `<Suspense><ReaderFlowScreen/></Suspense>` (Suspense required for `useSearchParams` under `output: 'export'`, mirroring `app/links/details/page.tsx`). **No `RequireUnlocked`, no `AppShell`.** Delete `app/reader/page.tsx`.
- [ ] **Step 3: Tests (`ReaderFlowScreen`) — the spec §10 load-bearing ones.** Browser-mode RTL, with a mounted `IdentityProvider`. Stub `location.pathname = "/l/<16-char id>"` (or pass `?id=`):
  - **ZERO NETWORK before user action (§10).** Instrument **all** exfil channels before render — replace `window.fetch`, `XMLHttpRequest.prototype.open`+`send`, `navigator.sendBeacon`, and `window.Image`/`EventSource` with spies. Mount the reader (unlocked identity). Assert **every spy has zero calls** after render and while the `entry` landing is shown — i.e. nothing fires until the "Open message" tap.
  - **Tap triggers exactly the expected sequence.** With an unlocked identity, mock `openMessage` to resolve a valid ciphertext; tap "Open message" → assert `openMessage` was called **exactly once** and **`getMessage` was never called** (no metadata GET — D2), then the secure reader renders.
  - **Full happy path (seal in-test → decrypt).** Generate a recipient identity, unlock it in the provider, `seal` a message to it with `@aesmsg/crypto`, mock `openMessage` to return that ciphertext (v2 shape, `createdAt: null`), tap Open → the plaintext is rendered in the secure reader.
  - **Locked → inline unlock → proceed.** With a *locked* identity, tap Open → the inline unlock renders and **no POST fired** (assert `openMessage` not yet called); unlock with the correct passphrase → the flow auto-continues and decrypts. (Guards D3 — no open burned before unlock.)
  - **no_identity.** With no stored identity, tap Open → `NoIdentityScreen`, `openMessage` **never** called.
  - **Error states** (unlocked identity, mock `openMessage` to reject): `ApiError(410)` → LinkUnavailable showing exactly `"This secure link is no longer available."` and no other server-derived text; `ApiError(400)` → InvalidPayload; a `NetworkError` → NetworkError with a working **Retry** that re-invokes `openMessage`; a `DecryptionError` (mock `open` to throw, or open with a wrong key) → DecryptionFailed with **no retry**. Bad id in the URL → InvalidPayload with **zero network**.
  - **Attachments present** → the secure reader shows the calm attachments notice, text renders, no crash (piggybacks on Task 7).
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/reader/ReaderFlowScreen`; `typecheck`; `pnpm --filter @aesmsg/webapp build` (confirm `out/l.html` is emitted and `out/reader.html` is gone).
- [ ] **Step 5: Commit** — `feat(webapp): reader flow at static /l — explicit-fetch gate, identity gate, terminal screens`.

---

# PHASE 3 — Bouncer integration (`apps/web`)

## Task 9: Bouncer "Open in browser" secondary action (100% static)

**Files:** Create `apps/web/src/bouncer/reader-link.ts`, `apps/web/tests/bouncer/reader-link.test.ts`; modify `apps/web/src/bouncer/BouncerScreen.tsx`, `apps/web/tests/bouncer/BouncerScreen.test.tsx`.

- [ ] **Step 1: `reader-link.ts`** (D8) — mirror the `app-store-links.ts` constant pattern:
  ```ts
  export const WEBAPP_ORIGIN = process.env.NEXT_PUBLIC_AESMSG_WEBAPP_ORIGIN ?? "https://app.aesmsg.com";
  // Reuse the bouncer's own LINK_ID_REGEX via isValidLinkId; null for a bad id (no misleading link).
  export function browserReaderUrl(id: string): string | null { … } // `${WEBAPP_ORIGIN}/l/${id}` or null
  ```
  Import `isValidLinkId` from `./deep-link` (already exported) rather than duplicating the regex.
- [ ] **Step 2: `BouncerScreen.tsx`** — add a **plain static `<a>`** "Open in browser" (secondary styling: `border border-outline-variant`, like the store buttons) when `browserReaderUrl(id)` is non-null, placed after the primary "Open in app" deep link. Keep everything else unchanged. **No new effect, no fetch, no state query** — the file's only side effect stays the existing best-effort `window.location.href = deepLink` for a valid id (custom scheme, no network). Add a short calm line so users understand the choice ("Prefer not to install? Open it in your browser instead — decryption still happens on your device.").
- [ ] **Step 3: Tests** —
  - `reader-link.test.ts`: `browserReaderUrl("abcdefghijkl0123") === "https://app.aesmsg.com/l/abcdefghijkl0123"`; `browserReaderUrl("nope") === null`.
  - `BouncerScreen.test.tsx` (extend): for a valid id, an "Open in browser" link with `href === https://app.aesmsg.com/l/<id>` renders (alongside the existing "Open in app"); for an invalid id it is **absent** (existing store-links + heading assertions stay). **ZERO-NETWORK test (§10):** before render, replace `window.fetch`, `XMLHttpRequest.prototype.open`+`send`, and `navigator.sendBeacon` with spies; render `BouncerScreen`; assert **zero** calls (the mount effect only touches `window.location.href`, never the network) and that the "Open in browser" href is present. This is the `apps/web` half of §10's both-origins guarantee.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/web test`; `pnpm --filter @aesmsg/web typecheck`; `pnpm --filter @aesmsg/web build`.
- [ ] **Step 5: Commit** — `feat(web): bouncer "Open in browser" static link to app.aesmsg.com/l/<id>`.

---

# PHASE 4 — Docs + final gate

## Task 10: Docs — AGENTS.md recipient section + deploy `/l/<id>` rewrite

**Files:** Modify `apps/webapp/AGENTS.md`, `docs/deploy.md`.

- [ ] **Step 1: `apps/webapp/AGENTS.md`** — add a "Recipient flow / reader" section: the reader lives at the **static `/l` route** and the host **rewrites `/l/<id>` → `l.html`** (client parses the id from `location.pathname`; `?id=` is the dev fallback; **no** `next.config` rewrites — unsupported under export); the landing is **zero-network** and a single "Open message" tap runs **one POST `/open`** (no metadata GET) then reconstructs the **v2 AAD** exactly like mobile (`createdAt: null` → omit `createdAtMs`); **expired/revoked/exhausted are indistinguishable** → `"This secure link is no longer available."` and nothing more; wrong key → DecryptionFailed, **no recovery, no retry**; the reader is **not** `RequireUnlocked`-gated and **not** in `AppShell`; clipboard auto-clear is **verified-only** with honest permission/focus limits; blur-on-`visibilitychange`; **screenshot blocking is impossible on web (documented gap)**; **attachments are deferred to SP5** — the reader shows a calm notice and never crashes.
- [ ] **Step 2: `docs/deploy.md`** — in the `apps/webapp` section (SP1) add the **reader rewrite** block (D1 nginx snippet: `location = /l` and `location ~ "^/l/[A-Za-z0-9_-]{16}/?$"` both `try_files /l.html =404`), stated as required so `app.aesmsg.com/l/<id>` serves the reader shell. Note the **bouncer** on `aesmsg.com` now offers "Open in browser" → `app.aesmsg.com/l/<id>` (a plain static link; `NEXT_PUBLIC_AESMSG_WEBAPP_ORIGIN` overrides the default at build time). No new server env for `apps/webapp`; no `apps/api` change in SP3. Never mention Vercel.
- [ ] **Step 3: Verify** — `pnpm lint`; `git grep -nE "military-grade|unbreakable|impossible to hack" -- apps/webapp apps/web docs` → none; confirm no "Vercel".
- [ ] **Step 4: Commit** — `docs: webapp reader route + /l/<id> host rewrite; bouncer open-in-browser`.

## Task 11: Final verification gate (repo-root green) + invariant sweep

- [ ] **Step 1: Typecheck** — `pnpm typecheck` (all workspaces).
- [ ] **Step 2: Lint** — `pnpm lint`; if Biome flags new files, `pnpm lint:fix`, re-run, amend.
- [ ] **Step 3: Tests** — `pnpm test` green across all workspaces, incl. the webapp reader suites (**both-origins zero-network**, open-sequence, wire-interop round-trip, every error terminal, attachments-no-crash) and the `apps/web` bouncer zero-network + href tests.
- [ ] **Step 4: Static build + CSP** — `pnpm --filter @aesmsg/webapp build` (confirm `out/l.html` emitted, `out/reader.html` gone), then `pnpm --filter @aesmsg/webapp check:csp` → zero CSP violations (the reader adds no new script/connect origins beyond SP1's `connect-src` API origin). `pnpm --filter @aesmsg/web build`. `rm -rf apps/webapp/out apps/web/.next` after.
- [ ] **Step 5: Invariant sweep** —
  ```
  git grep -nE "military-grade|unbreakable|impossible to hack" -- apps/webapp apps/web   # none
  git grep -n "getMessage(" -- apps/webapp/src/reader                                     # none (reader POSTs /open only)
  git grep -n "app.aesmsg.com/l/" -- apps/web/src/bouncer                                 # present (open-in-browser)
  ```
  Manually confirm: the reader mounts with **zero** network; the open path builds the v2 context **without** `createdAtMs` when `createdAt === null`; expired/revoked both render the single `LINK_UNAVAILABLE_COPY`.
- [ ] **Step 6: Final commit** — `git add -A && git commit -m "chore(webapp): SP3 verification fixes" || echo "clean"`.

---

## Out of scope for SP3 (do NOT implement here)

Per spec §8/§9/§12:
- **Contacts + verification** (recipient-side "who sealed this" is intentionally *not shown* pre-decrypt; sender-side directory, paste/QR, fingerprint verification, key-changed alert) — **SP4**.
- **Key rotation fallback in the reader** (opening a link sealed to a retired key), **encrypted backup import** (the `NoIdentityScreen` links to the app rather than importing), **security settings** (the "native offers stronger delivery" copy, the per-decrypt gate equivalent), **attachment download in the reader**, **clipboard/blur settings toggles** — **SP5** (SP3 ships fixed defaults + the attachments notice).
- **Any `apps/api` change** — the `@fastify/cors` allowlist that makes `/open` reachable cross-origin **landed in SP2**; SP3 adds no route/store/cap change. **`@aesmsg/crypto` / `@aesmsg/server-store`** — frozen. **`apps/mobile`** — untouched.
- **aesmsg Pro / web billing, push, passkey/WebAuthn-PRF, cross-surface identity/key sync** — deferred.

---

## Self-review — spec coverage

- **§6.1 recipient flow, verbatim:** bouncer stays 100% static + gains "Open in browser" (Task 9, D8); reader renders static UI first (Task 6) and fetches **only on explicit tap** (Task 8, D2); password prompt → local unwrap → HPKE open → secure reader (Tasks 6–8, D3); reader parity honestly scoped — clipboard auto-clear, blur, no-plaintext-in-URL/history/storage, **screenshot blocking impossible (documented gap)** (Tasks 5/7, D6); error states first-class incl. the indistinguishable expired/revoked/exhausted (Tasks 3/6/8, D4).
- **§10 zero-network-before-action on BOTH origins:** `apps/web` bouncer (Task 9) + `apps/webapp` reader (Task 8) each instrument `fetch`/XHR/`sendBeacon` and assert zero calls before the user acts.
- **Routing decision resolved (not left open):** static `/l` + host rewrite `/l/<id>`→`l.html`, `?id=` dev fallback, nginx documented, `next dev` works, no export-incompatible `rewrites()` (D1, verified against the Next 16 static-export doc).
- **Interop pinned to mobile:** one POST `/open`, v2 AAD reconstruction, wire-interop round-trip test (Tasks 1/4, D2).
- **Error mapping pinned exactly as mobile** incl. the single intentional `InvalidFormatError`→InvalidPayload divergence (Task 3, D4); no invented already-opened state.
- **Identity gating flow pinned** (`no_identity`→explain / `locked`→inline unlock / `unlocked`→decrypt; unlock *before* the open POST) (D3/D5).
- **Attachments-now decision:** calm notice + count, never crash (Task 7, D7).
- **Copy/color semantics; error screens match the shipped mobile terminal voice** (D9, throughout).
- **Repo-root green gate:** `pnpm typecheck && pnpm lint && pnpm test` (Task 11).
