# Sub-project 1 — Web client foundation + identity (`apps/webapp`) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/webapp` — a new, **fully static** (`output: 'export'`) Next.js 16 workspace served at `https://app.aesmsg.com` — and land the identity foundation: generate an X25519 keypair in the browser via `@aesmsg/crypto`, Argon2id-wrap the private key under a user passphrase at onboarding, persist **only the wrapped blob** in IndexedDB, keep the unwrapped key in memory for the session, and render the onboarding (set-passphrase), unlock, and identity screens. After this sub-project a fresh visitor can create → lock → unlock → wipe a standalone web identity and read its `AM-` fingerprint + public key. No sender/recipient/contacts flows yet.

**Architecture:** Three concentric layers, matching the pattern the old browser MVP and the mobile foundation used. Innermost: a minimal typed **IndexedDB store** local to `apps/webapp` (`@aesmsg/key-store` was deleted with the old MVP, so we rebuild a small equivalent in-app) that reads/writes an opaque `WrappedKey` envelope and never unwraps. Middle: an **identity context** state machine (`loading | no_identity | locked | unlocked`) that owns keygen (`generateIdentity`), wrap (`wrapPrivateKey`), unwrap (`unwrapPrivateKey`), lock, and wipe, holding the unwrapped keypair in module/React memory only. Outermost: three presentational screens composed from `@aesmsg/design-tokens` utilities + `@aesmsg/ui` primitives, driven by that state machine. `@aesmsg/crypto` is consumed **verbatim** — it is already browser-ready (WebCrypto HPKE + noble fallback, hash-wasm Argon2id, no `node:` imports) and MUST NOT be modified.

**Tech Stack:** Next.js 16 (`16.2.6`, app router, TS strict, Tailwind 4, Turbopack) with **`output: 'export'`** (static, no server runtime, no API routes, no SSR touching key material); React 19; `@aesmsg/design-tokens` + `@aesmsg/ui` (workspace); `@aesmsg/crypto` (workspace, unchanged); native IndexedDB (no idb/dexie wrapper); Vitest 3 **browser mode** (headless Chromium via Playwright) mirroring `apps/web`; Biome 2 (repo-wide, no per-package config).

**Spec:** [`docs/superpowers/specs/2026-07-18-messaging-web-client-design.md`](../specs/2026-07-18-messaging-web-client-design.md) — this plan implements **item 1 of §9** ("Foundation + identity"), honoring §3 (static + strict CSP + no analytics), §5 (identity & key handling), and §11 (IndexedDB-eviction + Argon2id-latency risks).

---

## ⚠️ Pinned decisions — read before starting

These resolve the open questions the spec left to the sub-project plan. They **override** any conflicting habit from training-data Next.js.

### D1. Package name & ports

The workspace package is named **`@aesmsg/webapp`** (consistent with `@aesmsg/api` / `@aesmsg/worker` / `@aesmsg/mobile`; the bare `web` name is a rebrand carve-out we do not repeat). All commands use `pnpm --filter @aesmsg/webapp …`. Dev server runs on **port 3001** so it can run alongside `apps/web` (3000) and `apps/api` (4000).

### D2. `@aesmsg/crypto` is frozen

Do **not** edit anything under `packages/crypto/` (or `packages/server-store/`). The exact exported symbols this plan relies on (verified against `packages/crypto/src/index.ts` on 2026-07-18):

| Purpose | Symbol | Signature |
|---|---|---|
| Keygen | `generateIdentity` | `(): Promise<IdentityKeypair>` |
| Public key (sync, cached) | `exportPublicKey` | `(id: IdentityKeypair): PublicKeyString` |
| Fingerprint (`AM-` + 8×4 hex) | `fingerprint` | `(pk: PublicKeyString): Promise<Fingerprint>` |
| Fingerprint display groups | `truncateFingerprint` | `(fp: Fingerprint, groups: number): string` |
| Argon2id password-wrap | `wrapPrivateKey` | `(id: IdentityKeypair, passphrase: string, params?: WrapKdfParams): Promise<WrappedKey>` |
| Argon2id unwrap | `unwrapPrivateKey` | `(wrapped: WrappedKey, passphrase: string): Promise<IdentityKeypair>` |
| Envelope KDF params (no unwrap) | `readWrapKdfParams` | `(wrapped: WrappedKey): WrapKdfParams` |
| Default KDF cost (m=64 MiB, t=3, p=1) | `DEFAULT_WRAP_KDF_PARAMS` | `WrapKdfParams` |
| Wrong-passphrase error | `BadPassphraseError` | `extends DecryptionError` |
| Corrupt-envelope error | `InvalidFormatError` | `extends Error` |

Types re-exported: `IdentityKeypair`, `PublicKeyString`, `Fingerprint`, `WrappedKey` (a branded **`string`** — the JSON envelope), `WrapKdfParams`. `WrappedKey` is opaque JSON of the form `{"v":1,"kdf":"argon2id-aes256gcm","m_kib":65536,"t":3,"p":1,"salt":…,"iv":…,"ct":…,"pub":…}` — the raw private key is **only** inside the AES-256-GCM `ct` field. Onboarding wraps with `DEFAULT_WRAP_KDF_PARAMS` (the OWASP-interactive params that defend a low-entropy human passphrase — the web path MUST use them).

### D3. CSP for a fully static export — RESOLVED

`apps/web` ships its CSP via `next.config.ts` `headers()`. **That mechanism does not exist for `output: 'export'`** — a static export has no server runtime, so `headers()` is never applied (Next.js emits a build-time warning to this effect). We therefore deliver the policy two ways, both first-party and server-free, and we resolve the "no inline script" tension honestly:

1. **`<meta http-equiv="Content-Security-Policy">` baked into `apps/webapp/app/layout.tsx` `<head>`.** It travels inside every exported `.html`, so the policy holds even on a bare static host. (Directives ignored in `<meta>` — notably `frame-ancestors` — are carried by the header in step 2.)
2. **Authoritative HTTP response header at the Sproobo/nginx static host**, documented in `docs/deploy.md` (Task 11). It repeats the meta policy and **adds `frame-ancestors 'none'`** plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.

**`script-src` decision — `'self' 'unsafe-inline'` (documented tradeoff), NOT hashes.** Next.js 16's App-Router static export emits **first-party inline `<script>` tags**: the runtime bootstrap and the per-page `self.__next_f.push([…])` RSC flight-data scripts. A pure static export has **no nonce pipeline** (nonces require per-request server generation). Hash-pinning is impractical and effectively circular here: the flight-script bytes differ per page and per build, and the shared root layout renders the `<meta>` before any page's flight content is serialized, so a page cannot carry the hash of its own inline script. We therefore accept `'unsafe-inline'` in `script-src` as a **bounded, honest tradeoff** rather than a hole:

- The real web-tier threat (spec §3: "a compromised/coerced origin serves malicious JS") is **not** mitigated by `script-src` at all — it is mitigated by fully static hosting, **zero third-party/remote script origins**, immutable hash-named assets, and no analytics. `'unsafe-inline'` vs hashes does not change that, because the bundle is `'self'` either way.
- The app has **no untrusted-HTML injection surface**: no `dangerouslySetInnerHTML` of untrusted data, no server-reflected input, no user-generated HTML.
- Everything else stays strict: `default-src 'self'`; **no `'unsafe-eval'` in production** (dev-only, for Turbopack HMR, exactly as `apps/web` does); `object-src 'none'`; `base-uri 'self'`; `connect-src 'self' <api-origin>`; `img-src 'self' data:`; `font-src 'self'`; `style-src 'self' 'unsafe-inline'`; `form-action 'self'`; `upgrade-insecure-requests`.

The `<api-origin>` in `connect-src` is `process.env.NEXT_PUBLIC_AESMSG_API_ORIGIN ?? "https://api.aesmsg.com"`, baked in at build. **SP1 itself issues zero network requests** (keygen + wrap + unwrap are all local); the API origin is pre-allowed so SP2 (sender flow) needs no CSP change. Task 3 **verifies** this decision empirically against the built `out/` HTML. A build-time hash-injection step is noted as a deferred hardening upgrade, not v1.

### D4. Import-extension & token conventions (from `apps/web/AGENTS.md` + `@aesmsg/design-tokens`)

- **No `.js` extension** on relative/`@/` static imports (`from "./foo"`, not `from "./foo.js"`). Turbopack's alias resolver is strict; Vitest/tsc/Biome accept either but the dev bundler does not.
- **Never hardcode colors or spacing.** Colors come from design-token utilities (`bg-surface-container`, `text-on-surface`, `text-primary`, `border-outline-variant`, `text-error`, `text-success`, `text-warning`). Fonts: `font-sans` (Inter), `font-display` (Geist), **`font-mono` (JetBrains Mono) ONLY for fingerprints / public keys / secure links**. Sizes: `text-display|h1|h2|body-lg|body-md|label-sm|mono-code`. Radii: `rounded-sm|default|md|lg|xl|full`.
- **Spacing is numeric Tailwind, not named.** Use `px-6 py-4` (1=4px … 6=24px, 12=48px, 20=80px). Named `--spacing-{xs..xl}` is deliberately absent (it would shadow Tailwind's `--container-*`). The mockups' `px-lg`/`font-body-md` classes are no-ops in this repo — translate them.
- **Copy rules (`CLAUDE.md`):** use "end-to-end encrypted", "zero-knowledge backend", "private keys stay on your device", "only the intended recipient can decrypt". **Never** "unbreakable", "military-grade", "impossible to hack". Calm SaaS tone; hide deep crypto behind expandable/secondary text.

### D5. Mockup fingerprint drift

`all_design_screens/my_identity_aesmsg/code.html` still shows a legacy `SM-…` fingerprint. The shipped crypto uses the **`AM-`** prefix (`packages/crypto/src/fingerprint.ts`). Render the **real** `AM-`-prefixed value from `fingerprint()`; do not hardcode the mockup's `SM-` string.

---

## File-structure target

After this plan completes:

```
apps/webapp/                                   (NEW workspace — @aesmsg/webapp)
├─ package.json                                (Task 1)
├─ tsconfig.json                               (Task 1)
├─ next.config.ts                              (Task 1 — output: 'export')
├─ postcss.config.mjs                          (Task 1)
├─ next-env.d.ts                               (Task 1 — generated)
├─ vitest.config.ts                            (Task 2 — browser mode, mirrors apps/web)
├─ AGENTS.md + CLAUDE.md                        (Task 2 — @AGENTS.md re-export)
├─ app/
│  ├─ layout.tsx                               (Task 2 — fonts + CSP <meta>)
│  ├─ globals.css                              (Task 2 — tokens + ui @source + Material Symbols)
│  ├─ page.tsx                                 (Task 4 — home → identity gate)
│  ├─ onboarding/page.tsx                      (Task 8)
│  ├─ unlock/page.tsx                          (Task 9)
│  ├─ identity/page.tsx                        (Task 10)
│  └─ (placeholders) new/links/contacts/settings/page.tsx  (Task 4 — "coming in a later release" stubs)
├─ public/
│  └─ fonts/material-symbols-outlined.woff2    (Task 2 — vendored, copied from apps/web)
├─ src/
│  ├─ app-shell/
│  │  ├─ AppShell.tsx                          (Task 4 — nav per dashboard mockup)
│  │  └─ nav-items.ts                          (Task 4)
│  ├─ identity/
│  │  ├─ db.ts                                 (Task 5 — withDB open/upgrade + test helpers)
│  │  ├─ identity-store.ts                     (Task 5 — save/load/has/delete wrapped blob)
│  │  ├─ passphrase-strength.ts               (Task 6 — pure strength guidance)
│  │  ├─ identity-context.tsx                  (Task 7 — state machine)
│  │  └─ use-identity.ts                       (Task 7)
│  ├─ components/
│  │  ├─ PasswordField.tsx                     (Task 8)
│  │  ├─ PrimaryButton.tsx                     (Task 8)
│  │  └─ FingerprintBlock.tsx                  (Task 10 — mono, copy)
│  └─ screens/
│     ├─ SetPassphraseScreen.tsx               (Task 8)
│     ├─ UnlockScreen.tsx                      (Task 9)
│     └─ IdentityScreen.tsx                    (Task 10)
└─ tests/
   ├─ setup.ts                                 (Task 2 — jest-dom + cleanup, mirrors apps/web)
   ├─ identity/db.test.ts                      (Task 5)
   ├─ identity/identity-store.test.ts          (Task 5 — incl. "never stored unwrapped")
   ├─ identity/passphrase-strength.test.ts     (Task 6)
   ├─ identity/identity-context.test.tsx       (Task 7 — transitions + no-unwrapped-in-storage)
   ├─ screens/SetPassphraseScreen.test.tsx     (Task 8)
   ├─ screens/UnlockScreen.test.tsx            (Task 9 — incl. unlock-latency smoke)
   └─ screens/IdentityScreen.test.tsx          (Task 10)

docs/deploy.md                                 (Task 11 — fourth service section)
package.json (root)                            (Task 1 — dev:webapp script)
```

No new mockups are authored — `dashboard_aesmsg`, `my_identity_aesmsg`, `my_security_keys_aesmsg`, `set_passphrase_aesmsg`, `unlock_passphrase_aesmsg` already exist and are the visual source of truth.

---

# PHASE 1 — Scaffold `apps/webapp` (static export, CSP, tokens/ui)

Each task leaves the repo green. Verify per-workspace with `pnpm --filter @aesmsg/webapp …` until the final gate (Task 12).

## Task 1: Scaffold the `@aesmsg/webapp` package

**Files:**
- Create: `apps/webapp/package.json`
- Create: `apps/webapp/tsconfig.json`
- Create: `apps/webapp/next.config.ts`
- Create: `apps/webapp/postcss.config.mjs`
- Modify: `package.json` (root)

- [ ] **Step 1: Write `apps/webapp/package.json`** — mirror `apps/web/package.json` deps, rename to `@aesmsg/webapp`, add `@aesmsg/crypto`, dev on port 3001, add `build:export` shorthand.

```json
{
  "name": "@aesmsg/webapp",
  "version": "0.0.0",
  "private": true,
  "license": "Apache-2.0",
  "scripts": {
    "dev": "next dev --turbopack --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:coverage": "vitest run --config vitest.config.ts --coverage"
  },
  "dependencies": {
    "@aesmsg/crypto": "workspace:*",
    "@aesmsg/design-tokens": "workspace:*",
    "@aesmsg/ui": "workspace:*",
    "next": "16.2.6",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4.7.0",
    "@vitest/browser": "^3.2.4",
    "@vitest/coverage-v8": "^3.2.4",
    "playwright": "^1.59.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Write `apps/webapp/tsconfig.json`** — copy `apps/web/tsconfig.json` verbatim (Bundler resolution, `jsx: preserve`, `@/*` path alias, `next` plugin).

- [ ] **Step 3: Write `apps/webapp/next.config.ts`** — static export; **no `headers()`** (it is inert under `output: 'export'`; CSP lives in the layout meta + deploy header per D3).

```ts
import type { NextConfig } from "next";

// Fully static export: no server runtime, no API routes, no SSR touching key material.
// CSP is delivered via a <meta> tag in app/layout.tsx (see D3 in the plan) plus the
// authoritative nginx/Sproobo response header documented in docs/deploy.md — next.config
// headers() is NOT honored for output: 'export', so it is intentionally omitted here.
const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@aesmsg/ui"],
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 4: Write `apps/webapp/postcss.config.mjs`** — copy `apps/web/postcss.config.mjs` verbatim (`@tailwindcss/postcss`).

- [ ] **Step 5: Add a root `dev:webapp` script** to `package.json` (root) `"scripts"` (do NOT change the existing `dev` which points at `web`):

```json
    "dev:webapp": "pnpm --filter @aesmsg/webapp dev",
```

- [ ] **Step 6: Install** — `pnpm install`. Expected: `@aesmsg/webapp` is picked up by the `apps/*` workspace glob; `next@16.2.6`, React 19, and the workspace `@aesmsg/*` symlinks resolve. Next generates `apps/webapp/next-env.d.ts` on first build/typecheck.

- [ ] **Step 7: Commit**

```bash
git add apps/webapp/package.json apps/webapp/tsconfig.json apps/webapp/next.config.ts apps/webapp/postcss.config.mjs package.json pnpm-lock.yaml
git commit -m "chore(webapp): scaffold @aesmsg/webapp static-export Next.js workspace"
```

---

## Task 2: Root layout, global CSS (tokens + ui), strict CSP meta, Vitest wiring

**Files:**
- Create: `apps/webapp/app/globals.css`
- Create: `apps/webapp/app/layout.tsx`
- Create: `apps/webapp/vitest.config.ts`
- Create: `apps/webapp/tests/setup.ts`
- Create: `apps/webapp/AGENTS.md`, `apps/webapp/CLAUDE.md`
- Create: `apps/webapp/public/fonts/material-symbols-outlined.woff2` (copied)

- [ ] **Step 1: `apps/webapp/app/globals.css`** — import Tailwind, the design-token theme, register `@aesmsg/ui` as a Tailwind source, vendor Material Symbols. Copy the `@font-face` + `.material-symbols-outlined` block and the base `html, body` block from `apps/web/app/globals.css` (drop the `.landing-root` marketing block — not used here).

```css
@import "tailwindcss";
@import "@aesmsg/design-tokens/theme.css";

@source "../../../packages/ui/src/**/*.{ts,tsx}";

/* + html/body base rules and the Material Symbols @font-face/.material-symbols-outlined
   block, copied from apps/web/app/globals.css */
```

- [ ] **Step 2: Vendor the icon font** — copy the self-hosted subset so the app makes **no** request to Google (CSP `font-src 'self'`):

```bash
mkdir -p apps/webapp/public/fonts
cp apps/web/public/fonts/material-symbols-outlined.woff2 apps/webapp/public/fonts/
cp apps/web/public/fonts/README.md apps/webapp/public/fonts/
```

- [ ] **Step 3: `apps/webapp/app/layout.tsx`** — fonts via `next/font/google` (self-hosted under `/_next`, no runtime Google fetch), calm metadata, and the **CSP `<meta>`** per D3. Compute `script-src` with the dev relaxation exactly as `apps/web/next.config.ts` does.

```tsx
import type { Metadata } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-display", subsets: ["latin"] });
const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

const API_ORIGIN = process.env.NEXT_PUBLIC_AESMSG_API_ORIGIN ?? "https://api.aesmsg.com";

// See plan D3. 'unsafe-eval' is added ONLY under `next dev` (Turbopack HMR); production
// export never carries it. frame-ancestors is header-only (ignored in <meta>) — see docs/deploy.md.
const scriptSrc =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  scriptSrc,
  `connect-src 'self' ${API_ORIGIN}`,
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

export const metadata: Metadata = {
  title: "aesmsg",
  description:
    "End-to-end encrypted messaging in your browser. Your private keys stay on your device; the backend is zero-knowledge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: `apps/webapp/vitest.config.ts`** — copy `apps/web/vitest.config.ts` verbatim (React plugin, `@` alias, browser mode Chromium, `tests/setup.ts`). This is the pattern that lets IndexedDB + WebCrypto + hash-wasm run against a real browser.

- [ ] **Step 5: `apps/webapp/tests/setup.ts`** — copy `apps/web/tests/setup.ts` verbatim (`@testing-library/jest-dom/vitest` + `cleanup()` afterEach).

- [ ] **Step 6: `apps/webapp/AGENTS.md` + `apps/webapp/CLAUDE.md`** — `CLAUDE.md` contains only `@AGENTS.md`. `AGENTS.md` states: this is a **static-export** messaging web client (no API routes, no server runtime, no SSR touching key material); all crypto lives in `@aesmsg/crypto`; keys are wrapped-at-rest in IndexedDB and unwrapped in memory only; the no-`.js`-extension import rule applies; the CSP is delivered via the layout `<meta>` + the deploy header (D3). Include the Next.js-16 breaking-changes banner from `apps/web/AGENTS.md`.

- [ ] **Step 7: Verify typecheck + a placeholder test run.** Add a throwaway `apps/webapp/tests/smoke.test.ts` asserting `1 + 1 === 2`, then:

```
pnpm --filter @aesmsg/webapp typecheck   # clean (generates next-env.d.ts)
pnpm --filter @aesmsg/webapp test         # browser-mode Chromium boots; smoke passes
```

Delete `smoke.test.ts` before committing (real tests land Task 5+).

- [ ] **Step 8: Commit**

```bash
git add apps/webapp/app apps/webapp/vitest.config.ts apps/webapp/tests apps/webapp/public apps/webapp/AGENTS.md apps/webapp/CLAUDE.md
git commit -m "feat(webapp): root layout with strict CSP meta, design-tokens/ui wiring, browser-mode Vitest"
```

---

## Task 3: Prove the static export + CSP behavior (resolves D3 empirically)

No new source; this task **verifies** the D3 decision against real build output and records the result in the PR.

- [ ] **Step 1: Produce the static export**

```
pnpm --filter @aesmsg/webapp build
```

Expected: build succeeds and writes `apps/webapp/out/`. Confirm there is **no** warning about `headers()` being dropped (we deliberately did not declare `headers()`), and that `output: 'export'` produced fully static HTML (no `.next/server` runtime artifacts are required to serve `out/`).

- [ ] **Step 2: Confirm the CSP meta is present in every exported page**

```
grep -RIl 'http-equiv="Content-Security-Policy"' apps/webapp/out --include='*.html'
```

Expected: every exported `*.html` (`out/index.html`, `out/onboarding/index.html`, `out/unlock/index.html`, `out/identity/index.html`, and the Task-4 placeholders) contains the meta tag with `script-src 'self' 'unsafe-inline'` (**no `'unsafe-eval'`** in the production build) and `connect-src 'self' https://api.aesmsg.com`.

- [ ] **Step 3: Confirm the emitted inline scripts are first-party only**

```
grep -oE '<script[^>]*src="[^"]*"' apps/webapp/out/index.html
```

Expected: every `src` is a same-origin `/_next/...` path — **no third-party or remote origin**. The remaining inline `<script>` tags (the runtime bootstrap + `self.__next_f.push(...)` flight data) are Next's own first-party hydration scripts and are exactly what `'unsafe-inline'` accommodates per D3. Record in the PR description: "static export emits first-party inline hydration/flight scripts; strict CSP allows them via `script-src 'self' 'unsafe-inline'` (no nonce pipeline in a static export; hash-pinning impractical for per-page flight data). Hash-injection is a deferred hardening upgrade."

- [ ] **Step 4: Clean the build artifact** — add `out/` to `.gitignore` scope (Next already ignores `.next`; add `apps/webapp/out/` if not covered) and `rm -rf apps/webapp/out`.

- [ ] **Step 5: Commit** (only the `.gitignore` change, if any)

```bash
git add .gitignore
git commit -m "chore(webapp): ignore static export out/ dir" || echo "nothing to commit"
```

---

## Task 4: App shell + navigation with later-sub-project placeholders

Per `dashboard_aesmsg/code.html`: a left side-nav (Dashboard / New Message / Links / Contacts / Keys / Settings) collapsing to a top bar on mobile, wrapping the routed content. Only the identity ("Keys") destination is live in SP1; the rest render calm **placeholder** panels ("This lands in a later release") so the shell is navigable and green.

**Files:**
- Create: `apps/webapp/src/app-shell/nav-items.ts`
- Create: `apps/webapp/src/app-shell/AppShell.tsx`
- Create: `apps/webapp/app/page.tsx`
- Create: `apps/webapp/app/{new,links,contacts,settings}/page.tsx` (placeholders)

- [ ] **Step 1: `nav-items.ts`** — typed array `{ href, label, icon }` for the six destinations, `icon` being Material Symbol names from the mockup (`dashboard`, `add_box`, `link`, `group`, `vpn_key`, `settings`). `href: "/identity"` for Keys; the rest point at their placeholder routes.

- [ ] **Step 2: `AppShell.tsx`** — presentational shell composing `@aesmsg/ui`'s `Logo` (wordmark) + `MaterialIcon` and design-token utilities (`bg-surface`, `border-outline-variant`, `text-on-surface-variant`, active item `text-primary`). Numeric spacing only. Highlights the active route via `usePathname()`. No hardcoded colors/spacing.

- [ ] **Step 3: `app/page.tsx`** — the home route. It reads identity state (Task 7 context, wired here after Task 7 or with a temporary `no_identity` default) and **redirects**: `no_identity → /onboarding`, `locked → /unlock`, `unlocked → /identity`. In SP1, the home is an identity gate, not a dashboard. Wrap routed pages in `<AppShell>`.

- [ ] **Step 4: Placeholder routes** — `app/{new,links,contacts,settings}/page.tsx` each render a centered card: heading + "This part of the web client lands in a later release. For the full flow today, use the aesmsg app." Copy-compliant, no forbidden claims.

- [ ] **Step 5: Verify**

```
pnpm --filter @aesmsg/webapp typecheck
pnpm --filter @aesmsg/webapp build      # all routes export statically
```

- [ ] **Step 6: Commit**

```bash
git add apps/webapp/src/app-shell apps/webapp/app
git commit -m "feat(webapp): app shell + nav per dashboard mockup with placeholder routes"
```

---

# PHASE 2 — Identity: storage + crypto wiring

## Task 5: Minimal typed IndexedDB identity store (mirrors the old key-store)

`@aesmsg/key-store` was deleted with the old MVP; we rebuild a **minimal** equivalent inside `apps/webapp` (spec §4: "mirroring the client-store patterns the old MVP used"). It stores/loads an opaque `WrappedKey` envelope and **never unwraps** — memory lifetime of the unwrapped key is the caller's (Task 7) concern.

**Files:**
- Create: `apps/webapp/src/identity/db.ts`
- Create: `apps/webapp/src/identity/identity-store.ts`
- Create: `apps/webapp/tests/identity/db.test.ts`
- Create: `apps/webapp/tests/identity/identity-store.test.ts`

- [ ] **Step 1: `db.ts`** — a single `withDB(mode, fn)` helper (DB `aesmsg-webapp`, version 1, object store `identity`, `keyPath: "id"`) modeled on the old key-store's `db.ts`: lazy open, `onupgradeneeded` creates the store, rejects with a clear error if `indexedDB` is undefined, plus `__deleteDbForTests()` / `__resetDbForTests()` test helpers. Requires the `DOM` lib (already in the copied tsconfig).

- [ ] **Step 2: `identity-store.ts`** — a `StoredIdentity` record and CRUD:

```ts
import type { PublicKeyString, WrappedKey } from "@aesmsg/crypto";

export interface StoredIdentity {
  readonly id: "primary";            // single web identity in SP1
  readonly publicKeyString: PublicKeyString;
  readonly wrapped: WrappedKey;       // opaque JSON envelope — NEVER the raw private key
  readonly createdAt: string;         // ISO 8601 UTC
  readonly schemaVersion: 1;
}

// saveIdentity / loadIdentity / hasIdentity / deleteIdentity — each a thin withDB() call.
```

- [ ] **Step 3: `db.test.ts`** — open/upgrade round-trip; `has` false→true; delete clears; `__deleteDbForTests` resets between cases (`beforeEach`).

- [ ] **Step 4: `identity-store.test.ts`** — save→load equality; load-missing → `null`; save-twice replaces; delete removes. **Plus the load-bearing invariant test:**

```ts
it("persists ONLY the wrapped envelope — never the raw private key", async () => {
  const id = await generateIdentity();
  const wrapped = await wrapPrivateKey(id, "correct horse battery staple");
  await saveIdentity({
    id: "primary",
    publicKeyString: exportPublicKey(id),
    wrapped,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  });
  const raw = await loadIdentity("primary");
  // the only key-bearing field is `wrapped`, and it is the versioned Argon2id envelope
  const env = JSON.parse(raw!.wrapped);
  expect(env.v).toBe(1);
  expect(env.kdf).toBe("argon2id-aes256gcm");
  // no plaintext private-key field exists anywhere in the stored record
  expect(JSON.stringify(raw)).not.toContain('"privateKey"');
});
```

- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- identity/db identity/identity-store` (browser-mode; real IndexedDB + WebCrypto + Argon2id). `pnpm --filter @aesmsg/webapp typecheck`.

- [ ] **Step 6: Commit**

```bash
git add apps/webapp/src/identity/db.ts apps/webapp/src/identity/identity-store.ts apps/webapp/tests/identity/db.test.ts apps/webapp/tests/identity/identity-store.test.ts
git commit -m "feat(webapp): minimal IndexedDB identity store (wrapped-blob only, never unwrapped)"
```

---

## Task 6: Passphrase-strength guidance (pure helper)

Onboarding must give **clear strength guidance** (spec §5) — the wrap password defends a low-entropy human secret with `DEFAULT_WRAP_KDF_PARAMS`, and there is **no recovery**, so the UI nudges toward a strong passphrase without being a gatekeeper theatre.

**Files:**
- Create: `apps/webapp/src/identity/passphrase-strength.ts`
- Create: `apps/webapp/tests/identity/passphrase-strength.test.ts`

- [ ] **Step 1: `passphrase-strength.ts`** — a pure `assessPassphrase(pw: string): { score: 0|1|2|3|4; label: string; tips: string[]; acceptable: boolean }`. Simple, dependency-free heuristic (length buckets ≥12/≥16/≥20, character-class variety, obvious-sequence penalty). `acceptable` requires a minimum (≥12 chars) matching the mockup's "At least 12 characters" placeholder. No third-party strength library (keeps the CSP surface and bundle clean).

- [ ] **Step 2: `passphrase-strength.test.ts`** — short → not acceptable, low score + tips; long high-variety → high score, acceptable; empty → score 0; a common weak string scores low. Deterministic, no browser needed (still runs under the browser-mode config — fine).

- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- passphrase-strength`; `typecheck`.

- [ ] **Step 4: Commit**

```bash
git add apps/webapp/src/identity/passphrase-strength.ts apps/webapp/tests/identity/passphrase-strength.test.ts
git commit -m "feat(webapp): pure passphrase-strength guidance helper"
```

---

## Task 7: Identity context + state machine (keygen, wrap/unwrap, memory-only key)

The heart of the sub-project. A React context exposing `state: "loading" | "no_identity" | "locked" | "unlocked"` and actions `setupNew(passphrase)`, `unlock(passphrase)`, `lock()`, `wipe()`, plus a `requireUnlocked()` re-prompt gate for sensitive ops. The unwrapped `IdentityKeypair` lives in **React/module memory only** and is dropped on `lock()`, `wipe()`, and (best-effort) tab hide.

**Files:**
- Create: `apps/webapp/src/identity/identity-context.tsx`
- Create: `apps/webapp/src/identity/use-identity.ts`
- Create: `apps/webapp/tests/identity/identity-context.test.tsx`
- Modify: `apps/webapp/app/layout.tsx` (wrap children in `<IdentityProvider>`) and wire `app/page.tsx` (Task 4) to the real state.

- [ ] **Step 1: `identity-context.tsx`** — on mount, `loading` → `hasIdentity("primary")` ? `locked` : `no_identity`.
  - `setupNew(passphrase)`: `generateIdentity()` → `wrapPrivateKey(id, passphrase, DEFAULT_WRAP_KDF_PARAMS)` → `saveIdentity({ id:"primary", publicKeyString: exportPublicKey(id), wrapped, createdAt, schemaVersion:1 })` → hold `id` in memory → `unlocked`. Also request `navigator.storage.persist()` here (spec §11 IndexedDB-eviction mitigation) — best-effort, log-free, no throw on unsupported.
  - `unlock(passphrase)`: `loadIdentity("primary")` → `unwrapPrivateKey(record.wrapped, passphrase)`; on `BadPassphraseError` stay `locked` and surface a wrong-passphrase flag; on success hold in memory → `unlocked`.
  - `lock()`: drop the in-memory keypair → `locked`.
  - `wipe()`: `deleteIdentity("primary")` + drop memory → `no_identity` (irreversible; no recovery).
  - `requireUnlocked()`: if not `unlocked`, throw/redirect to `/unlock` so decrypt/export/rotate re-prompt (spec §5 "re-prompt before sensitive ops"). SP1 has no such ops yet, but the gate ships now for SP2+.
  - A `visibilitychange` listener that calls `lock()` when the document hides is **out of scope for SP1** as a hard requirement but include a TODO comment; the memory-only guarantee is the SP1 deliverable.
  - **Never** write the unwrapped key anywhere; the only persistence call is `saveIdentity` with the `wrapped` envelope.

- [ ] **Step 2: `use-identity.ts`** — `export function useIdentity()` re-exporting the context hook (throws if used outside the provider).

- [ ] **Step 3: Wrap the app** — in `app/layout.tsx`, wrap `{children}` in `<IdentityProvider>` (a client component boundary). Wire `app/page.tsx` to redirect by `state` per Task 4 Step 3.

- [ ] **Step 4: `identity-context.test.tsx`** — render the provider with a test consumer:
  - fresh DB → resolves to `no_identity`.
  - `setupNew("correct horse battery staple")` → `unlocked`, and `hasIdentity("primary")` is now true.
  - reload (new provider instance, same DB) → `locked`.
  - `unlock("wrong")` → stays `locked`, wrong-passphrase flag set, no throw leaks to UI.
  - `unlock("correct horse battery staple")` → `unlocked`.
  - `wipe()` → `no_identity`, `hasIdentity` false.
  - **Invariant test — no unwrapped key in storage:** after `setupNew`, dump the raw IndexedDB record and assert it is exactly the `wrapped` envelope (`env.kdf === "argon2id-aes256gcm"`) and that serializing the whole record contains **neither** the raw private-key bytes nor a `CryptoKey` — the unwrapped keypair exists only in the context value.

- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- identity/identity-context`; `typecheck`.

- [ ] **Step 6: Commit**

```bash
git add apps/webapp/src/identity/identity-context.tsx apps/webapp/src/identity/use-identity.ts apps/webapp/tests/identity/identity-context.test.tsx apps/webapp/app/layout.tsx apps/webapp/app/page.tsx
git commit -m "feat(webapp): identity state machine — keygen/wrap/unlock, memory-only private key, storage.persist()"
```

---

# PHASE 3 — Identity screens

Screens compose design-token utilities + `@aesmsg/ui` (`MaterialIcon`, `Logo`) + a few local presentational components. No hardcoded colors/spacing. Copy is calm and rule-compliant.

## Task 8: Onboarding — set passphrase (per `set_passphrase_aesmsg`)

**Files:**
- Create: `apps/webapp/src/components/PasswordField.tsx`
- Create: `apps/webapp/src/components/PrimaryButton.tsx`
- Create: `apps/webapp/src/screens/SetPassphraseScreen.tsx`
- Create: `apps/webapp/app/onboarding/page.tsx`
- Create: `apps/webapp/tests/screens/SetPassphraseScreen.test.tsx`

- [ ] **Step 1: `PasswordField.tsx` + `PrimaryButton.tsx`** — small local presentational primitives (label + `type=password` input with error slot; gradient primary button with `loading`/`disabled`) built from design-token classes, mirroring the `set_passphrase` mockup's field/button markup translated to numeric spacing. (Kept local, not pushed into shared `@aesmsg/ui`, to avoid touching a shared package in SP1.)

- [ ] **Step 2: `SetPassphraseScreen.tsx`** — two-input passphrase + confirm form (mockup), live strength meter from `assessPassphrase` (Task 6), inline validation (mismatch / below-minimum), and the **no-recovery** info card: heading "Argon2id memory-hard derivation" / body "Forgotten passphrase = unrecoverable. No fallback by design." On submit → `useIdentity().setupNew(passphrase)` then route to `/identity`. Client component. Uses only compliant copy (e.g. "Your private key is wrapped on your device — we never see it").

- [ ] **Step 3: `app/onboarding/page.tsx`** — renders `<SetPassphraseScreen/>` inside `<AppShell/>`.

- [ ] **Step 4: `SetPassphraseScreen.test.tsx`** (browser-mode RTL): renders both inputs + info card; below-minimum passphrase disables submit and shows guidance; mismatch shows an error; a strong matching passphrase enables submit and, on click, calls through to `setupNew` (assert via a mounted provider that `state` becomes `unlocked` / `hasIdentity` true). Verify the no-recovery copy is present.

- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- SetPassphraseScreen`; `typecheck`; `pnpm --filter @aesmsg/webapp build`.

- [ ] **Step 6: Commit**

```bash
git add apps/webapp/src/components apps/webapp/src/screens/SetPassphraseScreen.tsx apps/webapp/app/onboarding apps/webapp/tests/screens/SetPassphraseScreen.test.tsx
git commit -m "feat(webapp): onboarding set-passphrase screen with strength guidance + no-recovery messaging"
```

---

## Task 9: Unlock screen (per `unlock_passphrase_aesmsg`) + Argon2id latency check

**Files:**
- Create: `apps/webapp/src/screens/UnlockScreen.tsx`
- Create: `apps/webapp/app/unlock/page.tsx`
- Create: `apps/webapp/tests/screens/UnlockScreen.test.tsx`

- [ ] **Step 1: `UnlockScreen.tsx`** — single passphrase input + "Unlock" button (mockup), wrong-passphrase error state, and a destructive **"Wipe and start over"** secondary action (routes to a confirm — the full wipe-confirm modal from `wipe_identity_confirm_aesmsg` can be a simple confirm in SP1; the destructive route calls `useIdentity().wipe()`). On submit → `unlock(passphrase)`; show a spinner while Argon2id runs (it is intentionally slow); on `BadPassphraseError` show "That passphrase didn't work." (opaque, no lockout theatre). Client component.

- [ ] **Step 2: `app/unlock/page.tsx`** — renders `<UnlockScreen/>` in `<AppShell/>`.

- [ ] **Step 3: `UnlockScreen.test.tsx`** (browser-mode): with a stored identity, wrong passphrase → error, stays `locked`; correct passphrase → `unlocked`. **Latency smoke (spec §11 risk):** create an identity, then time `unlock(correct)` end-to-end (real hash-wasm WASM Argon2id at m=64 MiB in Chromium) and assert it resolves under a generous ceiling (e.g. `< 3000 ms`) — this is a regression guard that the default KDF params are not accidentally punishing on the web path. Add a code comment that true low-end-device latency must be spot-checked manually (documented, not asserted in CI).

- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- UnlockScreen`; `typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/webapp/src/screens/UnlockScreen.tsx apps/webapp/app/unlock apps/webapp/tests/screens/UnlockScreen.test.tsx
git commit -m "feat(webapp): unlock screen with wrong-passphrase state + Argon2id latency smoke"
```

---

## Task 10: Identity screen (per `my_identity_aesmsg` / `my_security_keys_aesmsg`)

**Files:**
- Create: `apps/webapp/src/components/FingerprintBlock.tsx`
- Create: `apps/webapp/src/screens/IdentityScreen.tsx`
- Create: `apps/webapp/app/identity/page.tsx`
- Create: `apps/webapp/tests/screens/IdentityScreen.test.tsx`

- [ ] **Step 1: `FingerprintBlock.tsx`** — renders a `Fingerprint` in **`font-mono`** on a `bg-surface-container-lowest` block with a copy button (mockup "Public Fingerprint" card). `font-mono` is used **only** here (fingerprint) — never for general UI. Copy writes the full canonical fingerprint to the clipboard.

- [ ] **Step 2: `IdentityScreen.tsx`** — "Digital Identity" header + subcopy ("Share this public key so others can encrypt messages only your device can decrypt."). Derives the **real `AM-` fingerprint** via `await fingerprint(exportPublicKey(id))` (D5 — ignore the mockup's stale `SM-` string) and shows it in `<FingerprintBlock/>`; renders the public-key string (`exportPublicKey`) in `font-mono` with a copy affordance; an info card "Your private key never leaves this device. Only the public key above is visible to others." A **Lock** action (`lock()`), and a **Danger Zone** with **Wipe** (from `my_security_keys` — routes through a confirm to `wipe()`, red/destructive semantics only). If `state !== "unlocked"`, redirect to the gate. (QR display is deferred to SP4 contacts/verification; SP1 shows the string + fingerprint only.) Client component.

- [ ] **Step 3: `app/identity/page.tsx`** — renders `<IdentityScreen/>` in `<AppShell/>`.

- [ ] **Step 4: `IdentityScreen.test.tsx`** (browser-mode): set up + unlock an identity, render the screen; assert the displayed fingerprint matches `await fingerprint(exportPublicKey(id))` and starts with `AM-`; assert it renders in a `font-mono` element; clicking copy writes the full fingerprint (mock `navigator.clipboard.writeText`); the public-key string is shown; `wipe` transitions to `no_identity`.

- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- IdentityScreen`; `typecheck`; `pnpm --filter @aesmsg/webapp build`.

- [ ] **Step 6: Commit**

```bash
git add apps/webapp/src/components/FingerprintBlock.tsx apps/webapp/src/screens/IdentityScreen.tsx apps/webapp/app/identity apps/webapp/tests/screens/IdentityScreen.test.tsx
git commit -m "feat(webapp): identity screen — AM- fingerprint (mono) + public key display/copy + wipe"
```

---

# PHASE 4 — Deploy docs + final gate

## Task 11: `docs/deploy.md` — fourth service section for `app.aesmsg.com`

Docs only — **no actual deployment**. Never mention Vercel.

**Files:**
- Modify: `docs/deploy.md`

- [ ] **Step 1: Update "The three deployables"** — retitle to **four** deployables and add an `apps/webapp` row: "Static **Next.js 16** messaging web client (`output: 'export'`) served at `https://app.aesmsg.com`. Full sender/recipient identity flows run **client-side**; all crypto is `@aesmsg/crypto`. Depends on: nothing (serves static output; talks only to `api.aesmsg.com` from the browser)."

- [ ] **Step 2: Add a `## apps/webapp — static messaging web client (app.aesmsg.com)` section** covering:
  - **Build/serve:** `pnpm --filter @aesmsg/webapp build` produces `apps/webapp/out/`; serve that directory as static files on Sproobo (static hosting), no Node runtime. `NEXT_PUBLIC_AESMSG_API_ORIGIN` is a **build-time** var (default `https://api.aesmsg.com`); set it if the API origin differs.
  - **The authoritative CSP + security response header** the static host (nginx) MUST send, matching the layout `<meta>` and **adding `frame-ancestors 'none'`** (ignored in meta): the full `Content-Security-Policy` string from D3 plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. Note there is no `'unsafe-eval'` in the production policy, and no third-party or remote origins beyond `connect-src` = `api.aesmsg.com`. State plainly that the header is authoritative and the meta is a defense-in-depth fallback.
  - **Backend coupling:** the only backend dependency is the CORS allowlist on `apps/api` (`AESMSG_WEBAPP_ORIGIN=https://app.aesmsg.com`) — **landed in SP2, not here**; note it as a forward reference so this section is complete.
  - **No env, DB, Redis, or salt** for `apps/webapp` itself.

- [ ] **Step 3: Update the "Build / release / start order" table** to include the webapp static build.

- [ ] **Step 4: Verify** — `pnpm lint` (Biome checks Markdown). Confirm no "Vercel" and no forbidden marketing claims.

- [ ] **Step 5: Commit**

```bash
git add docs/deploy.md
git commit -m "docs(deploy): add app.aesmsg.com static webapp service section + authoritative CSP header"
```

---

## Task 12: Final verification gate (repo-root green)

- [ ] **Step 1: Whole-workspace typecheck** — `pnpm typecheck`. Expected: PASS across all workspaces incl. `@aesmsg/webapp`.
- [ ] **Step 2: Lint** — `pnpm lint`. If Biome flags formatting/import order in new files, `pnpm lint:fix`, re-run, amend the relevant commit.
- [ ] **Step 3: Full test suite** — `pnpm test`. Expected: PASS incl. the new `@aesmsg/webapp` browser-mode suites (db, identity-store incl. "never unwrapped", passphrase-strength, identity-context incl. no-unwrapped-in-storage + transitions, the three screens incl. unlock-latency smoke).
- [ ] **Step 4: Static build** — `pnpm --filter @aesmsg/webapp build`. Expected: `out/` produced, all identity + placeholder routes exported statically. `rm -rf apps/webapp/out` after.
- [ ] **Step 5: Invariant sweep** — confirm no unwrapped key is ever persisted and no forbidden copy shipped:

```
git grep -nE "military-grade|unbreakable|impossible to hack" -- apps/webapp   # expect: no matches
git grep -nE "privateKey|rawPriv" -- apps/webapp/src/identity/identity-store.ts # expect: no matches (store handles only `wrapped`)
```

- [ ] **Step 6: Final commit** — `git add -A && git commit -m "chore(webapp): final SP1 verification fixes" || echo "clean"`.

---

## Out of scope for SP1 (do NOT implement here)

Per spec §8/§9/§12 — these belong to later sub-projects or are deferred:

- **Sender flow** (compose/seal, link created, links list/details, revoke) — SP2. Also the `apps/api` `@fastify/cors` change — SP2.
- **Recipient flow** (webapp reader, explicit-fetch gate, error states, `aesmsg.com` bouncer "Open in browser") — SP3.
- **Contacts + verification** (directory, paste-key, QR display/scan, fingerprint verification, key-changed alert) — SP4.
- **Key rotation, encrypted backup export/import, security settings, attachments polish** — SP5.
- **aesmsg Pro / web billing**, **push notifications**, **passkey/WebAuthn-PRF unlock**, **cross-surface (mobile ⇄ web) identity/key sync** — deferred.
- **Any change to `packages/crypto` or `packages/server-store`** (wire format, schema, migrations) — forbidden; both are frozen for this sub-project. Any change to `apps/mobile` — untouched.
- QR **display** of the web identity's own key on the identity screen — deferred to SP4 (SP1 shows the public-key string + fingerprint only).

---

## Self-review — spec coverage

- **Scaffold, static export, no server/SSR/API routes** — Task 1 (`output: 'export'`), Task 3 (verified against `out/`). Spec §3/§4.
- **Strict CSP** (no third-party/remote script origins beyond the API origin, no analytics, no inline-script hole beyond Next's own first-party hydration) — Tasks 1–3 + D3; authoritative header in Task 11. Spec §3.
- **`@aesmsg/design-tokens` + `@aesmsg/ui` wiring; never hardcode colors/spacing** — Task 2 (`globals.css`, `@source`), enforced through all screen tasks. Design rules in `CLAUDE.md`.
- **App shell + nav with later-SP placeholders** — Task 4 (dashboard mockup). Spec §9.
- **Identity: browser keygen (`generateIdentity`), Argon2id wrap at onboarding (`wrapPrivateKey` + `DEFAULT_WRAP_KDF_PARAMS`) with strength guidance, wrapped blob in IndexedDB (Task 5 store), unwrapped key in memory only, re-prompt gate, `navigator.storage.persist()`, explicit no-recovery messaging** — Tasks 5–8. Spec §5, §11.
- **Identity screen: `AM-` fingerprint (mono only), public-key display/copy** — Task 10 (+ D5). Spec §5.
- **Unlock screen + Argon2id latency verification** — Task 9. Spec §11 risk.
- **Tests: component tests for onboarding/unlock/identity, IndexedDB store tests, private-key-never-written-unwrapped assertion** — Tasks 5, 7, 8, 9, 10; browser-mode mirroring `apps/web`. Spec §10.
- **`docs/deploy.md` fourth service** (Sproobo static, docs only, no Vercel) — Task 11.
- **Repo-root green gate** — Task 12: `pnpm typecheck && pnpm lint && pnpm test`.
- **Copy compliance** — enforced throughout; swept in Task 12 Step 5.

---

## Deviation — CSP hardened to hash-pinned `script-src` (supersedes D3)

**What changed (D3, Tasks 1–3, 11):** The plan's D3 accepted `script-src 'self' 'unsafe-inline'` as a documented tradeoff and put a single static CSP `<meta>` in `app/layout.tsx`. Per the spec §3 mandate of *no inline script*, the implementation instead delivers a **hash-pinned** policy via a post-build step and removes the layout `<meta>`:

- `apps/webapp/scripts/inject-csp.mjs` runs after `next build` (wired into the `build` script). For every `out/**/*.html` it sha256-hashes each inline `<script>` body and injects a per-page `<meta http-equiv="Content-Security-Policy">` as the first `<head>` child. Because it hashes the *final emitted bytes* per page, D3's "a page cannot carry the hash of its own inline script" circularity does not apply.
- Production `script-src` = `'self' 'wasm-unsafe-eval'` + per-page `'sha256-…'` hashes, **no `'unsafe-inline'`**. `default-src` tightened to `'none'`; `base-uri`/`form-action` set to `'none'`; `connect-src` keeps the API origin. `'wasm-unsafe-eval'` is retained for `@aesmsg/crypto`'s WebAssembly Argon2id even though no identity code lands in this task.
- `style-src` keeps a **bounded** `'unsafe-inline'` — verified empirically: the export emits 17 inline `style` **attributes** (from `@aesmsg/ui`'s `MaterialIcon` / `Logo`) and **zero** inline `<style>` elements; attributes cannot be hash-covered without `'unsafe-hashes'`. This is style-only and never applies to scripts.
- **Verification (Task 3):** built `out/`, then served it and loaded all 7 routes in headless Chromium under the combined policy (meta + `frame-ancestors 'none'` header). Every page hydrated (proof the hashed inline scripts executed) with **zero** CSP violations and zero page errors.
- **Deploy header (Task 11):** the authoritative host CSP header carries **only `frame-ancestors 'none'`** (plus `Referrer-Policy`/`X-Content-Type-Options`/`X-Frame-Options`). It intentionally does **not** repeat `default-src 'none'`/the resource directives, because multiple CSPs combine via **AND** — a header with `default-src 'none'` but without each page's per-script hashes would block the meta's hydration scripts. The `<meta>` is the single source of truth for resource directives. (This is a small, deliberate refinement of the override's "header carries everything except `script-src`" wording, forced by the multiple-policy AND semantics; documented with browser evidence above.)
