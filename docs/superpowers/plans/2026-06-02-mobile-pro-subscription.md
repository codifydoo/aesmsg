# aesmsg Pro Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the presentational Account/Pro screens into a working freemium subscription — native StoreKit 2 + Play Billing via `expo-iap`, with all Pro entitlements enforced on-device so the zero-knowledge backend is untouched.

**Architecture:** A thin native boundary (`expo-iap`'s `useIAP` hook inside an `EntitlementProvider`) feeds **pure, fully-tested mapper functions** that derive a single `Entitlement` value. Pure gate helpers (`maxAttachmentBytes`, `allowsCustomExpiry`) consume `isPro` and are wired into the attachment picker and expiry sheet. The store is the only source of truth (StoreKit/Play cache entitlements on-device, so no app-side cache is needed). The API gains no identity — the only backend change is raising the attachment size ceiling, which applies to all callers (the Pro limit is a client-side soft gate above a shared infra backstop).

**Tech Stack:** Expo SDK 56, React Native, TypeScript (strict, `exactOptionalPropertyTypes`), `expo-iap` v3.x (StoreKit 2 + Play Billing 8.x), `@react-native-community/datetimepicker`, Vitest (node-env, no RN renderer — natives are dependency-injected or mocked), Fastify (apps/api).

**Spec:** [docs/superpowers/specs/2026-06-02-mobile-pro-subscription-design.md](../specs/2026-06-02-mobile-pro-subscription-design.md)

---

## Refinements discovered during planning (vs. the spec)

- **No app-side entitlement cache.** StoreKit 2 / Play Billing already cache entitlements on-device and answer `getActiveSubscriptions()` offline. The spec's "EncryptedStore render cache" is therefore dropped — it would also need the DEK (unlock) and add complexity for no gain.
- **Boundary types isolate `expo-iap`.** Pure mappers operate on minimal local shapes (`ActiveSubscriptionInput`, `ProductInput`); the provider maps `expo-iap`'s results into them at the native edge. This keeps all logic unit-testable and stable against `expo-iap` field-name details.
- **Body-limit math:** the upload is base64-encoded ciphertext in JSON (the ~1.4× ratio between `MAX_BODY_BYTES` 20 MiB and `MAX_CIPHERTEXT_BYTES` 14 MiB confirms it), so a 25 MiB plaintext attachment (~25.5 MiB ciphertext) needs a body limit of ~35 MiB. Numbers below reflect this.

## File structure

> **Mobile test convention (verified):** `apps/mobile/vitest.config.ts` sets `include: ["tests/**/*.test.ts"]`, `environment: "node"`, `setupFiles: ["./tests/setup.ts"]`. Tests live under **`apps/mobile/tests/`**, NOT co-located in `src/`. The `@` alias resolves to the mobile root, so test imports use `@/src/...`. Source files below go in `src/pro/`; their tests go in `tests/`.

**New source files (apps/mobile/src/pro/):**
- `entitlements.ts` — pure gate helpers + free/pro constants (`maxAttachmentBytes`, `allowsCustomExpiry`).
- `entitlement-model.ts` — types (`Interval`, `Entitlement`, `PlanProduct`), product-id constants, pure mappers (`toEntitlement`, `toPlanProducts`, `intervalForProduct`).
- `entitlement-context.tsx` — `EntitlementProvider` + `useEntitlement()` (uses `expo-iap` `useIAP`; AppState refresh).
- `custom-expiry.ts` — pure custom-expiry bounds validation + label.

**New test files (apps/mobile/tests/):**
- `tests/entitlements.test.ts`, `tests/entitlement-model.test.ts`, `tests/custom-expiry.test.ts`

**Modified files:**
- `apps/mobile/package.json` — add `expo-iap`, `@react-native-community/datetimepicker`.
- `apps/mobile/app.config.ts` — register the two config plugins.
- `apps/mobile/App.tsx` — wrap the tree in `EntitlementProvider`.
- `apps/mobile/src/create/pick-attachment.ts` — `validateAttachmentSize`/pickers take a `maxBytes` param.
- `apps/mobile/src/create/AttachmentPickerSheet.tsx` — `maxBytes` prop.
- `apps/mobile/src/create/ComposeScreen.tsx` — read `useEntitlement()`; pass `maxBytes`; custom-expiry state.
- `apps/mobile/src/create/ExpirySelectorSheet.tsx` — Pro-only "Custom…" row + date picker.
- `apps/mobile/src/account/account-data.ts` — EUR pricing; reconcile feature lists to the real matrix.
- `apps/mobile/src/account/AccountFlow.tsx` — replace mock plan state with `useEntitlement()` + real purchase/restore.
- `apps/mobile/src/account/PaywallScreen.tsx` — live products; wire purchase/restore.
- `apps/mobile/src/account/ManageSubscriptionScreen.tsx` — live plan; OS deep-links for change/cancel.
- `apps/api/src/handlers/messages-handler.ts` — raise `MAX_CIPHERTEXT_BYTES`, `MAX_BODY_BYTES`.
- `apps/api/src/server.ts` — raise Fastify `bodyLimit`.
- `apps/api/src/handlers/messages-handler.test.ts` (or existing size test) — new ceilings.

**Ops (manual, documented in Task 11):** prod nginx `client_max_body_size`; App Store Connect + Play Console product setup.

---

### Task 1: Pure gate helpers (`entitlements.ts`)

**Files:**
- Create: `apps/mobile/src/pro/entitlements.ts`
- Test: `apps/mobile/src/pro/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/pro/entitlements.test.ts
import { describe, expect, it } from "vitest";
import {
  FREE_ATTACHMENT_BYTES,
  PRO_ATTACHMENT_BYTES,
  allowsCustomExpiry,
  maxAttachmentBytes,
} from "@/src/pro/entitlements";

describe("entitlements gate helpers", () => {
  it("free attachment cap is today's 10 MiB; pro is 25 MiB", () => {
    expect(FREE_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(PRO_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });

  it("maxAttachmentBytes returns the free cap for non-pro and the pro cap for pro", () => {
    expect(maxAttachmentBytes(false)).toBe(FREE_ATTACHMENT_BYTES);
    expect(maxAttachmentBytes(true)).toBe(PRO_ATTACHMENT_BYTES);
  });

  it("custom expiry is pro-only", () => {
    expect(allowsCustomExpiry(false)).toBe(false);
    expect(allowsCustomExpiry(true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test entitlements`
Expected: FAIL — cannot resolve `@/src/pro/entitlements`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/pro/entitlements.ts
// Pure Pro/Free gate policy. No React, no native, no I/O — every gate is a pure function of `isPro`
// so it is unit-tested in plain Node and reused identically by the compose flow and the picker.
//
// Net-new / zero-clawback split (see the design spec): FREE keeps exactly today's behavior; PRO adds
// a larger attachment ceiling and custom expiry. Both gates are CLIENT-SIDE — the API has no identity
// and cannot tell Pro from Free, so these only shape the UI; the API's own ceiling is the hard cap.

/** Today's universal attachment cap (unchanged) — the FREE tier value. Mirrors the historical
 *  MAX_ATTACHMENT_BYTES in create/pick-attachment.ts. */
export const FREE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** PRO attachment cap. Requires the raised API/infra ceiling (see Task 3) — the API hard cap must be
 *  >= this value. */
export const PRO_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Max bytes a single attachment may be for the given tier. */
export function maxAttachmentBytes(isPro: boolean): number {
  return isPro ? PRO_ATTACHMENT_BYTES : FREE_ATTACHMENT_BYTES;
}

/** Whether the user may pick an arbitrary custom expiry date/time (Pro-only). */
export function allowsCustomExpiry(isPro: boolean): boolean {
  return isPro;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test entitlements`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/pro/entitlements.ts apps/mobile/src/pro/entitlements.test.ts
git commit -m "feat(mobile): pure Pro/Free gate helpers"
```

---

### Task 2: Entitlement model + pure store mappers (`entitlement-model.ts`)

**Files:**
- Create: `apps/mobile/src/pro/entitlement-model.ts`
- Test: `apps/mobile/src/pro/entitlement-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/pro/entitlement-model.test.ts
import { describe, expect, it } from "vitest";
import {
  FREE_ENTITLEMENT,
  PRODUCT_IDS,
  intervalForProduct,
  toEntitlement,
  toPlanProducts,
} from "@/src/pro/entitlement-model";

describe("intervalForProduct", () => {
  it("maps known product ids to intervals, unknown to null", () => {
    expect(intervalForProduct(PRODUCT_IDS.monthly)).toBe("monthly");
    expect(intervalForProduct(PRODUCT_IDS.annual)).toBe("annual");
    expect(intervalForProduct("com.other.thing")).toBeNull();
  });
});

describe("toEntitlement", () => {
  it("returns FREE when there are no active subscriptions", () => {
    expect(toEntitlement([])).toEqual(FREE_ENTITLEMENT);
  });

  it("ignores subscriptions that are not an aesmsg Pro product", () => {
    expect(toEntitlement([{ productId: "com.other.thing", expiresAtMs: null }])).toEqual(
      FREE_ENTITLEMENT,
    );
  });

  it("derives isPro + interval + renewsAt from an active aesmsg Pro subscription", () => {
    const expires = Date.UTC(2027, 4, 30);
    const ent = toEntitlement([{ productId: PRODUCT_IDS.annual, expiresAtMs: expires }]);
    expect(ent.isPro).toBe(true);
    expect(ent.interval).toBe("annual");
    expect(ent.productId).toBe(PRODUCT_IDS.annual);
    expect(ent.renewsAt?.getTime()).toBe(expires);
  });

  it("tolerates a missing expiry (Android may omit it) → isPro with null renewsAt", () => {
    const ent = toEntitlement([{ productId: PRODUCT_IDS.monthly }]);
    expect(ent.isPro).toBe(true);
    expect(ent.interval).toBe("monthly");
    expect(ent.renewsAt).toBeNull();
  });
});

describe("toPlanProducts", () => {
  it("maps store products to PlanProducts keyed by interval, dropping unknown ids", () => {
    const products = toPlanProducts([
      { id: PRODUCT_IDS.monthly, displayPrice: "€3,99", currencyCode: "EUR" },
      { id: PRODUCT_IDS.annual, displayPrice: "€37,99", currencyCode: "EUR" },
      { id: "com.other.thing", displayPrice: "€1,00", currencyCode: "EUR" },
    ]);
    expect(products).toHaveLength(2);
    expect(products.find((p) => p.interval === "monthly")?.displayPrice).toBe("€3,99");
    expect(products.find((p) => p.interval === "annual")?.currencyCode).toBe("EUR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test entitlement-model`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/pro/entitlement-model.ts
// Pure model + mappers for the Pro subscription. Decoupled from expo-iap by deliberately small
// boundary input types (ActiveSubscriptionInput / ProductInput): the provider maps expo-iap's hook
// results into these at the native edge, so all derivation logic is unit-tested in plain Node and is
// stable against expo-iap field-name changes.

export type Interval = "monthly" | "annual";

/** The aesmsg Pro auto-renewable products, under the app bundle id (app.config.ts: com.aesmsg.app). */
export const PRODUCT_IDS = {
  monthly: "com.aesmsg.app.pro.monthly",
  annual: "com.aesmsg.app.pro.annual",
} as const;

export const ALL_PRODUCT_IDS: readonly string[] = [PRODUCT_IDS.monthly, PRODUCT_IDS.annual];

/** The single derived entitlement the app reasons about. */
export interface Entitlement {
  isPro: boolean;
  interval: Interval | null;
  renewsAt: Date | null;
  productId: string | null;
}

export const FREE_ENTITLEMENT: Entitlement = {
  isPro: false,
  interval: null,
  renewsAt: null,
  productId: null,
};

/** A priced product for the paywall (store-localized). */
export interface PlanProduct {
  interval: Interval;
  productId: string;
  displayPrice: string;
  currencyCode: string;
}

/** Minimal shape the provider maps an active store subscription into. */
export interface ActiveSubscriptionInput {
  productId: string;
  /** Epoch ms when the current period ends (StoreKit expirationDateIOS). May be absent on Android. */
  expiresAtMs?: number | null;
}

/** Minimal shape the provider maps a fetched store product into. */
export interface ProductInput {
  id: string;
  displayPrice: string;
  currencyCode: string;
}

export function intervalForProduct(productId: string): Interval | null {
  if (productId === PRODUCT_IDS.monthly) return "monthly";
  if (productId === PRODUCT_IDS.annual) return "annual";
  return null;
}

/** Derive the entitlement from the store's active subscriptions. First aesmsg Pro sub wins. */
export function toEntitlement(active: ActiveSubscriptionInput[]): Entitlement {
  for (const sub of active) {
    const interval = intervalForProduct(sub.productId);
    if (interval === null) continue;
    const ms = sub.expiresAtMs ?? null;
    return {
      isPro: true,
      interval,
      renewsAt: ms != null && Number.isFinite(ms) ? new Date(ms) : null,
      productId: sub.productId,
    };
  }
  return FREE_ENTITLEMENT;
}

/** Map fetched store products to PlanProducts, dropping anything that isn't an aesmsg Pro product. */
export function toPlanProducts(products: ProductInput[]): PlanProduct[] {
  const out: PlanProduct[] = [];
  for (const p of products) {
    const interval = intervalForProduct(p.id);
    if (interval === null) continue;
    out.push({
      interval,
      productId: p.id,
      displayPrice: p.displayPrice,
      currencyCode: p.currencyCode,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test entitlement-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/pro/entitlement-model.ts apps/mobile/src/pro/entitlement-model.test.ts
git commit -m "feat(mobile): Pro entitlement model + pure store mappers"
```

---

### Task 3: Raise the API + Fastify attachment ceiling

**Files:**
- Modify: `apps/api/src/handlers/messages-handler.ts:29-30`
- Modify: `apps/api/src/server.ts:12`
- Test: the existing size-limit test in `apps/api` (find with `rg -l "MAX_CIPHERTEXT_BYTES|too large|MIN_CIPHERTEXT" apps/api/src`)

> Rationale: a 25 MiB plaintext attachment seals to ~25.5 MiB ciphertext; base64-in-JSON inflates the body to ~35 MiB. The ciphertext ceiling must clear ~26 MiB and the body limits ~37–38 MiB. This raises the hard backstop for **all** callers (the API has no Pro awareness) — that is intended; the per-tier limit is enforced client-side.

- [ ] **Step 1: Update the failing test first**

Locate the test asserting the ceiling (e.g. a case that rejects a blob just over 14 MiB). Change its boundary to the new ceiling and add an assertion that a 25 MiB-equivalent ciphertext (e.g. `26 * 1024 * 1024`) is accepted and `28 * 1024 * 1024` is rejected. Example shape (adapt to the real test file):

```ts
it("accepts ciphertext up to the raised 26 MiB ceiling and rejects beyond it", () => {
  expect(isAcceptableCiphertextSize(26 * 1024 * 1024)).toBe(true);
  expect(isAcceptableCiphertextSize(28 * 1024 * 1024)).toBe(false);
});
```

If the limit is only enforced inline in the handler (no exported helper), assert via a handler/integration test that a body over the new limit returns 400 `bad_request` and one under it succeeds.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @aesmsg/api test`
Expected: FAIL on the new boundary.

- [ ] **Step 3: Raise the constants**

In `apps/api/src/handlers/messages-handler.ts`:

```ts
const MAX_BODY_BYTES = 37 * 1024 * 1024; // was 20 MiB — base64-in-JSON body for a 25 MiB attachment
const MAX_CIPHERTEXT_BYTES = 26 * 1024 * 1024; // was 14 MiB — 25 MiB plaintext + HPKE/Padmé overhead
```

In `apps/api/src/server.ts`:

```ts
const MAX_BODY_BYTES = 38 * 1024 * 1024; // Fastify bodyLimit — slightly above the handler's own check
```

Leave `MIN_CIPHERTEXT_BYTES = 32` unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @aesmsg/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/messages-handler.ts apps/api/src/server.ts apps/api/src/handlers/messages-handler.test.ts
git commit -m "feat(api): raise attachment ciphertext/body ceiling for Pro 25 MiB attachments"
```

> NOTE: prod nginx `client_max_body_size` must be raised in lockstep (Task 11) or uploads 413 at the edge before reaching Fastify.

---

### Task 4: Make attachment size policy tier-aware

**Files:**
- Modify: `apps/mobile/src/create/pick-attachment.ts`
- Test: the existing `apps/mobile/src/create/pick-attachment.test.ts` (or co-located test; find with `rg -l "validateAttachmentSize|pickFromLibrary" apps/mobile/src`)

> `validateAttachmentSize` and the three pickers currently close over the module constant. Thread an explicit `maxBytes` so the caller supplies the tier limit. Keep `MAX_ATTACHMENT_BYTES` exported as the FREE default for back-compat and the picker's label.

- [ ] **Step 1: Add failing tests for the parameterized limit**

Append to the existing test file:

```ts
import { MAX_ATTACHMENT_BYTES, validateAttachmentSize } from "@/src/create/pick-attachment";
import { PRO_ATTACHMENT_BYTES } from "@/src/pro/entitlements";

describe("validateAttachmentSize tiering", () => {
  it("defaults to the free 10 MiB cap when no limit is passed", () => {
    expect(validateAttachmentSize(MAX_ATTACHMENT_BYTES)).toEqual({ ok: true });
    expect(validateAttachmentSize(MAX_ATTACHMENT_BYTES + 1).ok).toBe(false);
  });

  it("accepts a larger file when the pro limit is supplied", () => {
    const justOverFree = MAX_ATTACHMENT_BYTES + 1;
    expect(validateAttachmentSize(justOverFree, PRO_ATTACHMENT_BYTES)).toEqual({ ok: true });
    expect(validateAttachmentSize(PRO_ATTACHMENT_BYTES + 1, PRO_ATTACHMENT_BYTES).ok).toBe(false);
  });
});
```

Also add a picker-level test (mirroring the existing `pickFromLibrary` test with injected spies) that a `maxBytes` of `PRO_ATTACHMENT_BYTES` lets a 12 MiB asset through where the default would reject it. Reuse the existing spy/deps pattern in this file.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @aesmsg/mobile test pick-attachment`
Expected: FAIL — `validateAttachmentSize` takes one arg / pickers ignore a limit.

- [ ] **Step 3: Implement the parameter**

In `apps/mobile/src/create/pick-attachment.ts`:

```ts
export function validateAttachmentSize(
  size: number,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): SizeCheck {
  return size > maxBytes ? { ok: false, size } : { ok: true };
}
```

Thread `maxBytes` through `buildResult` and the three pickers. `buildResult` gains a `maxBytes` param and passes it to both `validateAttachmentSize` calls:

```ts
async function buildResult(
  asset: NormalizedAsset,
  FileSystem: FileReaderLike,
  maxBytes: number,
): Promise<PickResult> {
  if (asset.knownSize != null && !validateAttachmentSize(asset.knownSize, maxBytes).ok) {
    return { kind: "too-large", filename: asset.filename, size: asset.knownSize };
  }
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  if (!validateAttachmentSize(bytes.length, maxBytes).ok) {
    return { kind: "too-large", filename: asset.filename, size: bytes.length };
  }
  return {
    kind: "picked",
    attachment: { filename: asset.filename, mimetype: asset.mimetype, bytes, size: bytes.length },
  };
}
```

Each picker takes `maxBytes` (default `MAX_ATTACHMENT_BYTES`) and forwards it:

```ts
export async function pickFromLibrary(deps: ImagePickDeps, maxBytes = MAX_ATTACHMENT_BYTES): Promise<PickResult> {
  const result = await deps.ImagePicker.launchImageLibraryAsync({ base64: false });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return { kind: "cancelled" };
  return buildResult(normalizeImage(asset), deps.FileSystem, maxBytes);
}
```

Apply the same `maxBytes` param + forwarding to `pickFromCamera` and `pickDocument`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @aesmsg/mobile test pick-attachment`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/pick-attachment.ts apps/mobile/src/create/pick-attachment.test.ts
git commit -m "feat(mobile): parameterize attachment size limit by tier"
```

---

### Task 5: Custom-expiry pure logic (`custom-expiry.ts`)

**Files:**
- Create: `apps/mobile/src/pro/custom-expiry.ts`
- Test: `apps/mobile/src/pro/custom-expiry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/pro/custom-expiry.test.ts
import { describe, expect, it } from "vitest";
import {
  CUSTOM_EXPIRY_MAX_MS,
  CUSTOM_EXPIRY_MIN_MS,
  customExpiryDefault,
  customExpirySummary,
  validateCustomExpiry,
} from "@/src/pro/custom-expiry";

const now = new Date(Date.UTC(2026, 5, 2, 12, 0, 0));

describe("validateCustomExpiry", () => {
  it("rejects a date in the past or under the minimum window", () => {
    expect(validateCustomExpiry(new Date(now.getTime() - 1000), now).ok).toBe(false);
    expect(validateCustomExpiry(new Date(now.getTime() + CUSTOM_EXPIRY_MIN_MS - 1), now).ok).toBe(
      false,
    );
  });

  it("rejects a date beyond the 1-year maximum", () => {
    expect(validateCustomExpiry(new Date(now.getTime() + CUSTOM_EXPIRY_MAX_MS + 1000), now).ok).toBe(
      false,
    );
  });

  it("accepts a date within [min, max]", () => {
    expect(validateCustomExpiry(new Date(now.getTime() + 3 * 24 * 3600 * 1000), now).ok).toBe(true);
  });
});

describe("customExpiryDefault", () => {
  it("defaults to 3 days out from now", () => {
    expect(customExpiryDefault(now).getTime()).toBe(now.getTime() + 3 * 24 * 3600 * 1000);
  });
});

describe("customExpirySummary", () => {
  it("formats a UTC-stable date label", () => {
    expect(customExpirySummary(new Date(Date.UTC(2026, 11, 31, 9, 30)))).toBe("Dec 31, 2026, 09:30");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @aesmsg/mobile test custom-expiry`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/pro/custom-expiry.ts
// Pure bounds + formatting for the Pro "custom expiry" date/time. No React/native. The compose flow
// supplies the chosen Date; this validates it against [now+min, now+max] and renders a stable label.

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Minimum future window for a custom expiry (5 minutes) — avoids "already expired on creation". */
export const CUSTOM_EXPIRY_MIN_MS = 5 * MINUTE;

/** Maximum custom expiry: 1 year out. */
export const CUSTOM_EXPIRY_MAX_MS = 365 * DAY;

export type CustomExpiryCheck = { ok: true } | { ok: false; reason: "too-soon" | "too-far" };

export function validateCustomExpiry(date: Date, now: Date = new Date()): CustomExpiryCheck {
  const delta = date.getTime() - now.getTime();
  if (Number.isNaN(delta) || delta < CUSTOM_EXPIRY_MIN_MS) return { ok: false, reason: "too-soon" };
  if (delta > CUSTOM_EXPIRY_MAX_MS) return { ok: false, reason: "too-far" };
  return { ok: true };
}

/** Sensible initial value for the picker: 3 days out. */
export function customExpiryDefault(now: Date = new Date()): Date {
  return new Date(now.getTime() + 3 * DAY);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Dec 31, 2026, 09:30" — UTC-based so tests are timezone-stable. */
export function customExpirySummary(date: Date): string {
  const t = date.getTime();
  if (Number.isNaN(t)) return "";
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${hh}:${mm}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @aesmsg/mobile test custom-expiry`
Expected: PASS.

> NOTE: the on-screen picker renders in device-local time; `customExpirySummary` is UTC for test stability and is used only for the compact compose-row label. If a localized label is desired later, that's a follow-up — the sealed `expiresAt` is an absolute instant either way.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/pro/custom-expiry.ts apps/mobile/src/pro/custom-expiry.test.ts
git commit -m "feat(mobile): pure custom-expiry bounds + label"
```

---

### Task 6: Install `expo-iap` + datetimepicker and register plugins

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.config.ts`

> No unit test (native/config). Verify with typecheck + an Expo prebuild. This task makes the next ones compile.

- [ ] **Step 1: Add the dependencies**

Run from repo root:

```bash
pnpm --filter @aesmsg/mobile add expo-iap @react-native-community/datetimepicker
```

Confirm `expo-iap` resolved to a v3.x (StoreKit 2 + Play Billing 8.x) release and `@react-native-community/datetimepicker` to the Expo-SDK-56-compatible version (run `npx expo install --check` from `apps/mobile` and accept any version it pins).

- [ ] **Step 2: Register config plugins**

In `apps/mobile/app.config.ts`, add to the `plugins` array (after `expo-image-picker`):

```ts
    "expo-iap",
    "@react-native-community/datetimepicker",
```

`expo-iap`'s plugin adds the Android `com.android.vending.BILLING` permission and the iOS In-App Purchase capability automatically. No extra options needed for auto-renewable subscriptions.

- [ ] **Step 3: Verify it compiles + prebuilds**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.
Run: `cd apps/mobile && npx expo prebuild --clean --platform ios` (and `--platform android`)
Expected: completes without plugin errors. (A full device build happens in Task 11 QA.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.config.ts pnpm-lock.yaml
git commit -m "build(mobile): add expo-iap + datetimepicker and register plugins"
```

---

### Task 7: `EntitlementProvider` + `useEntitlement` (native boundary)

**Files:**
- Create: `apps/mobile/src/pro/entitlement-context.tsx`
- Modify: `apps/mobile/App.tsx`

> The provider is the only place that touches `expo-iap`. It maps hook results into the Task-2 boundary types and runs the pure `toEntitlement`. It refreshes on mount and on foreground (mirroring the AppState pattern in identity-context.tsx). On-device verification only — the derivation is already unit-tested in Task 2.

- [ ] **Step 1: Implement the provider**

```tsx
// apps/mobile/src/pro/entitlement-context.tsx
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { useIAP } from "expo-iap";
import {
  type ActiveSubscriptionInput,
  ALL_PRODUCT_IDS,
  type Entitlement,
  FREE_ENTITLEMENT,
  type Interval,
  type PlanProduct,
  type ProductInput,
  toEntitlement,
  toPlanProducts,
} from "@/src/pro/entitlement-model";

// Thin React wrapper over expo-iap. Maps the hook's results into the pure model (entitlement-model.ts)
// and exposes a single Entitlement plus purchase/restore/products actions. StoreKit 2 / Play Billing
// cache entitlements on-device, so getActiveSubscriptions() answers offline — no app-side cache.

interface EntitlementContextValue {
  entitlement: Entitlement;
  loading: boolean;
  products: PlanProduct[];
  refresh: () => Promise<void>;
  loadProducts: () => Promise<void>;
  purchase: (interval: Interval) => void;
  restore: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

// expo-iap returns store-native rows; we read only the fields the model needs. Keep these casts local.
interface RawActiveSub {
  productId: string;
  expirationDateIOS?: number | null;
}
interface RawProduct {
  id: string;
  displayPrice?: string;
  currency?: string;
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [entitlement, setEntitlement] = useState<Entitlement>(FREE_ENTITLEMENT);
  const [products, setProducts] = useState<PlanProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const { connected, fetchProducts, getActiveSubscriptions, requestPurchase } = useIAP({
    onPurchaseSuccess: () => {
      void refresh();
    },
    // Errors (incl. user-cancel) are surfaced by the calling screen; nothing to do here.
    onPurchaseError: () => undefined,
  });

  const refresh = useCallback(async () => {
    if (!connected) return;
    try {
      const active = (await getActiveSubscriptions(ALL_PRODUCT_IDS)) as RawActiveSub[];
      const mapped: ActiveSubscriptionInput[] = active.map((s) => ({
        productId: s.productId,
        expiresAtMs: Platform.OS === "ios" ? (s.expirationDateIOS ?? null) : null,
      }));
      setEntitlement(toEntitlement(mapped));
    } catch {
      // Leave the last known entitlement; never crash the shell on a store hiccup.
    } finally {
      setLoading(false);
    }
  }, [connected, getActiveSubscriptions]);

  const loadProducts = useCallback(async () => {
    if (!connected) return;
    try {
      const raw = (await fetchProducts({ skus: [...ALL_PRODUCT_IDS], type: "subs" })) as
        | RawProduct[]
        | undefined;
      const inputs: ProductInput[] = (raw ?? []).map((p) => ({
        id: p.id,
        displayPrice: p.displayPrice ?? "",
        currencyCode: p.currency ?? "",
      }));
      setProducts(toPlanProducts(inputs));
    } catch {
      // Paywall falls back to static pricing (account-data) when products fail to load.
    }
  }, [connected, fetchProducts]);

  const purchase = useCallback(
    (interval: Interval) => {
      const sku = interval === "annual" ? PRODUCT_IDS.annual : PRODUCT_IDS.monthly;
      requestPurchase({
        request: { apple: { sku }, google: { skus: [sku] } },
        type: "subs",
      });
    },
    [requestPurchase],
  );

  const restore = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // Refresh on connect + when the app returns to the foreground.
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === "active") void refresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<EntitlementContextValue>(
    () => ({ entitlement, loading, products, refresh, loadProducts, purchase, restore }),
    [entitlement, loading, products, refresh, loadProducts, purchase, restore],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error("useEntitlement must be used within <EntitlementProvider>");
  return ctx;
}
```

> Add the missing `PRODUCT_IDS` import to the import block above: include `PRODUCT_IDS` from `@/src/pro/entitlement-model`. (`useCallback` is from `react` — fix the import name: import `useCallback` from `"react"`, not `useCallback` casing typo.)
> The exact `expo-iap` method names (`getActiveSubscriptions`, `fetchProducts`, `requestPurchase`) and product field names (`displayPrice`, `currency`, `expirationDateIOS`) are from the v3 docs — verify against the installed version during Step 3 and adjust the local `Raw*` casts only (the pure model never changes).

- [ ] **Step 2: Mount the provider in App.tsx**

In `apps/mobile/App.tsx`, import and wrap. Place `EntitlementProvider` just inside `IdentityProvider` so the shell + Account/Compose can read it:

```tsx
import { EntitlementProvider } from "@/src/pro/entitlement-context";
// ...
        <IdentityProvider>
          <EntitlementProvider>
            <StatusBar style="light" />
            <SafeAreaView style={styles.safe}>
              <Root />
            </SafeAreaView>
          </EntitlementProvider>
        </IdentityProvider>
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (after reconciling any `expo-iap` type mismatches at the `Raw*` boundary).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/pro/entitlement-context.tsx apps/mobile/App.tsx
git commit -m "feat(mobile): EntitlementProvider over expo-iap (store-truth, no app cache)"
```

---

### Task 8: Wire the attachment limit + custom expiry into the compose flow

**Files:**
- Modify: `apps/mobile/src/create/AttachmentPickerSheet.tsx`
- Modify: `apps/mobile/src/create/ExpirySelectorSheet.tsx`
- Modify: `apps/mobile/src/create/ComposeScreen.tsx`

> Pure logic is done + tested (Tasks 1, 4, 5). This task is the React wiring; verify with typecheck + lint and the on-device QA in Task 11.

- [ ] **Step 1: `AttachmentPickerSheet` takes a `maxBytes` prop**

- Add `maxBytes?: number` to `AttachmentPickerSheetProps` (default `MAX_ATTACHMENT_BYTES`).
- Replace the module-level `const MAX_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);` with a value derived from the prop inside the component: `const maxMb = (maxBytes ?? MAX_ATTACHMENT_BYTES) / (1024 * 1024);` and use `maxMb` in both the "too large" copy and the "Up to N MB" label.
- Pass the limit into the pickers: `run(() => pickFromLibrary(imageDeps, maxBytes ?? MAX_ATTACHMENT_BYTES))` (and camera/document).

- [ ] **Step 2: `ComposeScreen` supplies the tier limit**

- Import `useEntitlement` and `maxAttachmentBytes`:

```tsx
import { useEntitlement } from "@/src/pro/entitlement-context";
import { maxAttachmentBytes } from "@/src/pro/entitlements";
```

- Inside the component: `const { entitlement } = useEntitlement();` and pass `maxBytes={maxAttachmentBytes(entitlement.isPro)}` to `<AttachmentPickerSheet .../>`.

- [ ] **Step 3: `ExpirySelectorSheet` gains a Pro-only custom row + picker**

Add to `ExpirySelectorSheetProps`:

```tsx
  /** Show the Pro-only "Custom…" row + date/time picker. */
  allowCustom?: boolean;
  /** Commit a chosen custom expiry (absolute instant). */
  onConfirmCustom?: (date: Date) => void;
```

Below the radio list (inside the sheet, before the note), when `allowCustom` is true render a "Custom…" row that toggles an inline picker:

```tsx
import DateTimePicker from "@react-native-community/datetimepicker";
import { customExpiryDefault, validateCustomExpiry } from "@/src/pro/custom-expiry";
// ...
const [showPicker, setShowPicker] = useState(false);
const [draft, setDraft] = useState<Date>(() => customExpiryDefault());
// ...
{allowCustom ? (
  <Pressable style={styles.row} onPress={() => setShowPicker((v) => !v)} accessibilityRole="button">
    <View style={styles.rowLabel}><Text style={styles.label}>Custom…</Text></View>
    <Icon name="event" size={20} color={colors.onSurfaceVariant} />
  </Pressable>
) : null}
{allowCustom && showPicker ? (
  <>
    <DateTimePicker
      value={draft}
      mode="datetime"
      minimumDate={new Date(Date.now() + 5 * 60 * 1000)}
      onChange={(_e, d) => { if (d) setDraft(d); }}
    />
    <Button
      onPress={() => {
        if (validateCustomExpiry(draft).ok) onConfirmCustom?.(draft);
      }}
    >
      Use this date
    </Button>
  </>
) : null}
```

(Import `Icon` from `@/src/components` alongside the existing imports. Keep the existing preset radio list and Confirm button unchanged.)

- [ ] **Step 4: `ComposeScreen` carries custom expiry**

- Add state: `const [customExpiresAt, setCustomExpiresAt] = useState<Date | null>(null);`
- Pass to the sheet: `allowCustom={allowsCustomExpiry(entitlement.isPro)}` and `onConfirmCustom={(d) => { setCustomExpiresAt(d); setSheet(null); }}`. Import `allowsCustomExpiry` from `@/src/pro/entitlements`.
- When a preset is confirmed via the existing `onConfirm`, also clear custom: `setCustomExpiresAt(null)`.
- Where the submit builds `expiresAt` (currently via `expiryToDate(expiryChoice, now)`), prefer the custom date when set:

```tsx
const expiresAt = customExpiresAt ?? expiryToDate(expiryChoice, new Date());
```

- For the compose "Expiry" summary row label, when `customExpiresAt` is set show `customExpirySummary(customExpiresAt)` instead of `expirySummary(expiryChoice)`. Import `customExpirySummary` from `@/src/pro/custom-expiry`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm --filter @aesmsg/mobile lint`
Expected: PASS. (Behavioral verification is in Task 11 QA: free user sees 10 MB cap + no custom row; Pro sees 25 MB + custom date works.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/create/AttachmentPickerSheet.tsx apps/mobile/src/create/ExpirySelectorSheet.tsx apps/mobile/src/create/ComposeScreen.tsx
git commit -m "feat(mobile): gate attachment size + custom expiry on Pro in compose flow"
```

---

### Task 9: Reconcile account data (EUR pricing + real feature lists)

**Files:**
- Modify: `apps/mobile/src/account/account-data.ts`

- [ ] **Step 1: Update pricing to EUR + reconcile feature lists**

Replace `PRO_PRICING` and the two feature arrays:

```ts
export const PRO_PRICING: PlanPricing = {
  monthlyPrice: 3.99, // "€3.99/mo" billed monthly
  annualPrice: 37.99, // "€37.99 / year" → ≈ €3.17/mo effective (~21% off)
  currency: "EUR",
} as const;

// 51 · Paywall — the REAL Pro matrix (net-new, zero-clawback). No 2 GB / device-key fantasy claims.
export const PRO_FEATURES = [
  "Attachments up to 25 MB",
  "Custom expiry date & time",
  "Priority support",
] as const;

// 53 · Upgrade success — what's unlocked (mirror of the above; no claims the app can't honor).
export const UPGRADE_UNLOCKED = [
  "Attachments up to 25 MB",
  "Custom expiry date & time",
  "Priority support",
] as const;
```

Leave `PlanState`, `FREE_PLAN_STATE`, `PRO_PLAN_STATE`, and `ACCOUNT_PROFILE` as-is (they remain useful fallbacks/sample; AccountFlow now drives live state in Task 10).

- [ ] **Step 2: Verify**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/account/account-data.ts
git commit -m "feat(mobile): EUR Pro pricing + reconciled feature lists"
```

---

### Task 10: Wire the Account screens to live billing

**Files:**
- Modify: `apps/mobile/src/account/AccountFlow.tsx`
- Modify: `apps/mobile/src/account/PaywallScreen.tsx`
- Modify: `apps/mobile/src/account/ManageSubscriptionScreen.tsx`

> Replace the mock plan state with the entitlement context; drive purchase/restore through it; show live prices on the paywall; deep-link plan management to the OS.

- [ ] **Step 1: `AccountFlow` reads the live entitlement + drives purchase/restore**

Replace the mock `useState<PlanState>` with the context:

```tsx
import { Linking, Platform } from "react-native";
import { useEntitlement } from "@/src/pro/entitlement-context";
// ...
export default function AccountFlow(_props: AccountFlowProps = {}) {
  const [route, setRoute] = useState<Route>("account");
  const { entitlement, products, loadProducts, purchase, restore } = useEntitlement();

  // Fetch live products when the paywall opens.
  useEffect(() => {
    if (route === "paywall") void loadProducts();
  }, [route, loadProducts]);

  const openStoreSubscriptions = () => {
    const url = Platform.OS === "ios"
      ? "itms-apps://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions";
    void Linking.openURL(url);
  };

  switch (route) {
    case "paywall":
      return (
        <PaywallScreen
          products={products}
          onClose={() => setRoute("account")}
          onSelectPlan={(interval) => purchase(interval)}
          onRestore={() => void restore()}
        />
      );
    case "upgradeSuccess":
      return (
        <UpgradeSuccessScreen
          onDone={() => setRoute("account")}
          onManageSubscription={() => setRoute("manage")}
        />
      );
    case "manage":
      return (
        <ManageSubscriptionScreen
          interval={entitlement.interval ?? "annual"}
          renewsAt={entitlement.renewsAt}
          onBack={() => setRoute("account")}
          onChangePlan={() => setRoute("paywall")}
          onRestore={() => void restore()}
          onCancel={openStoreSubscriptions}
        />
      );
    default:
      return (
        <AccountScreen
          planId={entitlement.isPro ? "pro" : "free"}
          onUpgrade={() => setRoute("paywall")}
          onManageSubscription={() => setRoute("manage")}
        />
      );
  }
}
```

Drive the success screen off the entitlement: add an effect that, when on `paywall` and `entitlement.isPro` flips true, routes to `upgradeSuccess`:

```tsx
useEffect(() => {
  if (route === "paywall" && entitlement.isPro) setRoute("upgradeSuccess");
}, [route, entitlement.isPro]);
```

(Remove the now-unused `FREE_PLAN_STATE` / `PRO_PLAN_STATE` / `PlanState` imports.)

- [ ] **Step 2: `PaywallScreen` shows live prices**

- Add `products?: PlanProduct[]` to `PaywallScreenProps` (import `PlanProduct` from `@/src/pro/entitlement-model`).
- Prefer the store-localized price for the selected interval; fall back to the existing `monthlyPriceForInterval(PRO_PRICING, interval)` when products are empty:

```tsx
const liveProduct = products?.find((p) => p.interval === interval);
const perMonth = liveProduct?.displayPrice ?? monthlyPriceForInterval(PRO_PRICING, interval);
```

Render `perMonth` where the price is shown. Keep the "/mo" unit for the annual segment's effective price; if `liveProduct` is the annual product its `displayPrice` is the **annual total**, so show it as the headline with the existing `monthlyPriceForInterval` as the "/mo" sub-line. (Keep this simple: show `liveProduct?.displayPrice ?? formatted` as the primary price and leave the existing `/mo` label; the live string already includes the currency.) The feature checklist already maps `PRO_FEATURES` (now reconciled in Task 9).

- [ ] **Step 3: `ManageSubscriptionScreen` takes live props**

Change `ManageSubscriptionScreenProps` from `plan?: PlanState` to:

```tsx
  interval?: BillingInterval;
  renewsAt?: Date | null;
```

(Import `BillingInterval` from `@/src/account/account-format`.) Compute the labels from the props with a fallback when `renewsAt` is null:

```tsx
const planLabel = formatPlanLabel("Pro", interval ?? "annual");
const renewalLine = renewsAt
  ? formatRenewalLine(PRO_PRICING, interval ?? "annual", renewsAt)
  : "Renews automatically. Manage in the App Store.";
```

Keep the rest of the screen (Active chip, billing note, Change plan, Restore, Cancel) unchanged; `onCancel` now opens the OS subscription page (passed from AccountFlow).

- [ ] **Step 4: Verify**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm --filter @aesmsg/mobile lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/account/AccountFlow.tsx apps/mobile/src/account/PaywallScreen.tsx apps/mobile/src/account/ManageSubscriptionScreen.tsx
git commit -m "feat(mobile): wire Account screens to live entitlement + store billing"
```

---

### Task 11: Full gates + store setup + on-device QA

**Files:** none (verification + ops).

- [ ] **Step 1: Run all gates from repo root**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. Fix any fallout before proceeding.

- [ ] **Step 2: Raise prod nginx body limit**

On the Sproobo server fronting `api.aesmsg.com`, set `client_max_body_size 40m;` (was 20m) and reload nginx. Without this, a Pro-size upload 413s at the edge. Confirm with a >20 MB upload against the deployed API after the API change (Task 3) ships.

- [ ] **Step 3: Create store products**

- **App Store Connect:** sign the Paid Applications agreement; complete banking + tax; create a subscription group "aesmsg Pro" with two auto-renewable products `com.aesmsg.app.pro.monthly` (€3.99) and `com.aesmsg.app.pro.annual` (€37.99, EUR base, auto-localized); add localized display name/description + a review screenshot; create a sandbox tester.
- **Google Play Console:** set up the payments profile; create a subscription with monthly + annual base plans using the same product ids; add a license tester.

- [ ] **Step 4: On-device QA (dev build, sandbox accounts)**

Build a dev client (`cd apps/mobile && npx expo run:ios` / `run:android`, clean prebuild from Task 6) and verify against sandbox/test accounts:
- Free account: attachment picker shows "Up to 10 MB"; rejects an 11 MB file; expiry sheet has no "Custom…" row; Account shows the "Free" chip + "Upgrade to Pro".
- Open paywall → live €-prices load → purchase annual (sandbox) → success screen → Account shows "Pro"; Manage shows "Pro · Annual" + a renewal line.
- Pro account: attachment picker shows "Up to 25 MB" and accepts a ~20 MB file; encrypt + send it; recipient decrypts it (end-to-end with the raised ceiling + nginx).
- Pro account: expiry sheet shows "Custom…", pick a date 3 days out, send, confirm the result/Links show the custom expiry.
- Restore purchases on a fresh install of the same store account re-grants Pro.
- Cancel → opens the OS subscription management page.

- [ ] **Step 5: Commit any QA-driven fixes, then finalize**

```bash
git add -A && git commit -m "fix(mobile): Pro subscription QA fixes"
```

Open a PR from `claude/intelligent-bassi-9834a3` summarizing the feature, the client-side-only entitlement model, and the store-setup prerequisites.

---

## Self-Review

**Spec coverage:**
- §1 Pricing & products → Task 9 (EUR pricing), Task 11 Step 3 (product ids/group). ✓
- §2 Free-vs-Pro matrix → Tasks 1, 4 (attachments), 5/8 (custom expiry); contacts/device-keys gates correctly absent. ✓
- §3 Entitlement architecture (BillingService/provider/pure helpers) → Tasks 2, 7 (provider over expo-iap), 1 (helpers). The spec's class-style `BillingService` is realized as the `useIAP`-based provider + pure mappers (documented refinement). ✓
- §4 Infra bump → Task 3 (API) + Task 11 Step 2 (nginx). ✓
- §5 Custom expiry → Tasks 5, 8. ✓
- Screen wiring → Task 10. ✓
- Restore/renewal/cancel → Task 7 (restore = refresh), Task 10 (cancel → OS). ✓
- Testing → pure logic TDD in Tasks 1, 2, 4, 5; API in Task 3; on-device QA in Task 11. ✓
- Store prerequisites → Task 11. ✓
- Zero-knowledge (no server identity) → provider is on-device only; API untouched except the shared size ceiling. ✓
- Dropped (per spec non-goals): no RevenueCat, no server entitlements, no streaming uploads, no multi-recipient/multi-attachment, no contacts cap. ✓

**Placeholder scan:** No "TBD"/"handle errors"/"similar to". The two explicit verify-against-installed-version notes (expo-iap field names in Task 7) are real instructions tied to a concrete verification step, not hand-waving — the pure model they feed is fully specified.

**Type consistency:** `Entitlement`, `Interval`, `PlanProduct`, `ActiveSubscriptionInput`, `ProductInput`, `PRODUCT_IDS`, `toEntitlement`, `toPlanProducts` are defined in Task 2 and consumed unchanged in Tasks 7/10. `maxAttachmentBytes`/`allowsCustomExpiry` (Task 1) consumed in Task 8. `validateAttachmentSize(size, maxBytes?)` (Task 4) consumed in Task 8. `validateCustomExpiry`/`customExpiryDefault`/`customExpirySummary` (Task 5) consumed in Task 8. Consistent.

**Known fix-ups for the implementer:** in Task 7's code block, the `react` import must read `useCallback` (not a typo) and must also import `PRODUCT_IDS` from the model — both called out inline.
