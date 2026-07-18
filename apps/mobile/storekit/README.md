# Testing the Pro subscription on the iOS Simulator

`aesmsg.storekit` is a **local StoreKit Configuration file**. It simulates the App Store entirely on
your machine — **no App Store Connect, no sandbox Apple ID, no real charges.** Purchases are instant
and you can force renewals / expiry / refunds from Xcode. It mirrors the two real products:

| Product ID | Price | Period |
|---|---|---|
| `com.aesmsg.app.pro.monthly` | €3.99 | 1 month |
| `com.aesmsg.app.pro.annual` | €37.99 | 1 year |

> The IDs match `PRODUCT_IDS` in `src/pro/entitlement-model.ts`. If you change them in one place, change them here too.

> [!IMPORTANT]
> **The `.storekit` file MUST match the schema version the installed Xcode writes.** This file is
> currently schema **v5.0** (what **Xcode 26.x** generates). Older schemas (e.g. **v3.0**) *load*
> under newer Xcode — the log even says "StoreKit testing enabled" — but Xcode extracts **zero
> products** from them, so the paywall is empty and purchases fail with **"SKU not found"**.
>
> Symptoms of a too-old schema: `fetchProducts` returns an empty list, the paywall shows no prices,
> or you hit "SKU not found" while the log shows StoreKit testing is on. **Fix:** regenerate the file
> via **File → New → File → StoreKit Configuration File** in your Xcode and re-enter the two products
> (see the table above / the recovery steps at the bottom).
>
> **Diagnose it from the log** (with the dev build running on the booted simulator):
> ```bash
> xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "ExpoIap"'
> ```
> Look for `fetchProducts result:` — a healthy config shows **2 products**; a too-old schema shows
> **0** (`fetchProducts result: []`).
>
> The `withStoreKitConfig` config plugin (registered in `app.config.ts`) now **auto-wires this file
> into the generated iOS scheme on `prebuild`** — copying it next to the `.xcodeproj`, adding it as a
> project member, and injecting the `<StoreKitConfigurationFileReference>` into the Run scheme. The
> manual "drag the file in + Edit Scheme → StoreKit Configuration" step below is therefore **no longer
> required**. You still build/run from **Xcode** for StoreKit testing (the local config never applies
> to an EAS build).

## Prerequisites

- A **development build** (a dev client), **not Expo Go** — `expo-iap` and the date picker are native
  modules Expo Go doesn't include.
- The local StoreKit config only applies when you **run from Xcode** (it's a scheme Run option). It is
  *not* carried by an EAS build — for EAS builds, test against real sandbox instead (or use the
  `DEV_FORCE_PRO` toggle below to see the gated UI).

## Steps

1. Generate the native project (from `apps/mobile`):
   ```bash
   npx expo prebuild -p ios
   ```
   (If `pod install` fails with `ld: library 'System' not found` on Xcode 26.5, use the macOS-SDK
   `SDKROOT`/`LIBRARY_PATH` workaround — see the project notes — then reopen the workspace.)
   The `withStoreKitConfig` plugin runs as part of this prebuild: it copies `aesmsg.storekit` into
   `ios/`, adds it to the Xcode project, and points the Run scheme at it automatically. Steps 3–4
   below are handled for you — they're kept only as a manual fallback if you ever rebuild the scheme
   by hand.
2. Open `ios/aesmsg.xcworkspace` in Xcode.
3. *(Now automatic — fallback only)* **Add this file to the project:** drag
   `apps/mobile/storekit/aesmsg.storekit` into the Xcode project navigator (or File → Add Files to
   "aesmsg"…). "Copy items if needed" is fine.
4. *(Now automatic — fallback only)* **Point the scheme at it:** Product → Scheme → Edit Scheme →
   **Run → Options → StoreKit Configuration → `aesmsg.storekit`**.
5. Pick an iPhone simulator and **Run** (▶).

## What to verify

- **Free**: attachment picker says "Up to 10 MB" and rejects an 11 MB file; the Expiry sheet has **no**
  "Custom…" row; Account shows the **Free** chip.
- **Buy**: Account → Upgrade to Pro → paywall shows **€3.99 / €37.99** → tap Upgrade → confirm in the
  local StoreKit sheet → Account flips to **Pro**, Manage shows "Pro · Annual" + a renewal date.
- **Pro**: attachment picker says "Up to 25 MB" and accepts a ~20 MB file; the Expiry sheet shows
  **Custom…** → pick a date/time → the compose summary reflects it.
- **Transitions**: Xcode **Debug → StoreKit → Manage Transactions** — expire or refund the subscription
  and confirm the app drops back to Free on next foreground; test **Restore purchases**.

## No-StoreKit shortcut (any build)

To exercise just the **Pro-gated UI** without a purchase (e.g. on an EAS build where this config can't
apply), open `src/pro/entitlement-context.tsx` and set `DEV_FORCE_PRO = true`. It's guarded by `__DEV__`
(stripped from release builds) so it can never ship — but **don't commit it set to `true`.** Save and
Fast Refresh flips the app to Pro. This does **not** test the purchase flow — use the StoreKit config
for that.

## If Xcode won't open `aesmsg.storekit`

The `.storekit` schema can drift across Xcode versions. If Xcode refuses this file, just create a fresh
one (File → New → File → **StoreKit Configuration File**) and enter the values from the table above:
one subscription group named **aesmsg Pro** with the two auto-renewable products (monthly P1M €3.99,
annual P1Y €37.99). Set the storefront to a Eurozone country (e.g. Germany) so prices show in €.
