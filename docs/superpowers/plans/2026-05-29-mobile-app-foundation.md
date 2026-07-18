# Slice 12 — Mobile app foundation (React Native / Expo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/mobile` as an Expo (React Native) app that runs `@aesmsg/crypto` on-device, stores identity in the hardware-backed keystore behind a biometric gate, and ships the recipient foundation vertical — open a `/l/:id` link → decrypt locally → read with the privacy shield on — reusing the `payload.ts` envelope so attachments decode for free.

**Architecture:** Mobile reuses the trust-critical core unchanged (`@aesmsg/crypto`, including `seal/open`, `wrapPrivateKey/unwrapPrivateKey`, and `encodePayload/decodePayload`) and the **existing** web API (`GET /api/messages/:id`, `POST /api/messages/:id/open`). It replaces only the *web-specific* edges: IndexedDB → `expo-secure-store`, passphrase → biometric-gated device secret, browser Web Crypto → a Hermes polyfill, and React DOM → React Native. The identity layer mirrors the web `IdentityProvider` state machine (`loading | no_identity | locked | unlocked`) so logic ports cleanly.

**Tech Stack:** Expo (React Native), Hermes, TypeScript strict, `@aesmsg/crypto` (workspace), `react-native-quick-crypto`/`expo-crypto` (Web Crypto surface), `expo-secure-store`, `expo-local-authentication`, `expo-screen-capture`, `expo-file-system`, Vitest (pure-logic units). Biome covers `apps/mobile`.

**Spec:** [`docs/superpowers/specs/2026-05-29-mobile-app-foundation-design.md`](../specs/2026-05-29-mobile-app-foundation-design.md)

> ⚠️ **Task 1 is gating.** Do not build UI before the crypto-portability spike passes. If the polyfill route fails, escalate to the §5.1 pure-JS fallback (guarded by the interop fixture, no wire-format change) before proceeding.

---

## File map

```
apps/
└─ mobile/                                  (Task 2 — Expo app scaffold)
   ├─ app.config.ts / app.json              (Task 2; deep links Task 9; OTA policy Task 10)
   ├─ package.json                          (Task 2 — deps; @aesmsg/crypto workspace:*)
   ├─ tsconfig.json                         (Task 2)
   ├─ index.ts / App.tsx                     (Task 2; crypto polyfill import first — Task 3)
   ├─ README.md                             (Task 10 — OTA policy doc)
   └─ src/
      ├─ crypto/
      │  └─ webcrypto-polyfill.ts           (Task 3 — install global crypto.subtle/getRandomValues)
      ├─ identity/
      │  ├─ secure-store.ts                 (Task 4 — WrappedKey persistence via expo-secure-store)
      │  ├─ device-secret.ts                (Task 4 — biometric-gated device secret)
      │  ├─ identity-context.tsx            (Task 5 — state machine, mirrors web contract)
      │  └─ use-identity.ts                 (Task 5)
      ├─ api/
      │  └─ client.ts                       (Task 6 — getMessage/openMessage against web API)
      ├─ reader/
      │  ├─ fetch-and-open.ts               (Task 6 — open + decodePayload; mirrors web logic)
      │  ├─ LandingScreen.tsx               (Task 7)
      │  ├─ DecryptingScreen.tsx            (Task 7)
      │  ├─ ReaderScreen.tsx                (Task 7 — shielded; attachments Task 8)
      │  ├─ DecryptionFailedScreen.tsx      (Task 7)
      │  └─ LinkUnavailableScreen.tsx       (Task 7)
      ├─ keys/
      │  └─ MyPublicKeyScreen.tsx           (Task 5 — pubkey + fingerprint + QR)
      ├─ shield/
      │  └─ usePrivacyShield.ts             (Task 8 — screen-capture, background blur, clipboard)
      └─ navigation/                        (Task 7 — deep-link → reader routing)
packages/crypto/                            (Task 1 — only if §5.1 fallback is needed; NO wire change)
biome.json                                  (Task 2 — extend globs/ignore for RN)
pnpm-workspace.yaml                         (already globs apps/* — no change expected)
```

---

## Task 1 — Crypto-portability spike (GATING)

- [ ] Create a throwaway Hermes/RN harness (or a bare Expo screen) that imports `@aesmsg/crypto` after installing the Web Crypto polyfill (`react-native-quick-crypto` + `expo-crypto`/`expo-standard-web-crypto`), and runs: `generateIdentity` → `exportPublicKey`/`fingerprint` → `seal` → `open` round-trip; `wrapPrivateKey`/`unwrapPrivateKey`; `encodePayload`/`decodePayload`.
- [ ] **Cross-implementation interop:** seal a message on web, `open()` it on-device, and vice-versa. Confirm against the existing RFC 9180 fixture in `packages/crypto/tests/interop.test.ts` (the cross-impl guard).
- [ ] **Decision gate:** if `@hpke/core`'s DHKEM(X25519) path works on the polyfill → proceed to Task 2. If `crypto.subtle` lacks X25519 on-device → implement the §5.1 fallback path *inside* `@aesmsg/crypto` (build-time selected, pure-JS X25519/HKDF/AES-GCM), keeping all existing crypto tests + interop green and **changing no wire format**. Document the chosen path in the spec's §5.1.
- [ ] Tests: existing `packages/crypto` suite passes on the mobile crypto surface (node + on-device smoke).

## Task 2 — Expo app scaffold + monorepo wiring

- [ ] `apps/mobile` Expo app (TS strict). Add `@aesmsg/crypto: workspace:*`. Confirm Metro resolves workspace packages (configure `metro.config.js` `watchFolders`/`nodeModulesPaths` for pnpm symlinks).
- [ ] Extend `biome.json` for RN files; add `typecheck`/`lint`/`test` scripts so root `pnpm -r` includes mobile. Replace `apps/mobile/DECISION-DEFERRED.md` with a one-line pointer to the spec (decision now resolved).
- [ ] App boots to a placeholder on simulator/device via Expo. No crypto/UI yet beyond the boot screen.

## Task 3 — Web Crypto polyfill at app entry

- [ ] `src/crypto/webcrypto-polyfill.ts` installs `global.crypto` (`subtle` + `getRandomValues`) using the Task 1 winner. Import it as the **first** statement in the app entry so any crypto-touching import sees it.
- [ ] Unit/smoke test: `crypto.getRandomValues` returns entropy; `crypto.subtle.digest("SHA-256", …)` matches a known vector.

## Task 4 — Hardware-backed identity storage

- [ ] `src/identity/device-secret.ts`: generate a random device secret at setup, store in `expo-secure-store` with `requireAuthentication`/biometric access control; release only after biometric auth.
- [ ] `src/identity/secure-store.ts`: persist/load/delete the **`WrappedKey` envelope** produced by `wrapPrivateKey(identity, deviceSecret)`. Reuse `wrapPrivateKey`/`unwrapPrivateKey` verbatim — no new crypto.
- [ ] Tests (pure logic, mocked secure-store): save→load round-trip; wrong device secret → `BadPassphraseError`; delete clears storage.

## Task 5 — Identity state machine + My Public Key screen

- [ ] `identity-context.tsx` + `use-identity.ts`: mirror the web contract (`loading | no_identity | locked | unlocked`; actions `setupNew`, `unlock` (biometric → device secret → `unwrapPrivateKey`), `lock`, `wipe`). Unwrapped keypair in memory only; drop on background/timeout (wire to Task 8 AppState).
- [ ] `keys/MyPublicKeyScreen.tsx`: render `exportPublicKey` + `truncateFingerprint` (JetBrains Mono) + QR (reuse the QR approach from `@aesmsg/ui`'s `QrCodePreview` logic, RN-rendered).
- [ ] Tests: state-machine transitions (mocked biometric + secure-store); wipe is irreversible.

## Task 6 — Recipient: API client + fetch-and-open adapter

- [ ] `api/client.ts`: `getMessage(id)` (metadata, safe preview, no open) and `openMessage(id)` (consumes one open, returns base64 ciphertext) against the existing web API base URL (configurable).
- [ ] `reader/fetch-and-open.ts`: mirror web semantics — `openMessage` → base64-decode → `open()` with `MessageBindingContext` → `decodePayload` → `{ text, attachments }`. Reuse the exact binding-context construction from `apps/web/src/reader/fetch-and-open.ts`.
- [ ] Tests: decrypts an enveloped ciphertext (text + attachment); wrong identity → `DecryptionError`; AAD/link-id mismatch → throws.

## Task 7 — Recipient screens + deep-link routing

- [ ] Screens per `all_design_screens/mobile_secure_reader_aesmsg`: Landing (safe preview, fingerprint-mismatch amber warning), Decrypting (spinner), Reader (shielded text + attachments), DecryptionFailed (opaque), LinkUnavailable (opaque, single message for revoked/expired/gone).
- [ ] Navigation routes a `/l/:id` deep link (Task 9) through the identity gate to the reader state machine. Reuse the web reader's state flow (`loading → landing → opening → decrypted | failed | gone`).
- [ ] Tests: state-machine rendering per state; gone/failed show the opaque copy.

## Task 8 — Attachment download + privacy shield

- [ ] Decoded attachments → sandboxed cache dir via `expo-file-system`, opened/shared through the OS share sheet (download-only, no inline image preview). Revoke/clear cached files on leaving the reader.
- [ ] `shield/usePrivacyShield.ts`: `expo-screen-capture` `preventScreenCaptureAsync` on the reader (Android `FLAG_SECURE`, iOS app-switcher obscuring); `AppState` listener renders an opaque cover when not `active`; 60s clipboard auto-clear matching `DecryptedScreen`.
- [ ] Tests (logic-level): clipboard auto-clear timing; shield toggles on AppState change (mocked).

## Task 9 — Deep links

- [ ] Configure Universal Links (iOS `associatedDomains` + `apple-app-site-association`) and Android App Links (`intentFilters`, autoVerify) for `https://<host>/l/:id` in `app.config.ts`. Web reader remains the fallback when the app isn't installed.
- [ ] Manual: tapping a real `/l/:id` link opens the app to the reader (documented in README acceptance).

## Task 10 — OTA-disabled-for-crypto + README

- [ ] Configure Expo Updates to exclude crypto/identity modules from OTA, or disable OTA entirely for this app. Document the policy and rationale (supply-chain) in `apps/mobile/README.md`.

## Task 11 — Verification & acceptance

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green across all workspaces including `apps/mobile` pure-logic units.
- [ ] **On-device acceptance** (simulator + at least one physical device): setup identity → background/foreground returns to `locked` → biometric unlock → open a link **created by the web app** → decrypt → read with screenshot blocking + background blur active → copy auto-clears at 60s → attachment opens via share sheet.
- [ ] Wrong identity → clean opaque decryption failure (no recovery), matching web.
- [ ] web↔mobile ciphertext interop confirmed end-to-end.

---

## Verification (how to test the whole slice)

1. **Crypto core (Task 1):** run `pnpm --filter @aesmsg/crypto test` plus the on-device spike harness; confirm web-sealed ciphertext opens on-device.
2. **Unit logic:** `pnpm --filter mobile test` for identity state machine, secure-store round-trip, fetch-and-open, shield/clipboard timing (all with mocked native modules).
3. **Manual E2E:** `pnpm --filter mobile exec expo start`, run on simulator/device, walk the Task 11 acceptance checklist. Use the deployed/running web app to mint a `/l/:id` link (with and without an attachment) and open it natively.

## Risks & mitigations (carried from spec §9)

- **Web Crypto on Hermes (gating):** spike first (Task 1); pure-JS fallback inside the crypto package guarded by the interop fixture; no wire-format drift.
- **JS memory hygiene:** minimize unwrapped-key lifetime (biometric-gated, dropped on background/timeout); document residual risk.
- **OTA supply chain:** exclude crypto from OTA / disable OTA (Task 10).
- **iOS screenshot blocking is best-effort:** app-switcher obscuring + honest disclosure.
