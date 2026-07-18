# Mobile: aesmsg Pro subscription (native StoreKit 2 + Play Billing)

**Date:** 2026-06-02
**Status:** Proposed (pending review)
**Area:** `apps/mobile` (primary); `apps/api` + prod nginx (attachment-ceiling bump); `packages/design-tokens`/UI screens already exist

## Problem / context

The Account tab already ships presentational Pro screens — `PaywallScreen`, `ManageSubscriptionScreen`,
`UpgradeSuccessScreen` ([apps/mobile/src/account/](../../../apps/mobile/src/account/)) — migrated from
design screens 50–53. They render faithfully but are wired to nothing: `onSelectPlan` / `onRestore` are
follow-up no-ops, pricing comes from a static mock ([account-data.ts](../../../apps/mobile/src/account/account-data.ts)),
and the app is currently marked **free** in both stores. The "Upgrade to Pro" button does nothing.

We are introducing a real freemium **Pro** subscription. This spec covers the billing integration, the
entitlement model, the free-vs-Pro split, and the supporting infra change — all without compromising the
product's zero-knowledge invariants.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Billing transport | **Native StoreKit 2 + Play Billing**, no external service (no RevenueCat) | Keeps purchase events between the device and Apple/Google only — aligns with the minimal-trust brand |
| Native implementation | A maintained **client library** (`expo-iap` / `react-native-iap`) behind a thin TS interface | Talks directly to the OS billing APIs with no backend; far less native code than hand-rolling Swift/Kotlin |
| Entitlement enforcement | **100% client-side**; the API gains **no** identity and **no** Pro awareness | Preserves the zero-knowledge backend — the server still sees only ciphertext + metadata |
| Free-vs-Pro split | **Net-new / zero-clawback** — free stays exactly as generous as today; Pro adds new things | A trust-first product must not take away capabilities users already have |
| Platforms | iOS **and** Android | Both store pipelines already exist (TestFlight live; Play internal track published) |
| Pricing | **€3.99/mo**, **€37.99/yr** (≈ €3.17/mo, ~21% annual discount) | EUR analog of the already-designed $4 / $38; matches the user's "annual cheaper" intent |

## Goals

- Wire the three built Account screens to a real, native, no-third-party-service IAP flow on both stores.
- Derive a single `isPro` entitlement on-device from the store, cached for offline render, exposed via React context.
- Gate exactly the net-new Pro capabilities (custom expiry, larger attachments) through pure, testable helpers.
- Display **store-localized** prices (not a hardcoded number).
- Change nothing server-side about identity or trust; the only backend touch is raising the attachment ceiling.

## Non-goals (explicitly out of scope)

- **No RevenueCat or any external billing/entitlement service.**
- **No server-side accounts, receipt-forwarding, or server Pro-awareness.** The API cannot and must not
  distinguish Free from Pro callers.
- **No chunked/resumable/streaming upload pipeline.** The Pro attachment bump is a *constant raise*, not the
  object-storage streaming rewrite (which was considered and declined).
- **No multiple-attachments-per-message** and **no multi-recipient ("team credential handoff") links** in v1.
  These are the strongest future Pro levers but require trust-critical crypto/envelope work — deferred to v2
  (see *Roadmap to a meatier Pro*).
- **No multi-device key gating** ("up to 5 device keys") — multi-device identity isn't built.
- **No contacts cap.** Contacts are already unlimited; gating them would be pure clawback with weak pull.
- **No change to encryption** on any plan. Copy stays: "Your encryption is unchanged on every plan."

## Design

### 1. Pricing & store products

- One auto-renewable **subscription group** ("aesmsg Pro") containing two products under the app's bundle id:
  `pro.monthly` and `pro.annual`. Same group ⇒ users can switch interval (upgrade/downgrade/crossgrade).
- Base prices set in **EUR** (€3.99 / €37.99); Apple and Google **auto-localize** all other storefronts.
- The paywall renders the **store-localized `displayPrice`** from the live product query. The static
  `PRO_PRICING` in [account-data.ts](../../../apps/mobile/src/account/account-data.ts) is downgraded to an
  **offline fallback** only and updated to EUR. `account-format.ts` keeps computing the annual-savings badge.

### 2. Free-vs-Pro entitlement matrix

Net-new, zero-clawback. Free = today's behavior, unchanged.

| Capability | Free (unchanged) | Pro |
|---|---|---|
| Encryption (HPKE, local keys, zero-knowledge) | full, identical | full, identical |
| Text messages | ✓ | ✓ |
| Attachments | up to **10 MiB** (`MAX_ATTACHMENT_BYTES` today) | up to **25 MiB** *(net-new; infra bump §7)* |
| Expiry options | 10m / 1h / 24h / 7d / never | **+ custom date/time** *(net-new feature §6)* |
| Max opens | 1 / 5 / 10 / unlimited | same |
| Contacts | unlimited | unlimited |
| Support | standard | priority *(operational, non-software)* |

Two substantive ongoing-value unlocks (larger attachments + custom expiry) plus priority support. The larger
attachment in particular gives the subscription the *continuous* value App Store Review guideline 3.1.2 expects
of an auto-renewable subscription — a single cosmetic toggle would risk rejection.

### 3. `BillingService` abstraction

A single TS interface decouples the app from the store library and makes everything testable under the
node-env Vitest convention (no RN renderer; mock the native, per `apps/mobile` test conventions).

```ts
// apps/mobile/src/pro/billing-service.ts
export type Interval = "monthly" | "annual";

export interface PlanProduct {
  interval: Interval;
  productId: string;
  displayPrice: string;   // store-localized, e.g. "€3,99"
  priceMicros: number;    // for sorting/diagnostics only
  currencyCode: string;
}

export interface Entitlement {
  isPro: boolean;
  interval: Interval | null;
  renewsAt: Date | null;
  productId: string | null;
}

export interface BillingService {
  getProducts(): Promise<PlanProduct[]>;
  purchase(interval: Interval): Promise<Entitlement>;   // throws on user-cancel / store error
  restore(): Promise<Entitlement>;
  currentEntitlement(): Promise<Entitlement>;           // reads StoreKit currentEntitlements / Play queryPurchases
}
```

- **Production impl** wraps the chosen client library (`expo-iap` / `react-native-iap`). Exact library + version
  pinned during planning after confirming Expo SDK-56 compatibility and config-plugin support (we already use
  custom dev builds + config plugins, e.g. expo-camera, so a native module is fine).
- **Test impl** is a hand-written fake returning scripted entitlements/products.

### 4. `EntitlementProvider` (context + caching)

- A React context sibling to `identity-context`, exposing `{ isPro, interval, renewsAt, loading }`.
- Refreshes from `currentEntitlement()` on **app launch** and on **foreground** (AppState). The **store is the
  source of truth**.
- The last-known entitlement is cached in the existing **`EncryptedStore`** (device-only DEK) purely so the UI
  can render Pro state instantly/offline before the async store query resolves. The cache is never authoritative
  and never sent anywhere.
- A small pure **reducer** maps raw store purchase records → `Entitlement` (active sub present ⇒ `isPro`, etc.);
  unit-tested in isolation.

### 5. Pure gate helpers

```ts
// apps/mobile/src/pro/entitlements.ts  (pure, no React, fully unit-tested)
export function maxAttachmentBytes(isPro: boolean): number;     // 10 MiB | 25 MiB
export function allowsCustomExpiry(isPro: boolean): boolean;    // false | true
```

- **Attachments:** `pick-attachment.ts` stops using the module-level `MAX_ATTACHMENT_BYTES` constant for the
  policy decision and instead receives the tier limit from `maxAttachmentBytes(isPro)` (threaded from the
  compose flow, which reads the entitlement context). The constant remains as the **free** value.
- **Expiry:** the expiry sheet shows the existing presets to everyone and reveals the **custom** entry only when
  `allowsCustomExpiry(isPro)`.

### 6. Custom expiry (net-new feature)

- The seal path already accepts an arbitrary `expiresAt: Date` (`expiryToDate` maps presets to dates; custom just
  supplies the date directly), and the API stores an arbitrary expiry timestamp — so this is **mostly a UI
  addition**, not a protocol change.
- Add a "Custom…" row to the expiry sheet (Pro-only) opening a date/time picker. Validate bounds (min = a few
  minutes out, max = a sane ceiling, e.g. 1 year). Extend `ExpiryChoice` with a `{ custom: Date }` variant or a
  parallel `customExpiresAt` field carried through `CreateFlow`.
- Non-Pro users never see the row; a soft client gate, consistent with §8.

### 7. Larger Pro attachments + infra bump

To allow a 25 MiB plaintext attachment, raise the size ceilings along the whole path. The upload is
**base64-encoded ciphertext in a JSON body** (the ~1.4× ratio between today's `MAX_BODY_BYTES` 20 MiB and
`MAX_CIPHERTEXT_BYTES` 14 MiB reflects base64 + framing), so the body limit must clear `ciphertext × ~1.4`.

Target changes (exact bytes finalized in planning after measuring Padmé padding at this scale; confirm the
upload encoding is base64-in-JSON before fixing the body number):

| Location | Symbol | Today | Target |
|---|---|---|---|
| `apps/mobile/src/create/pick-attachment.ts:10` | `MAX_ATTACHMENT_BYTES` | 10 MiB | **tiered**: 10 MiB free / 25 MiB pro |
| `apps/api/src/handlers/messages-handler.ts:30` | `MAX_CIPHERTEXT_BYTES` | 14 MiB | ~**27 MiB** |
| `apps/api/src/handlers/messages-handler.ts:29` | `MAX_BODY_BYTES` | 20 MiB | ~**37 MiB** |
| `apps/api/src/server.ts:12` | `MAX_BODY_BYTES` (Fastify `bodyLimit`) | 21 MiB | ~**38 MiB** |
| prod nginx (Sproobo) | `client_max_body_size` | 20m | ~**40m** |

**Trade-offs documented:**

- Because the API cannot tell Pro from Free, this raises the **hard backstop for everyone**. The 25 MiB Pro limit
  is a **client-side soft gate**; the API's (raised) ceiling is only the absolute abuse/infra cap. A tampered free
  client could upload up to the new ceiling — acceptable for freemium, and the ceiling still bounds storage.
- Larger blobs mean bigger Postgres rows and ~35 MiB single-request uploads over cellular. Mitigated by expiry +
  revoke purging (ciphertext is removed when a link dies). Doing attachments *well* at much larger sizes is the
  deferred streaming project, not this bump.
- The **frozen interop vector is unaffected** — raising a max-size *validation bound* changes no byte of any given
  message's wire format.

### 8. Wiring the existing screens

- `PaywallScreen`: feed `getProducts()` for live prices; `onSelectPlan(interval)` → `purchase(interval)`;
  `onRestore` → `restore()`; on success route to `UpgradeSuccessScreen`; on cancel/error show a calm, non-blocking
  message (no scary copy). Reconcile the `PRO_FEATURES` / `UPGRADE_UNLOCKED` lists to the real §2 matrix — delete
  the "2 GB", "100 MB", "device keys", "unlimited contacts", "unlimited active links" claims.
- `ManageSubscriptionScreen`: render live `interval` + `renewsAt`; "Manage"/"Cancel" deep-links to the OS
  subscription settings (StoreKit `showManageSubscriptions` / Play subscriptions URL). No custom cancel UI.
- `AccountScreen`: the plan chip + "Upgrade to Pro" / "Manage subscription" reflect the live entitlement.

### 9. Restore, renewal, grace, edge cases

- **Restore** = `restore()` re-queries current entitlements (StoreKit `currentEntitlements`, Play
  `queryPurchasesAsync`). Required by both stores.
- **Renewals / grace periods / billing retry / refunds / Ask-to-Buy** are reflected by re-reading the store's
  entitlement state on launch/foreground — we store no subscription state of our own beyond the render cache.
- **Family Sharing** (if enabled on the product) is honored automatically by the store entitlement.
- **Downgrade to expired:** when the store reports no active entitlement, the app reverts to Free; in-flight links
  created with Pro options are unaffected (they're already sealed/stored).

### 10. Testing

Per `apps/mobile` conventions (node-env Vitest, DI + `vi.mock` for natives, no React renderer, pure logic extracted):

- `entitlements.ts` gate helpers — exhaustive unit tests.
- The store-record → `Entitlement` reducer — unit tests across active/expired/grace/no-purchase inputs.
- `pick-attachment.ts` size policy at the tier boundary (just-under / just-over 10 MiB free, 25 MiB pro).
- Custom-expiry bounds validation.
- `BillingService` consumers tested against the fake; the production library wrapper is thin and exercised
  manually on-device.
- API: extend the existing size-limit tests in `apps/api` for the new ceilings (min still 32 bytes; new max).

### 11. Store / business prerequisites (gating launch, not the build)

- **App Store Connect:** sign the Paid Applications agreement; complete banking + tax; create the subscription
  group + two products; provide localized metadata + review screenshot. Sandbox testers for QA.
- **Google Play Console:** set up a payments/merchant profile; create the subscription with monthly + annual base
  plans; license testers for QA.
- The app stays **"free to download, with in-app purchases"** — it does **not** become a paid app.

## Security & zero-knowledge analysis

- **No new server identity.** Entitlement is derived entirely on-device from the store receipt; the API is
  untouched and still cannot link a request to a person or a plan. Zero-knowledge invariants hold.
- **No third party** sees purchase data beyond Apple/Google (no RevenueCat). The store sees an anonymous
  store-account ↔ purchase, never message content, never the user's PKI identity.
- **Soft client gate** is the correct model here: hard server enforcement is impossible without identity, and we
  refuse to add identity. The infra ceiling is the only hard bound and it protects storage/abuse for all tiers.
- **Render cache** lives in the existing EncryptedStore (device-only DEK) and is never authoritative or exfiltrated.

## Roadmap to a meatier Pro (v2 candidates, not this spec)

The v1 Pro is intentionally lean and honest. The levers that would give it real teeth — and which justify holding
or raising the price — are deferred because they touch trust-critical or infra-heavy areas:

1. **Multi-recipient / "team credential handoff" links** — seal one link to several contacts at once. The marquee
   B2B feature; requires careful `packages/crypto` envelope work + interop-vector preservation.
2. **Multiple attachments per message** — envelope work; free stays single-attachment.
3. **Attachments done well at large sizes** — the declined streaming/object-storage upload pipeline.

## Open questions / planning notes

- Confirm `expo-iap` vs `react-native-iap` for Expo SDK-56 + config-plugin + StoreKit 2 / Play Billing v6/v7
  support; pin a version.
- Confirm the upload encoding (base64-in-JSON assumed) before fixing the exact `MAX_BODY_BYTES` target.
- Decide the custom-expiry max bound (proposed: 1 year).
- Verify the prod nginx `client_max_body_size` is set on the Sproobo box that fronts `api.aesmsg.com` and bump it
  in lockstep with the API constants (raising the app/API without nginx would 413 at the edge).
