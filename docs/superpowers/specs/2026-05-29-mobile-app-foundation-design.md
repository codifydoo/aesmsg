# Slice 12 — Mobile app foundation (React Native / Expo)

**Date:** 2026-05-29
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** [project init spec](2026-05-09-project-init-design.md), [Slice 1 crypto-core](2026-05-09-crypto-core-design.md), [Slice 2 key-store](2026-05-09-key-store-design.md), the web sender/recipient slices (5/6), and the file-attachments slice (`packages/crypto/src/payload.ts`). Resolves [`apps/mobile/DECISION-DEFERRED.md`](../../../apps/mobile/DECISION-DEFERRED.md).

## 1. Context

Phase 1 delivered a complete, working **web** MVP: local HPKE encryption, manual PKI, ephemeral links, contacts, and (just landed) file attachments. Phase 2's headline is **native mobile** — the channel where people actually paste links from Slack/WhatsApp/iMessage and where the privacy-shield affordances (biometric unlock, screenshot blocking, background blur, hardware-backed keys) finally become real instead of aspirational.

The mobile-stack choice was deliberately deferred at project init because, for a zero-knowledge product, it has security consequences beyond developer ergonomics. That decision is now made: **React Native via Expo**, chosen for maximum reuse of the DOM-free `@aesmsg/crypto` core and fastest path to a shippable app, accepting the constraints below. This spec defines the foundation slice — the app skeleton, the crypto-portability story, secure identity storage, biometric unlock, and the privacy shield — onto which the mobile sender/recipient flows are built in follow-up slices.

This is a **foundation** slice. It deliberately ships a thin but end-to-end-correct vertical (generate identity → unlock biometrically → open a `/l/:id` link → decrypt locally → read with the shield on) rather than porting every screen at once.

## 2. Goals

- Stand up `apps/mobile` as an **Expo** (React Native) app in the pnpm monorepo, consuming `@aesmsg/crypto` directly (workspace dependency).
- **Make the crypto core run on-device.** Provide the Web Crypto + secure-random surface `@aesmsg/crypto` and `@hpke/core` depend on (`crypto.subtle`, `crypto.getRandomValues`), since Hermes does not ship them. This is the single highest-risk item and the reason this is a foundation slice.
- **Hardware-backed identity storage.** Wrap the existing `wrapPrivateKey` envelope's passphrase/secret in the platform secure store (iOS Keychain / Secure Enclave, Android Keystore / StrongBox) instead of IndexedDB. Reuse the crypto wrap format unchanged.
- **Biometric unlock on every open** (Face ID / Touch ID / Android BiometricPrompt), gating access to the unwrapped private key held in memory only.
- **Privacy shield:** screenshot blocking (`FLAG_SECURE` on Android; overlay/obscure on iOS app-switcher), background blur when the app is backgrounded, and clipboard auto-clear parity with web (60s).
- **Deep links:** register a universal/app link so `https://<host>/l/:id` opens the native app to the recipient flow, falling back to the web reader if the app isn't installed.
- **Disable OTA for crypto.** Configure Expo Updates so no over-the-air bundle can hot-swap any module touching crypto/key material — the supply-chain concern from the deferral doc.
- Ship the foundation vertical: My Public Key screen + a working recipient (open-link → decrypt → read) flow, reusing the `payload.ts` envelope so attachments decode for free.

## 3. Non-goals

- **No mobile sender/compose flow in this slice.** Compose/encrypt/share (mirroring `mobile_encrypt_aesmsg`) is the next slice; this one proves the crypto + identity + reader foundation first.
- **No file *picking* on mobile** (sending files). Receiving + downloading attachments works via the shared envelope; the native document/photo picker for sending is deferred to the compose slice.
- **No contacts directory / key-change alerts on mobile.** Web has them (Slices 8/10); mobile parity is a later slice. Recipient key is the device's own identity.
- **No multi-device sync / device pairing.** Single-device, like web. Cross-device is a Phase 3 account concern.
- **No push notifications.**
- **No new backend or API changes.** Mobile talks to the *existing* `apps/web` API (`GET /api/messages/:id`, `POST /api/messages/:id/open`). Backend is channel-agnostic.
- **No app-store submission pipeline** (EAS Build/Submit config) — tracked separately once the vertical is demoable.

## 4. Stack decision & rationale

| Option | Velocity | Security story | Verdict |
|---|---|---|---|
| **React Native / Expo (no OTA for crypto)** | Fastest | Acceptable — native modules reach Secure Enclave/StrongBox + biometrics; OTA disabled for crypto | **Chosen** |
| Kotlin Multiplatform | Medium | Strong | Rejected for this phase (crypto reimplementation cost) |
| Native Swift + Kotlin | Slowest | Strongest | Rejected for this phase |

The crypto package is intentionally DOM-free and network-free precisely so it ports here. The tradeoff RN imposes — JS-side memory hygiene for plaintext/keys is weaker than Swift/Kotlin, and OTA is a supply-chain risk — is mitigated by (a) holding unwrapped keys only transiently in memory behind a biometric gate, and (b) hard-disabling OTA for crypto modules.

## 5. Architecture

### 5.1 Crypto portability (highest risk — prototype first)

`@aesmsg/crypto` uses Web Crypto in three places: `crypto.subtle.digest` (SHA-256 in `aad.ts`/`fingerprint.ts`), `crypto.subtle` AES-256-GCM (`wrap.ts`), and `@hpke/core` (which itself calls `crypto.subtle` for X25519/HKDF/AES-GCM). `crypto.getRandomValues` is used for identity/link-id generation. Hermes provides **none** of these.

Plan, in order of preference:

1. **Polyfill the global Web Crypto surface** at app entry so `@aesmsg/crypto` and `@hpke/core` run unmodified. Candidate: `react-native-quick-crypto` (JSI-backed, exposes `crypto.subtle` + `getRandomValues`) plus `expo-crypto`/`expo-standard-web-crypto` as needed. **A spike must verify `@hpke/core`'s DHKEM(X25519) path works against the polyfill** before committing — this is the slice's gating risk.
2. If `subtle` X25519 is unavailable on the chosen polyfill, fall back to a pure-JS X25519/HKDF/AES-GCM path *inside* `@aesmsg/crypto` selected at build time. The package must remain interop-compatible (the existing RFC 9180 interop fixture in `packages/crypto/tests/interop.test.ts` is the cross-implementation guard) — **no wire-format change is permitted.**

#### Resolved (2026-05-29): runtime-selected pure-JS fallbacks for the two gaps Hermes can't fill

Static analysis confirmed `react-native-quick-crypto@0.7.17` does polyfill SHA-256 digest, HKDF, AES-256-GCM, and `getRandomValues` on-device, but leaves exactly **two** gaps:

- **X25519 group op** — quick-crypto's `SubtleCrypto` ships with the `X25519` cases commented out, so `@hpke/core`'s `DhkemX25519HkdfSha256` (which uses `subtle.generateKey("X25519")` / `deriveBits({name:"X25519"})`) throws `NotSupportedError` on Hermes.
- **Argon2id** — `wrap.ts` derives the wrap key with `hash-wasm`'s `argon2id`, which compiles WebAssembly; Hermes has no WebAssembly.

Both are now closed inside `@aesmsg/crypto` with **runtime-selected backends** (no build-time flag, no wire-format change):

- **DHKEM(X25519):** `src/kem-noble.ts` implements `NobleX25519` (a `DhkemPrimitives` backed by `@noble/curves` `x25519`) and `NobleDhkemX25519HkdfSha256 extends Dhkem` from `@hpke/common`, mirroring `@hpke/core`'s native KEM exactly: same `KemId`, same 32-byte sizes, same RFC 9180 §7.1.3 `DeriveKeyPair` (reusing the same `HkdfSha256Native` instance, so labeled-extract/expand bytes are byte-identical). `src/hpke.ts` builds a memoized `getSuite()` that probes `crypto.subtle.generateKey({name:"X25519"})` once and picks native (web/Node) or noble (Hermes). KDF and AEAD are always the native `@hpke/core` ones (supported everywhere).
- **Argon2id:** `src/argon2.ts` selects `hash-wasm` when `WebAssembly` is available (web/Node, fast) and `@noble/hashes` `argon2id` otherwise (Hermes). Both implement RFC 9106 and produce byte-identical output for the `wrap.ts` params (m=65536, t=3, p=1, len=32); the `"argon2id-aes256gcm"` envelope and all params are unchanged.

Audited crypto deps only: `@noble/curves`, `@noble/hashes` (plus `@hpke/common`, already transitive). Test-force hooks (`__setKemBackendForTests` / `__setArgon2BackendForTests`) let Node exercise the Hermes paths even though it has native X25519 + WASM.

Acceptance: the existing crypto round-trip + interop + wrap tests pass on-device (or in a Hermes test harness). A ciphertext sealed on web must `open()` on mobile and vice-versa.

> **Interop proven in Node (2026-05-29):** cross-backend tests seal with the native KEM and `open()` with the noble KEM (and the reverse) for full text + attachment payloads, and derive byte-identical raw public **and** private keys from a fixed IKM under both backends. The RFC 9180 fixture decrypts under both KEMs. `hash-wasm` and `@noble/hashes` argon2id agree byte-for-byte, and wraps cross-decrypt between WASM and noble. The HPKE wire bytes and `WrappedKey` envelope shape are unchanged.

### 5.2 Identity storage — replace IndexedDB, reuse the wrap format

`@aesmsg/key-store` is IndexedDB-specific and stays web-only. Mobile gets a parallel adapter (`apps/mobile/src/identity/secure-store.ts`) that persists the **same `WrappedKey` envelope** produced by `wrapPrivateKey`, using `expo-secure-store` (Keychain/Keystore) for the wrapped blob. The user's passphrase is replaced on mobile by a **device secret** generated at setup, stored in the secure enclave, released only after biometric auth — so unlocking is "biometric → release device secret → `unwrapPrivateKey` → in-memory keypair." The crypto wrap/unwrap functions are reused verbatim.

> Open question for review: device-secret-behind-biometric vs. user passphrase vs. both. Recommendation: device secret behind biometric for UX, with an optional exportable encrypted backup (passphrase-wrapped) deferred to a later slice.

### 5.3 Identity state machine

Mirror the web `IdentityProvider` contract (`loading | no_identity | locked | unlocked`) so screen logic ports cleanly, backed by the secure-store adapter and `expo-local-authentication` for the biometric gate. Unwrapped keypair lives in React state/memory only; backgrounding or timeout drops it and returns to `locked`.

### 5.4 Recipient flow (foundation vertical)

Reuse the web reader's *logic* (`fetch-and-open` semantics: `GET` metadata for a safe preview, `POST .../open` to consume one open and fetch ciphertext, then local `open()` + `decodePayload()`), reimplemented with React Native primitives and the existing API client shape. Decoded attachments are written to a sandboxed cache dir via `expo-file-system` and opened/shared through the OS share sheet; text renders in a shielded reader. Screens follow `all_design_screens/mobile_secure_reader_aesmsg`.

### 5.5 Privacy shield

- **Screenshot/recents blocking:** `expo-screen-capture` (`preventScreenCaptureAsync`) on the reader; Android `FLAG_SECURE`, iOS app-switcher obscuring.
- **Background blur:** subscribe to `AppState`; render an opaque/blurred cover when not `active`.
- **Clipboard auto-clear:** 60s after copy, matching `DecryptedScreen`'s logic.

### 5.6 Deep links & OTA

- Universal Links (iOS `apple-app-site-association`) + Android App Links for `/l/:id`, configured via Expo `scheme`/`associatedDomains`/`intentFilters`. Web reader remains the fallback.
- Expo Updates configured so crypto/identity modules are **excluded from OTA** (or OTA disabled entirely for this app). Document the policy in `apps/mobile/README.md`.

## 6. Workspace & tooling

- `apps/mobile/` Expo app; TS strict; consumes `@aesmsg/crypto` (+ `payload.ts`). Biome covers it (extend `biome.json` ignore/globs as needed for RN). Vitest for pure logic (identity state machine, fetch-and-open adapter) under Hermes-like conditions; native UI smoke-tested manually + via Expo on device/simulator.
- New deps live in `apps/mobile` only — `expo`, `expo-secure-store`, `expo-local-authentication`, `expo-screen-capture`, `expo-file-system`, `expo-crypto`/`react-native-quick-crypto`. The monorepo crypto core gains **no** RN dependency.

## 7. Testing & acceptance

- Crypto-portability spike passes: web↔mobile ciphertext interop, all existing crypto tests green on the mobile crypto surface.
- Foundation vertical demoable on a simulator/device: setup identity → background/foreground returns to locked → biometric unlock → open a link created by the web app → decrypt → read with screenshot blocking + background blur → copy auto-clears → attachment downloads via share sheet.
- Wrong identity → clean decryption failure (no recovery), matching web semantics.

## 8. Rollout / sequencing

1. **Spike (gating):** prove `@hpke/core` + `@aesmsg/crypto` run on Hermes via the chosen Web Crypto surface. If it fails, escalate the §5.1 fallback before building UI.
2. App skeleton + identity (secure store + biometric + state machine) + My Public Key screen.
3. Recipient vertical (deep link → open → decrypt → shielded reader) reusing `payload.ts`.
4. Privacy shield + OTA policy.
5. Follow-up slices: mobile compose/send, file picking, contacts parity.

## 9. Risks

- **Web Crypto on Hermes (gating).** Mitigation: spike first; pure-JS fallback inside the crypto package as plan B, guarded by the interop fixture so the wire format never drifts.
- **Memory hygiene in JS.** Unwrapped keys can't be reliably zeroed in JS. Mitigation: minimize lifetime (biometric-gated, dropped on background/timeout); document the residual risk honestly.
- **OTA supply chain.** Mitigation: exclude crypto from OTA / disable OTA; document.
- **iOS screenshot blocking is best-effort** (no true API). Mitigation: obscure in app-switcher + honest disclosure, matching the product's no-false-promises voice.

## 10. Follow-up

A separate implementation plan (`docs/superpowers/plans/2026-05-29-mobile-app-foundation.md`) will break this into checklisted tasks once the spike de-risks §5.1 and this spec is approved.
