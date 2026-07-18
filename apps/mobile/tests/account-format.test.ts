import { describe, expect, it } from "vitest";
import { PRO_PLAN_STATE } from "@/src/account/account-data";
import {
  annualSavingsLabel,
  annualSavingsPercent,
  formatLiveRenewalLine,
  formatMoney,
  formatPlanLabel,
  formatRenewalDate,
  formatRenewalLine,
  monthlyPriceForInterval,
  type PlanPricing,
} from "@/src/account/account-format";

// Pure plan / price formatting backing the Account / Monetization screens (51 · Paywall,
// 52 · Manage Subscription, 50 · Account). Tested per the node-env / no-React-renderer convention —
// the .tsx screens stay presentational and only compose these strings.

// A fixed fixture for the pure formatter — deliberately DECOUPLED from the product's real price
// (PRO_PRICING is now EUR). The formatter's behaviors (whole→no decimals, fraction→2dp, rounding)
// are stable regardless of what Pro currently costs, so these assertions don't churn on price changes.
const PLAN: PlanPricing = { monthlyPrice: 4, annualPrice: 38, currency: "USD" };

describe("formatMoney", () => {
  it("renders whole amounts with no decimals", () => {
    expect(formatMoney(38)).toBe("$38");
  });

  it("renders fractional amounts with two decimals by default", () => {
    expect(formatMoney(3.2)).toBe("$3.20");
  });

  it("honors an explicit decimal count", () => {
    expect(formatMoney(4, "USD", 2)).toBe("$4.00");
  });

  it("supports other currency symbols and falls back to a prefixed code", () => {
    expect(formatMoney(38, "EUR")).toBe("€38");
    expect(formatMoney(38, "GBP")).toBe("£38");
    expect(formatMoney(38, "JPY")).toBe("JPY 38");
  });

  it("treats non-finite input as 0 rather than 'NaN'", () => {
    expect(formatMoney(Number.NaN)).toBe("$0");
  });
});

describe("monthlyPriceForInterval", () => {
  it("returns the headline monthly price billed monthly", () => {
    expect(monthlyPriceForInterval(PLAN, "monthly")).toBe("$4.00");
  });

  it("returns the effective per-month price billed annually (38 / 12)", () => {
    expect(monthlyPriceForInterval(PLAN, "annual")).toBe("$3.17");
  });
});

describe("annualSavingsPercent / annualSavingsLabel", () => {
  it("computes the saving vs 12x the monthly price", () => {
    // 12 * 4 = 48 vs 38 → (48-38)/48 = 20.83% → rounds to 21
    expect(annualSavingsPercent(PLAN)).toBe(21);
  });

  it("renders the design's 'Save 20%' badge (rounded down to the ten)", () => {
    expect(annualSavingsLabel(PLAN)).toBe("Save 20%");
  });

  it("can render the exact percent when not rounding to ten", () => {
    expect(annualSavingsLabel(PLAN, false)).toBe("Save 21%");
  });

  it("never reports negative savings when annual isn't cheaper", () => {
    const noDiscount: PlanPricing = { monthlyPrice: 3, annualPrice: 36 };
    expect(annualSavingsPercent(noDiscount)).toBe(0);
    expect(annualSavingsLabel(noDiscount)).toBe("");
  });

  it("returns '' when rounding-to-ten zeroes a small saving", () => {
    // 12*10=120 vs 115 → ~4% → floor(4/10)*10 = 0 → no badge
    const tiny: PlanPricing = { monthlyPrice: 10, annualPrice: 115 };
    expect(annualSavingsLabel(tiny)).toBe("");
    expect(annualSavingsLabel(tiny, false)).toBe("Save 4%");
  });
});

describe("formatRenewalDate", () => {
  it("formats a UTC date as 'Mon D, YYYY'", () => {
    expect(formatRenewalDate(new Date(Date.UTC(2027, 4, 30)))).toBe("May 30, 2027");
    expect(formatRenewalDate(new Date(Date.UTC(2026, 0, 1)))).toBe("Jan 1, 2026");
  });

  it("is timezone-stable (uses UTC, not local, calendar fields)", () => {
    // An instant just after midnight UTC must still read as that UTC day regardless of TZ.
    expect(formatRenewalDate(new Date("2027-05-30T00:30:00Z"))).toBe("May 30, 2027");
  });

  it("returns '' for an invalid date", () => {
    expect(formatRenewalDate(new Date("not-a-date"))).toBe("");
  });
});

describe("formatRenewalLine", () => {
  it("renders the design's annual line", () => {
    expect(formatRenewalLine(PLAN, "annual", PRO_PLAN_STATE.renewsAt)).toBe(
      "$38 / year, renews May 30, 2027",
    );
  });

  it("renders a monthly line (whole amount shown without decimals)", () => {
    expect(formatRenewalLine(PLAN, "monthly", new Date(Date.UTC(2026, 5, 30)))).toBe(
      "$4 / month, renews Jun 30, 2026",
    );
  });
});

describe("formatLiveRenewalLine", () => {
  const may30 = new Date(Date.UTC(2027, 4, 30));

  it("builds the renewal line from the LIVE store price (never a fabricated amount)", () => {
    expect(formatLiveRenewalLine("€37.99", "annual", may30)).toBe(
      "€37.99 / year, renews May 30, 2027",
    );
    expect(formatLiveRenewalLine("€3.99", "monthly", may30)).toBe(
      "€3.99 / month, renews May 30, 2027",
    );
  });

  it("keeps the live price but omits a date the store doesn't expose (e.g. Android)", () => {
    expect(formatLiveRenewalLine("€3.99", "monthly", null)).toBe(
      "€3.99 / month, renews automatically.",
    );
  });

  it("shows a price-free line when the live price is unavailable — no invented number", () => {
    expect(formatLiveRenewalLine(undefined, "annual", may30)).toBe("Renews May 30, 2027.");
    expect(formatLiveRenewalLine(null, "annual", may30)).toBe("Renews May 30, 2027.");
  });

  it("falls back to the generic App Store line with neither price nor date", () => {
    expect(formatLiveRenewalLine(undefined, "annual", null)).toBe(
      "Renews automatically — manage in the App Store.",
    );
  });
});

describe("formatPlanLabel", () => {
  it("joins plan + interval for the Manage header", () => {
    expect(formatPlanLabel("Pro", "annual")).toBe("Pro · Annual");
    expect(formatPlanLabel("Pro", "monthly")).toBe("Pro · Monthly");
  });

  it("returns just the plan name when there's no interval (e.g. Free)", () => {
    expect(formatPlanLabel("Free")).toBe("Free");
  });
});
