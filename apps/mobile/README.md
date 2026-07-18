# @aesmsg/mobile

aesmsg's native mobile app (React Native / Expo). Implements [Slice 12 — mobile app foundation](../../docs/superpowers/plans/2026-05-29-mobile-app-foundation.md): on-device HPKE via the shared `@aesmsg/crypto` core, hardware-backed identity behind a biometric gate, and the recipient flow (open a `/l/:id` link → decrypt locally → read with the privacy shield).

> **Status: foundation implemented and verified.** The gating crypto-portability spike passed on an iOS simulator — `@hpke/core` + `@aesmsg/crypto` run on Hermes; `crypto.subtle` lacks X25519 there, so the pure-JS noble fallbacks inside `@aesmsg/crypto` (guarded by the RFC 9180 interop fixture, **no wire-format change**) are auto-selected. The recipient vertical (identity, reader, shield, attachments, deep links) is implemented with 100+ Node-unit tests, the full app Metro-bundles and boots on the simulator, and web↔mobile ciphertext interop is proven against the live server. The remaining **in-UI tap-through acceptance** (biometric, share sheet, background-lock) is a manual checklist — see [On-device acceptance](#on-device-acceptance-task-11) below.

## Getting started

```bash
pnpm install            # from the repo root (requires network access to the Expo/npm registry)
pnpm --filter @aesmsg/mobile start       # Expo dev server
pnpm --filter @aesmsg/mobile ios         # or: android
```

Configure the backend the app talks to — the standalone **Fastify message API** in [`apps/api`](../api) (`/api/messages/*`), **not** the web app, which is a static bouncer with no API — via env at build time:

```bash
AESMSG_HOST=app.aesmsg.example \
AESMSG_API_BASE_URL=https://app.aesmsg.example \
  pnpm --filter @aesmsg/mobile start
```

## Architecture

- **Crypto.** Reuses `@aesmsg/crypto` unchanged (`seal/open`, `wrapPrivateKey/unwrapPrivateKey`, `encodePayload/decodePayload`). The Web Crypto polyfill is installed as the first statement in `index.ts`.
- **Identity.** `wrapPrivateKey`'s secret is a device secret stored in the hardware keystore (`expo-secure-store`) released only after biometric auth (`expo-local-authentication`); the wrapped envelope itself is the same format the web app produces. Unwrapped keys live in memory only and are dropped on lock/background.
- **Recipient flow.** `src/navigation/ReaderFlow.tsx` mirrors the web reader state machine; `src/reader/fetch-and-open.ts` mirrors the web decrypt logic and decodes the payload envelope so attachments come through.
- **Privacy shield.** `src/shield/usePrivacyShield.ts` blocks screenshots (`expo-screen-capture`), covers the app when backgrounded, and auto-clears the clipboard after 60s.

## On-device acceptance (Task 11)

The crypto, the full-app Metro bundle, deep-link scheme registration, and web↔mobile interop (against the live web API) are **automatically verified**. The remaining steps require on-screen taps + a biometric prompt, so they are a **manual checklist** on a booted simulator/device.

### Local dev build (sim talks to a local web app)

```bash
# 1. Run the Fastify message API (apps/api). From the repo root:
pnpm dev:api                              # Fastify on http://localhost:4000
#    (in-memory stores by default; add DATABASE_URL + REDIS_URL to hit Postgres/Redis)

# 2. Build the mobile app pointed at the local API.  From apps/mobile:
#    - AESMSG_API_BASE_URL overrides the API base AND, being a cleartext http:// URL,
#      makes app.config.ts auto-enable iOS local-networking ATS for this dev build only
#      (a release https build never gets the exception) — nothing to hand-edit.
#    - SDKROOT works around an expo-modules-jsi pod-build failure on Xcode 26.x
#      ("ld: library 'System' not found" — a bare clang invocation with no -isysroot).
AESMSG_API_BASE_URL=http://localhost:4000 \
SDKROOT="$(xcrun --sdk macosx --show-sdk-path)" \
  npx expo run:ios --device "<simulator-udid>"
```

Pointing the build at a cleartext `http://` API (the `AESMSG_API_BASE_URL` above) makes `app.config.ts` auto-add the iOS `NSAllowsLocalNetworking` ATS exception **for that build only** — a release build (https) never gets it, so there is nothing to hand-edit and nothing that weakens production. (`expo run:ios` may print a non-fatal `osascript`/System Events error at the very end while activating the Simulator window — the build/install already succeeded; if needed, launch with `xcrun simctl launch <udid> com.aesmsg.app`.)

### Rebuilding after a native dependency change

`apps/mobile` uses native modules (`react-native-quick-crypto` with its `react-native-quick-base64` / `react-native-nitro-modules` peers, `expo-secure-store`, `expo-local-authentication`, …). Adding or changing any of them — **or pulling a branch that does** — means the **native binary must be recompiled**, not just Metro-reloaded. A stale binary (new JS, old app) crashes at startup with e.g.:

```
Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'QuickBase64' could not be found
```

— the JS Metro is serving needs a native module the installed app was built without. Fix with a clean native rebuild:

```bash
cd apps/mobile
npx expo prebuild --clean --platform ios                     # regenerate ios/, re-autolink the pods
SDKROOT="$(xcrun --sdk macosx --show-sdk-path)" npx expo run:ios
grep -i "quick-base64\|quick-crypto\|NitroModules" ios/Podfile.lock   # confirm the pods linked
```

This is a JS↔native sync issue, not a code bug — a full rebuild once the dependency is installed resolves it. (The harmless `@noble/hashes/crypto.js` "not listed in exports" Metro WARN is unrelated — it falls back to file-based resolution and bundles fine.)

### Manual checklist (enroll Face ID first: Simulator → Features → Face ID → Enrolled)

1. **Setup identity.** Tap **Create identity** → at the Face ID prompt choose **Features → Face ID → Matching Face** → the **My Public Key** screen appears with the truncated fingerprint (JetBrains Mono) + a QR. Tap **Copy public key**.
2. **Mint a link for this device.** `xcrun simctl pbpaste <udid>` gives the device's public key. Seal a message to it from another aesmsg client — or a small Node script using `@aesmsg/crypto` (`encodePayload` → `seal` with the `MessageBindingContext` → `POST /api/messages` on the Fastify API) — and note the returned id. Mint a second link sealed to a *different* random key for the wrong-identity case.
3. **Open + decrypt (criteria 4, 5, 8).** `xcrun simctl openurl <udid> "aesmsg://l/<id>"` → tap **Open** on the OS prompt → Landing ("Sealed for" shows your fingerprint, no mismatch) → **Open Message** → the reader shows the text. Tap an attachment → the OS **share sheet** appears (download-only, no inline preview).
4. **Clipboard auto-clear (criterion 6).** In the reader tap **Copy**; `xcrun simctl pbpaste <udid>` shows the text; after 60s it is cleared (`CLIPBOARD_CLEAR_MS = 60_000`).
5. **Background → lock (criteria 2, 3).** Tap **Done**, background the app (**Device → Home**), reopen → the **Unlock** screen appears (auto-lock fires on `background`, not on transient `inactive`). Tap **Unlock** → **Features → Face ID → Matching Face** → unlocked.
6. **Wrong identity (criterion 7).** `openurl` the second link → Landing shows the amber "different identity" warning → **Open Message** → the opaque **Decryption failed** screen (no metadata, no recovery affordance).

A Face ID *match* can be posted headlessly with `xcrun simctl spawn <udid> notifyutil -p com.apple.BiometricKit_Sim.pearl.match` **while a prompt is on screen**, but the button taps that raise the prompt need a GUI or a UI driver (`idb`/`maestro`/`appium`) not assumed here.

## Deep-link acceptance

`app.config.ts` declares the universal/app-link intent (iOS `associatedDomains: applinks:<host>`, Android `intentFilters` with `pathPrefix: "/l/"` and `autoVerify: true`). That is only the **client half** of the handshake. The OS will not verify the links — and tapping `https://<host>/l/<id>` will open the browser instead of the app — until the matching files are served from the host, which `app.config.ts` does **not** produce.

**External deployment prerequisites (NOT generated by `app.config.ts` — must be deployed server-side by whoever owns `<host>`):**

- `https://<host>/.well-known/apple-app-site-association` — served as `application/json`, no redirects, with an `appID` of `<AppleTeamID>.com.aesmsg.app` and `components`/`paths` scoped to `/l/*` only. The **Apple Team ID** is an external value (from the Apple Developer account) not known to this repo.
- `https://<host>/.well-known/assetlinks.json` — declares `package_name: com.aesmsg.app` plus the **release signing key SHA-256 fingerprint**. That fingerprint comes from the Android **keystore** used to sign the production build (e.g. `keytool -list -v -keystore <release.keystore>`) and is likewise external to this repo.

**Manual acceptance steps** (run once the AASA + assetlinks files above are live):

1. Build/run with the **real** host, not the placeholder default:
   ```bash
   AESMSG_HOST=app.aesmsg.com \
   AESMSG_API_BASE_URL=https://app.aesmsg.com \
     pnpm --filter @aesmsg/mobile ios   # or: android
   ```
   The host you pass here MUST match the host serving the AASA/assetlinks files.
2. Install that build on a device (a real install, not just a Metro reload — iOS only fetches the AASA at install time, Android verifies App Links on install).
3. From **another app** (Notes, Messages, an email), tap a link of the form `https://<host>/l/<id>`.
4. Expected: aesmsg opens (not the browser) and lands in the recipient/reader flow — biometric gate → reader landing → **Open**. Verify the public preview/GET did **not** consume an open (the open is only consumed by the explicit in-app Open action).
5. Uninstall the app, then tap the same link again. Expected fallback: the link opens the **static web bouncer** at `apps/web/app/l/[id]` (`https://<host>/l/<id>` in a browser). The bouncer does **not** decrypt — it makes no backend call and never fetches ciphertext; it only offers to open the app or download it from the stores. Decryption always happens in the native app.

If step 3 opens the browser instead of the app, the cause is almost always the server-side AASA/assetlinks files (missing, wrong content type, wrong `appID`/`package_name`, or wrong SHA-256) — not the client config.

## OTA policy

Over-the-air updates are **disabled** for this app (`app.config.ts` → `updates.enabled: false`). A zero-knowledge product must not allow any module touching crypto or key material to be hot-swapped without app-store review — that is exactly the supply-chain trust the product defeats. If OTA is ever enabled for non-crypto UI, crypto/identity modules must remain excluded. The `expo-updates` package is deliberately **not installed** (supply-chain concern), so re-adding it — and thereby reopening the hot-swap surface — must be a conscious, reviewed decision, never an autofix or dependency-doctor suggestion.

## Store builds (EAS) & TestFlight

Release and beta builds use **EAS Build** (cloud) + **EAS Submit**, configured in [`eas.json`](./eas.json). Expo Go is not usable — the native modules (`react-native-quick-crypto`, `expo-secure-store`, …) mean every build is a custom native build.

The CLI is intentionally **not** a repo dependency (keeps the install tree lean). Install it globally, or run via `npx`:

```bash
npm i -g eas-cli        # or: npx eas-cli@latest <cmd>
```

### One-time project link

`eas.json` is committed, but the binding to an Expo account lives in `app.config.ts → extra.eas.projectId`, which is account-specific and **not** committed. Run once with the account that will own the builds:

```bash
cd apps/mobile
eas init                # prints a projectId
```

Then in `app.config.ts`: set a config-root `owner: "<expo-account-or-org-slug>"` and uncomment `extra.eas.projectId` with the printed id (there's a commented placeholder there).

### Build profiles (`eas.json`)

| Profile | Distribution | API / host | Use |
|---|---|---|---|
| `development` | internal · dev client · iOS simulator | `app.config.ts` defaults (prod) | Dev-client builds. Local-API testing stays the `expo run:ios` + inline-env flow above. |
| `preview` | internal (installs off-store) | `api.aesmsg.com` / `aesmsg.com` | Ad-hoc (iOS) / APK (Android) builds for testers without going through the stores. |
| `production` | store | `api.aesmsg.com` / `aesmsg.com` | The TestFlight / Play build. |

Build numbers auto-increment (`cli.appVersionSource: "remote"` — required because the dynamic `app.config.ts` can't be rewritten locally); the human-facing version (`1.0.0`) is set in `app.config.ts`.

### First TestFlight / Play internal build

```bash
# iOS — EAS generates the distribution certificate + provisioning profile on first run
eas build  --profile production --platform ios
eas submit --profile production --platform ios       # → App Store Connect → TestFlight (internal)

# Android — EAS generates the upload keystore on first run
eas build  --profile production --platform android
eas submit --profile production --platform android   # → Play internal testing track
```

`eas.json → submit.production` is already wired for both platforms:

- **iOS** — `ascAppId` (the app's numeric App Store Connect Apple ID) + `appleTeamId` are filled in.
- **Android** — `serviceAccountKeyPath` is `./play-service-account.json`. You still have to **place that
  file** (the Google Play service-account JSON with release/API access) at `apps/mobile/play-service-account.json`.
  It is **gitignored** (`play-service-account.json` / `*-service-account.json` patterns) — never commit it.
  See [Android release walkthrough](#android-release-walkthrough-first-build--submit) for how to mint it.

> **Encryption export compliance is pre-answered.** `app.config.ts` sets `ITSAppUsesNonExemptEncryption: false` (standard crypto, exempt), so TestFlight uploads won't stall on the compliance question and no per-build docs are needed. Revisit with legal if distributing from the US — an annual BIS self-classification report may still apply.

> **Android App Links need the release key fingerprint.** With EAS-managed credentials, read the production keystore's SHA-256 from `eas credentials` (Android → production) and place it in the server-side `.well-known/assetlinks.json` (see [Deep-link acceptance](#deep-link-acceptance) above). The iOS `apple-app-site-association` likewise needs the Apple **Team ID** in its `appID`.

### Android release walkthrough (first build & submit)

The Android store flow mirrors iOS, with **two Google-side prerequisites** that must exist before
`eas submit` can reach the Play API — and **one hard gotcha**: Google Play rejects the **first**
build over the API; it must be uploaded by hand once through the Play Console UI.

**Prerequisites (one-time, in the browser — not done by EAS):**

1. **Create the app in the Google Play Console** (requires a paid Google Play Developer account,
   $25 one-time). Play Console → **Create app** → app name `aesmsg`. The package name
   `com.aesmsg.app` is locked in by the first uploaded build (it must match `app.config.ts →
   android.package`).
2. **Create a Google Cloud service account with Play release access and download its JSON key:**
   - Play Console → **Setup → API access** → link (or create) a Google Cloud project → **Create
     service account** (jumps to Google Cloud IAM) → create it → back in Play Console, **Grant
     access** to that account with at least **Release apps to testing tracks** (Account-level Admin
     is unnecessary; release perms are enough for `eas submit`).
   - Google Cloud Console → **IAM & Admin → Service Accounts → <that account> → Keys → Add key →
     Create new key → JSON** → download.
   - Save the downloaded file as **`apps/mobile/play-service-account.json`** — the exact path
     `eas.json → submit.production.android.serviceAccountKeyPath` points at, and a filename the
     repo's `.gitignore` already excludes. **Never commit it.**

**Build the production `.aab` (accept the EAS-managed keystore):**

```bash
cd apps/mobile
eas build --profile production --platform android
# First run: EAS prompts "Generate a new Android Keystore?" → Yes. EAS creates + stores the upload
# keystore for you (its SHA-256 is read later for assetlinks.json). Output is a signed .aab.
```

`production` distribution builds an **`.aab`** (Android App Bundle — the Play Store format, not an
installable APK; the `preview` profile builds an APK for off-store testers).

**⚠️ Gotcha — the FIRST `.aab` must be uploaded manually; `eas submit` cannot create it.**
The Google Play Developer API only pushes to an app that already has ≥1 build uploaded through the
web UI, so for the **very first** release:

1. Get the `.aab`: the `eas build` output prints a build-details URL; open it and **Download build**
   (or `eas build:list` → open the build → Download).
2. Play Console → **aesmsg** → **Testing → Internal testing → Create new release** → **Upload** the
   `.aab` → review and roll out to the internal track once.

That one manual upload unlocks the API. **Every release after the first** can go through EAS:

```bash
eas submit --profile production --platform android   # → Play internal-testing track, via the service account
```

(`submit.production.android.track` is `internal` in `eas.json` — bump it to `production`/`beta` when
you graduate off internal testing.)

**Release-key SHA-256 → server-side `assetlinks.json`.** Android App Links only verify once
`https://aesmsg.com/.well-known/assetlinks.json` carries the **release signing key** fingerprint.
With the EAS-managed keystore, read it from:

```bash
cd apps/mobile
eas credentials
# Pick: Android → production → Keystore → shows "SHA256 Fingerprint: AB:CD:…"
# (or non-interactive: eas credentials --platform android, then choose the production profile)
```

Copy that **SHA-256** into the `sha256_cert_fingerprints` array in
[`apps/web/public/.well-known/assetlinks.json`](../web/public/.well-known/assetlinks.json), replacing
the `REPLACE_WITH_RELEASE_SIGNING_SHA256` placeholder, then deploy `apps/web` so `aesmsg.com` serves
it. Verify with `curl https://aesmsg.com/.well-known/assetlinks.json` or Google's
[Statement List Generator](https://developers.google.com/digital-asset-links/tools/generator).

> **Play App Signing adds a second key.** When the app is enrolled in **Play App Signing** (default
> for new apps), Google re-signs with an *app signing key* that differs from your *upload key*. The
> fingerprint Android App Links actually check is the **app signing key's** SHA-256 — find it under
> Play Console → **Setup → App integrity → App signing**. If link verification fails after using the
> `eas credentials` (upload-key) fingerprint, add the app-signing-key SHA-256 to the
> `sha256_cert_fingerprints` array as well (the array may hold multiple fingerprints).
