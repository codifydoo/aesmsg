// Pricing + feature-list data for the Account / Monetization feature (grp-account.jsx, screens
// 50–53). The trust-sensitive profile data (fingerprint, device, app version) is NO LONGER here — it
// is derived from the real identity + native device sources in AccountScreen. What remains is the
// EUR offline-fallback pricing and the shipped Pro feature/disclosure copy; live prices + entitlement
// come from the store via useEntitlement(). The PlanState fixtures below are Date/label fixtures for
// the pure formatters' tests, not a live subscription source.

import type { BillingInterval, PlanPricing } from "@/src/account/account-format";

// ── Pricing (51 · Paywall, 52 · Manage) ─────────────────────────────────────
// EUR pricing. This is the OFFLINE FALLBACK only — the paywall prefers the live store-localized
// displayPrice. Annual ≈ €3.17/mo effective (~21% cheaper than 12× the monthly price).
export const PRO_PRICING: PlanPricing = {
  monthlyPrice: 3.99, // "€3.99/mo" billed monthly
  annualPrice: 37.99, // "€37.99 / year" billed annually → ≈ €3.17/mo effective
  currency: "EUR",
} as const;

export type PlanId = "free" | "pro";

/** The current subscription snapshot the screens render. A real billing source replaces this. */
export interface PlanState {
  planId: PlanId;
  /** Only meaningful when planId === "pro". */
  interval: BillingInterval;
  /** Next renewal date (Manage Subscription). UTC date so formatting is timezone-stable. */
  renewsAt: Date;
}

// Default app state in the design's Account screen (50) is the Free plan with a violet "Free" chip.
export const FREE_PLAN_STATE: PlanState = {
  planId: "free",
  interval: "monthly",
  renewsAt: new Date(Date.UTC(2027, 4, 30)), // unused while free; placeholder
};

// Manage Subscription (52) shows "Pro · Annual", "$38 / year, renews May 30, 2027".
export const PRO_PLAN_STATE: PlanState = {
  planId: "pro",
  interval: "annual",
  renewsAt: new Date(Date.UTC(2027, 4, 30)), // May 30, 2027
};

// The 50 · Account profile header no longer carries a fabricated ACCOUNT_PROFILE constant (sample
// initials/name/fingerprint/device/version). AccountScreen now derives the avatar + fingerprint from
// the real identity and the device/app-version from Platform / expo-application (see AccountScreen +
// account-device.ts). Nothing device-specific is hardcoded here anymore.

// ── 51 · Paywall feature list ───────────────────────────────────────────────
// Reconciled to the shipped v1 Pro matrix (net-new, zero-clawback) — NOT the design's aspirational
// list. Must stay in sync with the store product benefits (App Store Connect / Play Console).
export const PRO_FEATURES = [
  "Attachments up to 25 MB",
  "Custom expiry date & time",
  "Priority support",
] as const;

// ── 53 · Upgrade success — what's unlocked ──────────────────────────────────
// Mirrors PRO_FEATURES (the shipped v1 matrix). No claims the app/infra can't honor.
export const UPGRADE_UNLOCKED = [
  "Attachments up to 25 MB",
  "Custom expiry date & time",
  "Priority support",
] as const;

// ── 51 · Paywall — auto-renewable subscription disclosure ────────────────────
// Required at the point of purchase by App Store Guideline 3.1.2: state the auto-renew terms, that
// the Apple ID is charged on confirmation, and where to manage/cancel. Closes with the calm
// encryption reassurance so the screen still reads as a premium SaaS product, not a billing form.
export const PRO_RENEWAL_DISCLOSURE =
  "Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your Apple ID is charged on confirmation of purchase. Manage or cancel anytime in your App Store settings. Your encryption is unchanged on every plan.";
