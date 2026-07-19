<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What `apps/webapp` is

`apps/webapp` (`@aesmsg/webapp`) is the **messaging web client** served at `https://app.aesmsg.com`. Unlike `apps/web` (a presentational marketing/bouncer site), this app carries the real sender/recipient/identity flows — but it is still a **fully static export** (`output: 'export'`): **no API routes, no server runtime, and no SSR that ever touches key material.** It builds to static files served from a static host.

- **All crypto lives in `@aesmsg/crypto`** (HPKE + hash-wasm Argon2id) — consumed verbatim, never modified here.
- **Keys are wrapped-at-rest in IndexedDB and unwrapped in memory only.** The private key is only ever persisted as an Argon2id-wrapped blob; the unwrapped keypair lives in React/module memory for the session and is dropped on lock/wipe. Never write the unwrapped key anywhere; no service-worker/cache persistence of key material.
- **No third-party scripts, no analytics, no remote fonts.** `next/font` self-hosts Geist/Inter/JetBrains under `/_next`; the built Material Symbols subset (`material-symbols-outlined.woff2`) is vendored under `public/fonts/`, and its source + regeneration tooling live in `fonts-src/` (outside `public/` so they are never copied into `out/`). Nothing is fetched from Google at runtime.

## CSP — hash-pinned, delivered two ways

A static export has no server runtime, so `next.config` `headers()` is inert and there is no nonce pipeline. The policy is therefore delivered:

1. **Per-page `<meta http-equiv="Content-Security-Policy">`** injected into every `out/**/*.html` by `scripts/inject-csp.mjs` after `next build` (wired into the `build` script). That step sha256-hashes each page's inline hydration/RSC-flight scripts so `script-src` stays strict: `'self' 'wasm-unsafe-eval'` + per-page hashes, **no `'unsafe-inline'`**. `'wasm-unsafe-eval'` is required because `@aesmsg/crypto` runs Argon2id via WebAssembly.
2. **The authoritative nginx/Sproobo response header** (`docs/deploy.md`) adds `frame-ancestors 'none'` (which `<meta>` cannot express) plus the classic hardening headers. The header must NOT duplicate `default-src 'none'`/the resource directives — because multiple CSPs combine via AND, a header carrying `default-src 'none'` without the per-page script hashes would block the very hydration scripts the meta permits. The meta is the single source of truth for resource directives.

`style-src` keeps a bounded `'unsafe-inline'` because `@aesmsg/ui`'s `MaterialIcon` / `Logo` (and Next's font CSS) use inline `style` attributes, which CSP hashes cannot cover without `'unsafe-hashes'`. This is a style-only relaxation and never applies to scripts.

`inject-csp.mjs` verifies each written page from disk (re-extracts every inline script, recomputes hashes, asserts meta coverage + that the meta precedes the first `<script>`). For a *behavioral* check, `scripts/verify-csp.mjs` (script: `pnpm --filter @aesmsg/webapp check:csp`) serves `out/` on localhost, loads every exported page in headless Chromium, and fails on any `securitypolicyviolation` event or uncaught page error. It is **not** part of `pnpm test` because it needs a prior `pnpm --filter @aesmsg/webapp build`; run the build first, then `check:csp`.

## Import extension convention

Static `import` statements use **no extension** for relative paths and `@/` aliases — write `from "./Foo"` and `from "@/src/…"`, not `from "./Foo.js"`. Turbopack's path-alias resolver does not map `.js` to `.ts`/`.tsx`; Vitest, `tsc`, and Biome accept either form, but the dev-server bundler is the strict one. The same convention applies to `packages/*/src/`.

## Design tokens

Never hardcode colors or spacing. Colors come from `@aesmsg/design-tokens` utilities (`bg-surface-container`, `text-on-surface`, `text-primary`, `border-outline-variant`, `text-error`, `text-success`, `text-warning`). Fonts: `font-sans` (Inter), `font-display` (Geist), and **`font-mono` (JetBrains Mono) ONLY for fingerprints / public keys / secure links**. Sizes: `text-display|h1|h2|body-lg|body-md|label-sm|mono-code`. Spacing is numeric Tailwind (`px-6 py-4`), not named. Copy stays calm and SaaS-toned; never write "unbreakable", "military-grade", or "impossible to hack".

## Sender flow + sent links

The sender pipeline (`src/create/create-and-seal.ts`) is a **byte-for-byte port of the mobile seal sequence** (`apps/mobile/src/create/create-and-seal.ts`) — this ordering is interop-critical and must not be reshuffled: `importPublicKey → fingerprint (local display only, never uploaded) → generateLinkId → MessageBindingContext with createdAtMs OMITTED (selects AAD **v2**) → encodePayload({ text, attachments: [] }) → seal → POST /api/messages → recordSentLink (best-effort)`. Omitting `createdAtMs` is mandatory: new server links store no `createdAt`, so a recipient rebuilds the **v2** AAD without it; sealing a v1 AAD would silently fail to open. Only `{ id, ciphertext(base64), expiresAt, maxOpens }` leaves the browser — **never** plaintext. The one expiry `Date` feeds both the sealed `expiresAtMs` and the uploaded `expiresAt`. SP2 is **text-only** (attachments land in SP5); the empty-`attachments` envelope is byte-identical to a mobile text-only message.

The shareable link is the **server-returned `url`** — `aesmsg.com/l/<id>` (the static bouncer host), **not** `app.aesmsg.com`. Render links/keys/fingerprints in `font-mono` only.

The **`sent-links` IndexedDB store** (`src/links/sent-links-store.ts`, DB schema v2) holds **metadata only** — `id`, recipient fingerprint, created/expiry, max-opens, an optional local-only `label`, the secret `revocationToken`, and `schemaVersion`. **Never** plaintext, ciphertext, or recipient key material. **Honest at-rest caveat:** unlike mobile (which seals this blob under a device DEK), the webapp's IndexedDB is **not encrypted at rest**, so the `revocationToken` lives in cleartext. That is an **availability** exposure only (someone with local browser-profile access could revoke your links) — **not** a confidentiality break: the token decrypts nothing, and nothing here reaches the server except through the existing endpoints, so the zero-knowledge *backend* invariant is intact. A future hardening (wrapping the sent-links blob under the identity key) is noted, not built.

## Recipient flow / reader

The recipient reader lives at the **static `/l` route** (`app/l/page.tsx` → `out/l.html`) — there is **no** dynamic `/l/[id]` segment (it can't build under `output: 'export'`). The static host **rewrites `/l/<id>` → `l.html`** without changing the URL (see `docs/deploy.md`); the client parses the id from `location.pathname` (`readLinkId`, `src/reader/reader-id.ts`), with a `/l?id=<id>` `useSearchParams` fallback for `next dev`. **No `next.config` rewrites** — unsupported under export. The page wraps the flow in `<Suspense>` (required around `useSearchParams` under static export).

**Zero-network-before-action is the core invariant.** The landing (`ReaderLandingScreen`) fetches **nothing** on mount — a link-preview bot that GETs `/l/<id>` sees only the static shell. A single **"Open message"** tap runs **exactly one `POST /api/messages/:id/open`** (`openMessage` in `src/api/client.ts`); there is **NO metadata GET** (`MessageMetadata` stays declared-but-unwired). `open-and-decrypt.ts` then rebuilds the **v2 AAD exactly like mobile** (`apps/mobile/src/reader/fetch-and-open.ts`): `createdAt: null` → **omit `createdAtMs`**; a legacy `createdAt` string → bind it. This AAD reconstruction is **interop-critical** — it must stay byte-identical to the seal, or a webapp/mobile message won't open.

**Identity gate is BEFORE the open POST** (`ReaderFlowScreen`, `src/screens/reader/`): a POST consumes the only view of a view-once link, so the tap gates on identity first — `no_identity` → a calm explanation (no POST), `locked` → **inline unlock** in-context (`src/components/InlineUnlock.tsx`, not a redirect to `/unlock`), `unlocked` → the POST. The reader is **not** `RequireUnlocked`-gated and **not** inside `AppShell` (a recipient may have no identity at all).

**Opaque terminals** (`reader-error.ts` + `copy.ts`, mirroring mobile): `410`/`404` are **indistinguishable** → `"This secure link is no longer available."` and nothing more (never reveal revoked vs expired vs exhausted; there is **no** already-opened screen). `400` and a malformed envelope → InvalidPayload. `429`/`5xx`/transport → NetworkError (retryable — **no open was consumed**). A wrong key → **DecryptionFailed, no recovery, no retry** (a retry would only burn another open).

**Web-honest secure-reader mechanics** (`SecureReaderScreen` + `src/reader/use-*.ts`): decrypted plaintext is **memory-only** (never URL/history/storage/cache; dropped on close/unmount). Clipboard auto-clear is **verified-only** — it reads back and clears only if the clipboard still holds our text; when `readText` is unavailable/denied it does **not** blind-clear and says so ("Copied", not "clears in 45s"). Blur-on-`visibilitychange` paints an opaque cover instead of the plaintext. **Screenshot blocking is IMPOSSIBLE on the web platform** — a documented gap, not attempted, not implied (native offers stronger delivery guarantees). **Attachments are deferred to SP5**: the reader renders the text and shows a calm amber notice with the count ("Saving attachments in the browser isn't supported yet — open it in the aesmsg app"), never a download control, and never crashes.

## Tests

Tests run under Vitest **browser mode** (Chromium headless via Playwright) — see `vitest.config.ts`. `tests/setup.ts` wires `@testing-library/jest-dom` and runs `cleanup()` after each case. Browser mode is what lets IndexedDB + WebCrypto + hash-wasm Argon2id run against a real browser.
