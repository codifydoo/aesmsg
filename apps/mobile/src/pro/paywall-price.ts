// Pure price-display selection for the paywall (51 · Paywall). No React, no native, no I/O —
// unit-tested in plain Node per the mobile test convention.
//
// INVARIANT (PG-8): prices shown at the point of purchase come ONLY from the fetched, store-localized
// products (their `displayPrice`). There is NO hardcoded / fabricated fallback: while products load we
// return a skeleton, and if the store can't price the selected plan we return an honest error (retry).
// A made-up amount at the point of purchase is an App Review risk and a trust problem.

import type { Interval, PlanProduct } from "@/src/pro/entitlement-model";

/** The load state of the store products, owned by the entitlement context. */
export type ProductsStatus = "loading" | "error" | "ready";

/** What the paywall price row should render for the selected interval. */
export type PriceDisplay =
  | { state: "loading" }
  | { state: "error" }
  | { state: "price"; price: string; unit: "/mo" | "/yr" };

/**
 * Choose the price display for `interval` from the live store products.
 *   - a matching store product → its localized `displayPrice` (annual total is billed "/yr", the
 *     monthly charge is "/mo"), the actual amount the store will charge.
 *   - no product yet + still loading → a skeleton placeholder.
 *   - no product + not loading (fetch failed, or the store didn't return this plan) → an honest error.
 * It NEVER fabricates a price.
 */
export function selectPriceDisplay(
  products: PlanProduct[],
  interval: Interval,
  status: ProductsStatus,
): PriceDisplay {
  const product = products.find((p) => p.interval === interval);
  if (product) {
    return {
      state: "price",
      price: product.displayPrice,
      unit: interval === "annual" ? "/yr" : "/mo",
    };
  }
  if (status === "loading") return { state: "loading" };
  return { state: "error" };
}

/** The live store `displayPrice` for an interval, or undefined when it isn't available. */
export function livePriceForInterval(
  products: PlanProduct[],
  interval: Interval,
): string | undefined {
  return products.find((p) => p.interval === interval)?.displayPrice;
}
