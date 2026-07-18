import { describe, expect, it } from "vitest";
import {
  FREE_ENTITLEMENT,
  intervalForProduct,
  PRODUCT_IDS,
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
