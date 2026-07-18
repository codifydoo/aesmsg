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

## Tests

Tests run under Vitest **browser mode** (Chromium headless via Playwright) — see `vitest.config.ts`. `tests/setup.ts` wires `@testing-library/jest-dom` and runs `cleanup()` after each case. Browser mode is what lets IndexedDB + WebCrypto + hash-wasm Argon2id run against a real browser.
