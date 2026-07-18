import { describe, expect, it } from "vitest";
import type { PlanProduct } from "@/src/pro/entitlement-model";
import { livePriceForInterval, selectPriceDisplay } from "@/src/pro/paywall-price";

// Pure price-display selection for the paywall (PG-8): prices come ONLY from the store; never a
// fabricated fallback. Tested per the node-env / no-React-renderer convention.

const MONTHLY: PlanProduct = {
  interval: "monthly",
  productId: "com.aesmsg.app.pro.monthly",
  displayPrice: "€3,99",
  currencyCode: "EUR",
};
const ANNUAL: PlanProduct = {
  interval: "annual",
  productId: "com.aesmsg.app.pro.annual",
  displayPrice: "€37,99",
  currencyCode: "EUR",
};

describe("selectPriceDisplay", () => {
  it("shows the store's localized price + the annual '/yr' unit (the yearly total)", () => {
    expect(selectPriceDisplay([MONTHLY, ANNUAL], "annual", "ready")).toEqual({
      state: "price",
      price: "€37,99",
      unit: "/yr",
    });
  });

  it("shows the monthly price with a '/mo' unit", () => {
    expect(selectPriceDisplay([MONTHLY, ANNUAL], "monthly", "ready")).toEqual({
      state: "price",
      price: "€3,99",
      unit: "/mo",
    });
  });

  it("shows a skeleton (never a made-up price) while products are still loading", () => {
    expect(selectPriceDisplay([], "annual", "loading")).toEqual({ state: "loading" });
  });

  it("shows an honest error (never a made-up price) when the fetch failed", () => {
    expect(selectPriceDisplay([], "annual", "error")).toEqual({ state: "error" });
  });

  it("errors rather than fabricating when the store loaded but omits the selected plan", () => {
    // Only the monthly product came back, but the user selected annual.
    expect(selectPriceDisplay([MONTHLY], "annual", "ready")).toEqual({ state: "error" });
  });

  it("prefers the real store price even if status is somehow still 'loading'", () => {
    // If a product is present, we always show it regardless of the status flag.
    expect(selectPriceDisplay([ANNUAL], "annual", "loading")).toEqual({
      state: "price",
      price: "€37,99",
      unit: "/yr",
    });
  });
});

describe("livePriceForInterval", () => {
  it("returns the store displayPrice for a present interval", () => {
    expect(livePriceForInterval([MONTHLY, ANNUAL], "annual")).toBe("€37,99");
    expect(livePriceForInterval([MONTHLY, ANNUAL], "monthly")).toBe("€3,99");
  });

  it("returns undefined (never a fabricated amount) when the interval isn't available", () => {
    expect(livePriceForInterval([MONTHLY], "annual")).toBeUndefined();
    expect(livePriceForInterval([], "monthly")).toBeUndefined();
  });
});
