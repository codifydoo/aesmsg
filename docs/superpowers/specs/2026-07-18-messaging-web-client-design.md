# Messaging web client (`app.aesmsg.com`) — umbrella design spec

- **Date:** 2026-07-18
- **Status:** Approved umbrella spec; each sub-project below gets its own spec → plan cycle
- **Author:** brainstorming session (Claude + Davor)
- **Branch:** `davor/messaging-web-app-d4291f`
- **Supersedes (partially):** `2026-05-31-presentational-web-and-fastify-api-design.md` locked the recipient experience as **native-only**. This spec reverses that single decision and exercises the escape hatch that spec reserved ("If a future browser client appears, add `@fastify/cors` scoped to that origin then"). Everything else that spec established — static marketing site, preview-safe bouncer, standalone Fastify API — is **kept**.

## 1. Motivation

The "install aesmsg to open this" wall is the largest drop-off point in the recipient journey, and it also blocks would-be senders who simply will not install a mobile app. A browser client removes that wall for both roles. The earlier browser MVP was dismantled to focus the product on native; this spec brings a web client back **as a separate, additive surface** without weakening what the pivot bought.

## 2. Locked decisions

| Decision | Value |
|---|---|
| Audience | **Senders and recipients** — a full messaging client, not a reader-only page |
| Identity model | **Standalone web identity.** The browser generates its own keypair; a web identity has its own `AM-` fingerprint and is verified like any other contact. No key sync with mobile in this spec. |
| Private-key protection | **Argon2id password-wrap** (the primitive already shipped in `@aesmsg/crypto`). Wrapped key in IndexedDB; unwrapped key in memory only, per session. Passkey/WebAuthn-PRF is a possible later upgrade, not v1. |
| Scope | **Full mobile parity**, delivered as five decomposed sub-projects (§9), minus the explicit deferrals in §8 |
| Architecture | **New workspace `apps/webapp`**, Next.js 16 static export, deployed as a fourth Sproobo app at `https://app.aesmsg.com` |
| `aesmsg.com` role | Unchanged: static marketing + `/l/[id]` bouncer. Bouncer gains an "Open in browser" secondary action |
| API change | `@fastify/cors` allowlisting exactly `https://app.aesmsg.com`. No endpoint, schema, or store changes |
| Rejected alternatives | Rebuilding messaging inside `apps/web` (shared attack surface, bouncer invariant at risk); desktop app (it is still an install, contradicting the motivation) |

## 3. Threat model & honesty about the web tier

The one real difference from native: **code arrives via page load, not a signed binary.** A compromised or coerced web origin could serve JS that exfiltrates keys or plaintext. This is inherent to browser delivery; we mitigate and we do not overclaim:

- **Fully static hosting.** No SSR, no server code in `apps/webapp`. Key material only ever exists client-side.
- **Strict CSP**: no third-party scripts, no remote origins beyond `api.aesmsg.com`, no inline script. Assets are hash-named and immutable.
- **No analytics/telemetry scripts** on `app.aesmsg.com`.
- **Copy stays honest.** The web security-settings screen states that the native app offers stronger delivery guarantees (signed builds, biometric gate, screenshot blocking) and links to it. Marketing never claims web ≡ native.

Existing invariants preserved unchanged: zero-knowledge backend; links are pointers; expired/revoked links leak nothing; wrong key = no decryption, no recovery.

## 4. Architecture

```
apps/
  api/      ← + @fastify/cors allowlisting https://app.aesmsg.com (only change)
  web/      ← aesmsg.com: static marketing + /l/[id] bouncer; bouncer adds "Open in browser"
  webapp/   ← NEW. Next.js 16 static export (`output: 'export'`). The messaging web client.
  worker/   ← unchanged
  mobile/   ← unchanged
packages/
  crypto/         ← unchanged; already browser-ready (no node: imports, hash-wasm Argon2id,
                    HPKE over WebCrypto + noble fallback, existing Playwright browser test suite)
  design-tokens/  ← consumed by apps/webapp
  ui/             ← consumed by apps/webapp; may grow shared components back from the mockups
  server-store/   ← unchanged (server-side only)
```

- `apps/webapp` has **no API routes and no server runtime** — it builds to static files. Deployment is a static-file serve on Sproobo at `app.aesmsg.com` (deploy details land in the sub-project plan; `docs/deploy.md` gains a fourth service section).
- Visual source of truth: the existing web mockups in `all_design_screens/` (dashboard, create, links, contacts, identity, reader, error states, security settings) — they were originally drawn for web.
- All state that mobile keeps on-device (contacts, sent links, identity) lives in **IndexedDB**, mirroring the client-store patterns the old MVP used.

## 5. Identity & key handling

- **Keygen** in-browser via `@aesmsg/crypto` (same HPKE suite: DHKEM(X25519) + AES-256-GCM; same `AM-` fingerprint derivation). A web identity is a first-class peer — mobile users verify it exactly like any contact.
- **At rest:** private key stored only as an Argon2id-wrapped blob in IndexedDB. The wrap password is chosen at onboarding with clear strength guidance.
- **In use:** unwrapped key held in memory for the session; re-prompt before decrypt, key export, and rotation. Never written to storage unwrapped; no service-worker/cache persistence of key material.
- **No recovery.** Lost password ⇒ that identity is unrecoverable; user generates a new one and re-verifies with contacts. Same stance as mobile, stated during onboarding.
- **Backup export/import** uses the same encrypted-backup format as mobile (`2026-06-03-mobile-backup-export-import-design.md`), giving users a migration path between browsers. Because the formats match, importing a mobile-originated backup will technically work; v1 neither advertises nor optimizes that path, and no key sync exists. Advertised cross-surface identity is deferred until the web tier has earned trust.

## 6. Flows

### 6.1 Recipient flow & link-preview safety

1. Recipient taps `https://aesmsg.com/l/<id>` in any chat app.
2. The **bouncer stays 100% static** (no fetch, no state query — invariant preserved). It now offers two actions: **"Open in the app"** (deep link, as today) and **"Open in browser"** → `https://app.aesmsg.com/l/<id>`.
3. The webapp reader page renders static UI first. Ciphertext is fetched **only on an explicit user tap** — an auto-fetching link-preview bot can never consume an open on either origin.
4. Password prompt → local unwrap → HPKE open → secure reader.
5. Reader parity, honestly scoped to the web platform: clipboard auto-clear (30–60 s), blur-on-`visibilitychange`, no plaintext in URL/history/storage. **Screenshot blocking is impossible on web** — documented gap, not papered over.
6. Error states are first-class screens per the design system: expired/revoked ("This secure link is no longer available." — nothing more), already-opened, wrong key, network error, invalid payload.

### 6.2 Sender flow

Compose (text + attachments) → recipient (saved contact or pasted public key) → expiry (10m/1h/24h/7d/custom) + max opens (1/3/unlimited) → local seal → upload ciphertext → link created (copy affordance) → paste into any channel. Links list, link details, and **revoke** (server-side purge) — all against the existing `/api/messages/*` endpoints, shapes unchanged.

### 6.3 Contacts & verification

IndexedDB contact directory; add via pasted public key or **camera QR scan** (getUserMedia); QR **display** of one's own key; manual fingerprint verification flow; verified/unverified states with the green/amber semantics; **key-changed security alert** blocking sends until re-verified.

## 7. Backend change (the only one)

`apps/api` registers `@fastify/cors` with a **single-origin allowlist** read from `AESMSG_WEBAPP_ORIGIN`, defaulting to `https://app.aesmsg.com` (same sensible-default pattern as `AESMSG_PUBLIC_LINK_ORIGIN`); dev sets it to the local webapp origin. Every other origin remains denied. No other API change: same routes, same rate limits, same stores, same body caps.

## 8. Parity caveats & deferrals

| Item | Status |
|---|---|
| Attachments | In scope; existing 20 MiB API body cap applies |
| Key rotation, backup export/import, security settings | In scope (sub-project ⑤) |
| Clipboard auto-clear, background blur | In scope (web equivalents) |
| Screenshot blocking | **Not possible on web** — documented gap |
| aesmsg Pro | **Deferred.** Web billing (Stripe-style) ≠ app-store IAP; separate future decision |
| Push notifications | **Out** — already established as architecturally impossible under zero-knowledge |
| Passkey/WebAuthn-PRF unlock | Deferred upgrade path on top of the Argon2id wrap |
| Cross-surface identity (mobile ⇄ web key import) | Deferred; standalone identities only in this spec |

## 9. Decomposition into sub-projects

Each is its own spec → plan cycle and leaves the repo green and shippable:

1. **Foundation + identity** — `apps/webapp` scaffold (static export, CSP, tokens/ui wiring), identity onboarding, keygen, Argon2id wrap/unlock, identity screen.
2. **Sender flow + links management** — compose/seal, link created, links list/details, revoke. Requires the CORS change in `apps/api`.
3. **Recipient flow + bouncer integration** — webapp reader with explicit-fetch gate, error states, `aesmsg.com` bouncer "Open in browser" action.
4. **Contacts + verification** — directory, paste-key, QR display/scan, fingerprint verification, key-changed alert.
5. **Rotation, backup, security settings, attachments polish.**

## 10. Testing & verification

- **Crypto:** already proven in real browsers by `@aesmsg/crypto`'s Playwright-backed `test:browser` suite; no changes needed.
- **Webapp:** Vitest component tests per flow; a Playwright e2e covering seal → link → open → decrypt against a locally booted `apps/api`; an explicit test asserting `/l/[id]` on **both** origins performs zero network requests before user action.
- **API:** CORS smoke tests — allowlisted origin passes, others denied.
- **Workspace gates:** `pnpm typecheck`, `pnpm lint`, `pnpm test` green across all workspaces at every phase boundary.

## 11. Risks & mitigations

- **Web-tier trust regression** (malicious/compromised serving) → static hosting + strict CSP + no third-party code + honest copy (§3); native remains the recommended surface for the most sensitive use.
- **Bouncer invariant erosion** as `aesmsg.com` gains the new action → the button is a plain static link; the zero-network-before-action test guards both origins.
- **CORS misconfig** exposing the API to arbitrary origins → single-origin allowlist under test; deny-all remains the default posture.
- **IndexedDB eviction / browser data clearing** silently destroying the wrapped key → onboarding pushes the encrypted backup export; storage-persistence API (`navigator.storage.persist()`) requested.
- **Argon2id (hash-wasm) performance on low-end devices** → parameters already tuned for mobile in `@aesmsg/crypto`; verify unlock latency in the foundation sub-project.
- **Scope creep toward the dismantled MVP's problems** → decomposition (§9) keeps each phase small, and deferrals (§8) are explicit.

## 12. Out of scope

- Any change to the crypto wire format, `@aesmsg/server-store` schema, or migrations.
- Mobile app changes (the native flows are untouched).
- Web billing / aesmsg Pro on web.
- Multi-device identity or key sync.
- Additional marketing pages on `aesmsg.com`.
