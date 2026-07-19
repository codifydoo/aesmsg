## CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## What this project is

**aesmsg** is a privacy-first **encryption layer over existing communication channels**. It is **not a chat app and not a messenger**. It is a zero-knowledge **transmission utility** that turns sensitive content into a shareable link to ciphertext, which the user then sends through whatever channel they already use (Slack, WhatsApp, iMessage, email, SMS, Telegram, etc.).

Core promise:

> Encrypt before you send. Share through any app. Only the intended recipient can open it.

The product exists because the channels people already use to send credentials, files, and confidential notes (Slack, WhatsApp, email) are not designed to keep that content private from the channel itself, its operator, or anyone with later access to the conversation. aesmsg sits one layer above those channels: the channel only ever transports an opaque link.

## How the product works (the model UI must reinforce)

1. Sender composes a message and/or attaches a file in the aesmsg client.
2. The client encrypts locally with **AES-256-GCM**, sealing the payload to the **recipient's public key**.
3. Only the resulting **ciphertext + minimal metadata** is uploaded to the backend. Plaintext never leaves the device.
4. The backend returns a **secure link** — a pointer to the ciphertext, not the secret.
5. The sender pastes that link into Slack / WhatsApp / email / etc.
6. The recipient opens the link, the client downloads the ciphertext, the recipient's **private key** (which never left their device) decrypts it locally after biometric unlock.
7. Links can self-destruct (10m / 1h / 24h / 7d / custom), cap max opens (1 / 3 / unlimited until expiry), and be **manually revoked** — revocation purges the ciphertext from the server.

What the server stores: message ID, ciphertext, creation time, expiry, max opens, status.
What the server **must never** store: plaintext, private keys, message previews, unencrypted attachments.

## Who it is for

- **Developers / DevOps** sharing API keys, secrets, env vars, credentials.
- **Legal / finance** professionals sending confidential documents and PII.
- **Agencies and teams** doing temporary credential handoff to clients/contractors.
- **Privacy-conscious orgs** that want an extra layer over their existing chat tool, without forcing users onto a new chat tool.

## Critical product invariants

These are non-negotiable and any UI work must preserve them:

- **Zero-knowledge backend.** Server sees ciphertext only. UI copy and affordances must reinforce this — never imply server-side trust.
- **Private keys never leave the device** unless the user explicitly exports an encrypted backup.
- **Links are pointers, not secrets.** A link without the recipient's private key is useless.
- **Public link previews must be safe.** Messaging apps auto-fetch URLs to build previews — the public landing page must not consume opens or expose ciphertext to a simple GET. Actual fetch/decrypt requires explicit app action.
- **Expired / revoked links must not leak metadata.** "This secure link is no longer available." — nothing more.
- **Wrong private key = no decryption.** No fallbacks, no recovery, no "are you sure". The message is unrecoverable on that device.
- **Decrypted plaintext is the user's responsibility past that point** — but the client mitigates: clipboard auto-clear (30–60s), background blur, screenshot blocking where possible, biometric guard on every open.

## User journeys at a glance

**Sender:** compose → pick recipient (verified contact / pasted public key / scanned QR) → set expiry + max opens → encrypt locally → copy link → paste into any app.

**Recipient:** tap link in any app → universal/app link opens aesmsg → ciphertext downloaded → biometric prompt → local decrypt → secure reader (with blur-on-background + clipboard auto-clear).

**Identity:** every user has a PKI keypair. Trust is established by **manual fingerprint verification** or **QR scan** to defeat MitM. Keys can be rotated; rotation must gracefully handle in-flight legacy links.

## Repository nature

This repo holds **both design artifacts and a code workspace**.

- `all_design_screens/` is the design source of truth — Tailwind-CDN HTML mockups + PNGs + the `DESIGN.md` token file. **Do not edit these as if they were app source.** They are reference material that gets migrated into typed React components (the native mobile app is the primary target; `packages/ui/` + `apps/webapp/` for the messaging web client, `apps/web/` for the marketing surface).
- The code workspace is a **pnpm monorepo** at the repo root. Use `pnpm` (never `npm`/`yarn`). Node 22 LTS; `corepack enable` to get pnpm 10.

Roadmap phases per the PRD (current reality: an advanced prototype approaching a **mobile** launch):

- **Phase 0 (done):** monorepo + tooling skeleton, design artifacts intact.
- **Phase 1 (current):** the product is **native-app-first**. `@aesmsg/crypto` (HPKE) is implemented; the zero-knowledge backend (`apps/api` + `apps/worker` over `@aesmsg/server-store`) is implemented; the mobile app carries the real sender/recipient/identity flows plus aesmsg Pro. An earlier browser-based web MVP was built and then **deliberately dismantled** — `apps/web` is now a static marketing + deep-link-bouncer site with no crypto or DB. A browser client has since returned as a **separate, additive** surface: `apps/webapp` (a static-export messaging web client at `app.aesmsg.com`) — it does **not** weaken the native-first posture or the dismantled `apps/web`'s invariants (all its crypto is client-side `@aesmsg/crypto`; the backend stays zero-knowledge).
- **Phase 2:** trust-flow hardening (real key rotation, key-changed detection, per-decrypt biometric gate), backend auth/abuse controls, secure file attachments.
- **Phase 3:** enterprise (admin controls, metadata-only audit logs, team contact directories).

## Working in the codebase

**Workspace layout:**

The product ships as **four deployables** (`apps/api`, `apps/worker`, `apps/web`, `apps/webapp`) plus the native `apps/mobile` client. See [`docs/deploy.md`](docs/deploy.md).

- `apps/mobile/` — **React Native / Expo** app (iOS + Android). The real product surface: onboarding, identity, compose/seal, links, contacts + fingerprint verification, secure reader, key export/rotate/wipe, settings, and aesmsg Pro. The **mobile app's crypto, identity, and key handling all run through `@aesmsg/crypto`** (as does `apps/webapp`'s — each surface has its own standalone identity).
- `apps/api/` — standalone **Fastify** service hosting the message API (`/api/messages/*`) over `@aesmsg/server-store`. Consumed by the native app **and the `apps/webapp` web client** (single-origin CORS allowlist via `AESMSG_WEBAPP_ORIGIN`); the marketing site (`apps/web`) does not call it. Prod env: `DATABASE_URL`, `REDIS_URL`, `RATE_LIMIT_IP_SALT` (≥ 32 bytes, boot-required), `AESMSG_PUBLIC_LINK_ORIGIN`, `AESMSG_TRUST_PROXY=1` behind nginx. Fails closed at boot if these are missing in production.
- `apps/worker/` — headless **expiry sweeper** that purges expired/revoked ciphertext from Postgres. Env: `DATABASE_URL` only.
- `apps/web/` — Next.js 16+ (app router, TS strict, Tailwind 4, Turbopack). Static **presentational** site: marketing landing at `/` plus a deep-link bouncer at `/l/[id]` that hands off to the native app (or, secondarily, to `apps/webapp`). **No API routes, no crypto, no identity/keys, no DB — needs no backend env.** See `apps/web/AGENTS.md` — Next.js 16 has breaking changes from earlier major versions; consult `node_modules/next/dist/docs/` before relying on training-data Next.js patterns.
- `apps/webapp/` — Next.js 16 **static export** (`output: 'export'`) messaging **web client** served at `https://app.aesmsg.com`. Unlike `apps/web`, it carries the real sender/recipient/identity flows — compose/seal, links + revoke, contacts + verification, secure reader, rotation/backup/settings — but **all crypto runs client-side** (via `@aesmsg/crypto`), the private key is Argon2id-wrapped in IndexedDB and unwrapped in memory only, and there is **no server runtime, no SSR touching key material, and no DB**. It talks only to `api.aesmsg.com`. A true cross-process Playwright e2e (`pnpm --filter @aesmsg/webapp test:e2e`, excluded from `pnpm test`) exercises seal → link → open → decrypt → revoke → gone against a locally booted `apps/api`. See `apps/webapp/AGENTS.md` — the same Next.js 16 caveat applies.
- `packages/crypto/` — trust-critical encryption primitives (**implemented**): HPKE via `@hpke/core` (with a pure-JS `@noble/curves` fallback for Hermes), Argon2id key-wrap, fingerprints (`AM-` prefix), wire/payload formats. **No DOM, no network, no storage.**
- `packages/server-store/` — `LinkMetadataStore` / `CiphertextStore` / `RateLimitStore` interfaces with memory, Postgres, and Redis backends, plus the advisory-locked SQL migration runner (`pnpm migrate`). Node-only.
- `packages/design-tokens/` — single source for `DESIGN.md` values. Tailwind 4 `@theme` block + TS exports. The web app consumes it via `@import "@aesmsg/design-tokens/theme.css"`; never hardcode colors or spacing in components.
- `packages/ui/` — shared React component catalogue consumed by the web app.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design specs and implementation plans.

**Commands (run from the repo root):**

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies. |
| `pnpm dev` | Boot the web app on `http://localhost:3000`. |
| `pnpm typecheck` | Run TypeScript across every workspace. |
| `pnpm lint` | Run Biome (lint + format check). |
| `pnpm lint:fix` | Apply Biome's safe fixes. |
| `pnpm format` | Apply formatting fixes only. |
| `pnpm test` | Run Vitest across every workspace. |
| `pnpm --filter <name> <script>` | Target a single workspace, e.g. `pnpm --filter @aesmsg/crypto test`. |

**Tooling decisions** (locked in [`docs/superpowers/specs/2026-05-09-project-init-design.md`](docs/superpowers/specs/2026-05-09-project-init-design.md)):

- **Package manager:** pnpm 10. **Test runner:** Vitest. **Lint+format:** Biome 2 (replaces ESLint + Prettier — there is no ESLint config in this repo on purpose).
- **Crypto:** HPKE (RFC 9180) via `@hpke/core` — DHKEM(X25519, HKDF-SHA256) + AES-256-GCM AEAD + HKDF-SHA256 KDF. **Implemented** in `@aesmsg/crypto`.
- **Hosting:** Sproobo (Postgres + Redis + object storage). All four deployables deploy there — see [`docs/deploy.md`](docs/deploy.md). **Never propose Vercel.**
- **License:** Apache 2.0.

## Layout

- `all_design_screens/project_prd_design_brief_aesmsg.md` — **PRD.** Vision, features, journeys, technical stack, roadmap. Source of truth for **what** the product does.
- `all_design_screens/messanger.md` — extended product brief: positioning, voice, language rules, full screen-by-screen UX requirements, security UX principles, error/empty/loading states.
- `all_design_screens/aesmsg_proposed_screen_list.md` — canonical list of web + mobile screens.
- `all_design_screens/secure_message_design_system/DESIGN.md` — **design system spec.** Color tokens (Material-style `surface-container-*`, `on-surface`, …), Geist / Inter / JetBrains Mono type scale, spacing, elevation, component rules. Authoritative for visual decisions.
- `all_design_screens/<screen_name>/` — one folder per screen, each containing `code.html` (self-contained Tailwind CDN mockup, with the design tokens inlined into its `tailwind.config`) and `screen.png`.

Screen folders cover:

- **Web:** landing, dashboard, create secure message, secure link created, secure link details, secure links list, contacts, contact detail, my identity / my security keys, secure reader, link expired, decryption failed, security alert (key changed), security settings.
- **Mobile:** `mobile_home_aesmsg`, `mobile_encrypt_aesmsg`, plus the mobile flows reachable from those.

## Design rules (apply when editing `all_design_screens/` or building components in `packages/ui/`)

- **Editing a mockup screen:** modify `all_design_screens/<screen>/code.html`. The `tailwind.config` block near the top mirrors `DESIGN.md` tokens — keep them in sync if you add tokens. Tailwind via CDN, Material Symbols Outlined for icons, no bundler. These mockups are reference material; once a screen has been migrated into `packages/ui/` and used by `apps/web/`, the typed React component is the source of truth.
- **Adding a mockup screen:** create a snake_case folder under `all_design_screens/`, copy `code.html` from a sibling screen so the Tailwind config + font links stay consistent, and add it to `aesmsg_proposed_screen_list.md`.
- **Visual decisions:** consult `DESIGN.md` (and `@aesmsg/design-tokens` for code) first. Dark-first (`#141218` surface), Electric Violet primary (`#cfbcff`), Geist for headings, Inter for body, **JetBrains Mono only for fingerprints, public keys, and secure links** — never for general UI text. Depth comes from luminance + 1px borders, not drop shadows. Aesthetic target is Stripe / Linear / Proton / 1Password — calm, professional, premium. Avoid hacker-green / cyberpunk / paranoid imagery.
- **Color semantics:** green = verified / decrypted / safe. Amber = unverified, key changed, expiring soon. Red = destructive only (revoke, delete, wipe private key). Never use red for ambient states.
- **Copy / messaging:** never write "unbreakable", "impossible to hack", or "military-grade". Use "end-to-end encrypted", "zero-knowledge backend", "private keys stay on your device", "only the intended recipient can decrypt". Hide deep crypto terminology behind expandable / advanced sections — the primary flows must read as a calm SaaS product, not a crypto tool.
- **Empty / error states matter.** Wrong key, expired, revoked, already opened, network error, invalid payload — these are first-class screens, not afterthoughts, because they are where users learn the security model. Existing examples live in `link_expired_aesmsg/`, `decryption_failed_aesmsg/`, `security_alert_key_changed_aesmsg/`.
