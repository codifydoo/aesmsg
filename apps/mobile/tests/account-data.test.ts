import { describe, expect, it } from "vitest";
import {
  FREE_PLAN_STATE,
  PRO_FEATURES,
  PRO_PLAN_STATE,
  PRO_PRICING,
  PRO_RENEWAL_DISCLOSURE,
  UPGRADE_UNLOCKED,
} from "@/src/account/account-data";
import { formatRenewalLine, monthlyPriceForInterval } from "@/src/account/account-format";

// Account data fixtures. Pricing + feature lists are the SHIPPED v1 Pro values (EUR, reconciled — see
// the subscription spec). There is intentionally NO ACCOUNT_PROFILE fixture anymore: the profile
// (fingerprint / device / app version) is derived from the real identity + native sources in
// AccountScreen, not a constant. Asserted here per the node-env / no-React-renderer convention.

describe("PRO_FEATURES (51 · Paywall feature list)", () => {
  it("is the shipped v1 Pro matrix (net-new, zero-clawback)", () => {
    expect(PRO_FEATURES).toEqual([
      "Attachments up to 25 MB",
      "Custom expiry date & time",
      "Priority support",
    ]);
  });
});

describe("UPGRADE_UNLOCKED (53 · Upgrade success list)", () => {
  it("mirrors the shipped PRO_FEATURES matrix", () => {
    expect(UPGRADE_UNLOCKED).toEqual([
      "Attachments up to 25 MB",
      "Custom expiry date & time",
      "Priority support",
    ]);
  });
});

describe("PRO_RENEWAL_DISCLOSURE (51 · Paywall subscription terms)", () => {
  it("states the auto-renew terms required by App Store Guideline 3.1.2", () => {
    expect(PRO_RENEWAL_DISCLOSURE).toMatch(/automatically renews/i);
    expect(PRO_RENEWAL_DISCLOSURE).toMatch(
      /at least 24 hours before the end of the current period/i,
    );
    expect(PRO_RENEWAL_DISCLOSURE).toMatch(/App Store/);
  });
});

describe("plan states", () => {
  it("the free state is the default app plan", () => {
    expect(FREE_PLAN_STATE.planId).toBe("free");
  });

  it("the pro state renders the EUR annual renewal line", () => {
    expect(PRO_PLAN_STATE.planId).toBe("pro");
    expect(PRO_PLAN_STATE.interval).toBe("annual");
    expect(formatRenewalLine(PRO_PRICING, PRO_PLAN_STATE.interval, PRO_PLAN_STATE.renewsAt)).toBe(
      "€37.99 / year, renews May 30, 2027",
    );
  });

  it("the pricing yields the EUR headline figures", () => {
    expect(monthlyPriceForInterval(PRO_PRICING, "monthly")).toBe("€3.99");
    expect(monthlyPriceForInterval(PRO_PRICING, "annual")).toBe("€3.17");
  });
});
