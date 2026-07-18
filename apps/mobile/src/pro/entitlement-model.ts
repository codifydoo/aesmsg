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

// Frozen: toEntitlement() returns this sentinel by reference, so freezing prevents a caller from
// accidentally mutating the shared "free" value for everyone.
export const FREE_ENTITLEMENT: Entitlement = Object.freeze({
  isPro: false,
  interval: null,
  renewsAt: null,
  productId: null,
});

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
