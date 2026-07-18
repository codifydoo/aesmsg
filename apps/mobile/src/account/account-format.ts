// Pure plan / price formatting for the Account / Monetization feature, extracted (node-env
// testable) so the .tsx screens stay thin & presentational, per the apps/mobile test convention
// (no React renderer in tests).
//
// Concerns living here:
//   1. Billing-interval price math (51 · Paywall): monthly vs annual, the annual "/mo" effective
//      price, and the headline annual savings vs paying monthly.
//   2. Plan label formatting (50 · Account chip, 52 · Manage Subscription header).
//   3. Renewal-line formatting (52 · Manage Subscription): "$38 / year, renews May 30, 2027".
//
// The design's reference numbers are reproduced verbatim by the mock store (account-data.ts) so the
// screens render faithfully; this module is the calculator + formatter behind them.

export type BillingInterval = "monthly" | "annual";

/**
 * A priced plan tier. `monthlyPrice` is the headline per-month price when billed monthly;
 * `annualPrice` is the total charged once per year when billed annually. Both in whole currency
 * units (USD here) — the design shows "$3.20/mo" and "$38 / year".
 */
export interface PlanPricing {
  /** Per-month price when billed monthly (e.g. 4.0 → "$4.00/mo"). */
  monthlyPrice: number;
  /** Total annual charge when billed annually (e.g. 38 → "$38 / year"). */
  annualPrice: number;
  /** ISO 4217 currency, defaults to USD. */
  currency?: string;
}

const DEFAULT_CURRENCY = "USD";

// Currency formatting without pulling Intl edge cases into every call site. We keep it explicit and
// deterministic: a leading symbol + fixed-or-trimmed decimals. (Intl.NumberFormat is available in
// Hermes/RN but its symbol/locale output varies by engine; a tiny formatter keeps tests stable.)
const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

function symbolFor(currency: string): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

/**
 * Format a monetary amount with the currency symbol. `decimals` controls fixed precision; when
 * omitted, whole amounts render without decimals ("$38") and fractional amounts with two ("$3.20").
 *   formatMoney(3.2)        -> "$3.20"
 *   formatMoney(38)         -> "$38"
 *   formatMoney(4, "USD", 2)-> "$4.00"
 */
export function formatMoney(
  amount: number,
  currency = DEFAULT_CURRENCY,
  decimals?: number,
): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const fixed = decimals ?? (Number.isInteger(value) ? 0 : 2);
  return `${symbolFor(currency)}${value.toFixed(fixed)}`;
}

/**
 * The effective per-month price for an interval. Monthly is the headline price as-is; annual divides
 * the yearly charge across 12 months. Always shown to 2 dp ("$3.17/mo") so the annual saving reads.
 *   monthlyPriceForInterval(plan, "monthly") -> "$4.00"
 *   monthlyPriceForInterval(plan, "annual")  -> "$3.17"  (38 / 12)
 */
export function monthlyPriceForInterval(plan: PlanPricing, interval: BillingInterval): string {
  const currency = plan.currency ?? DEFAULT_CURRENCY;
  const perMonth = interval === "annual" ? plan.annualPrice / 12 : plan.monthlyPrice;
  return formatMoney(perMonth, currency, 2);
}

/**
 * Whole-percent savings of paying annually vs 12× the monthly price. Returns 0 (never negative) when
 * the annual plan isn't actually cheaper. 12×4.00=48 vs 38 → 21% (the design rounds to "Save 20%").
 */
export function annualSavingsPercent(plan: PlanPricing): number {
  const fullMonthly = plan.monthlyPrice * 12;
  if (!Number.isFinite(fullMonthly) || fullMonthly <= 0) return 0;
  const saved = (fullMonthly - plan.annualPrice) / fullMonthly;
  return Math.max(0, Math.round(saved * 100));
}

/** The savings badge string the segmented control shows, e.g. "Save 20%". 0% → "". */
export function annualSavingsLabel(plan: PlanPricing, roundToTen = true): string {
  const pct = annualSavingsPercent(plan);
  if (pct <= 0) return "";
  const shown = roundToTen ? Math.floor(pct / 10) * 10 : pct;
  if (shown <= 0) return "";
  return `Save ${shown}%`;
}

/**
 * The renewal line for the Manage Subscription screen, e.g.
 *   "$38 / year, renews May 30, 2027"  (annual)
 *   "$4.00 / month, renews Jun 30, 2026" (monthly)
 * `renewsAt` is formatted in UTC so tests are timezone-stable.
 */
export function formatRenewalLine(
  plan: PlanPricing,
  interval: BillingInterval,
  renewsAt: Date,
): string {
  const currency = plan.currency ?? DEFAULT_CURRENCY;
  const amount = interval === "annual" ? plan.annualPrice : plan.monthlyPrice;
  const period = interval === "annual" ? "year" : "month";
  return `${formatMoney(amount, currency)} / ${period}, renews ${formatRenewalDate(renewsAt)}`;
}

/**
 * The Manage-Subscription renewal line built from the LIVE store price — never a fabricated amount
 * (PG-8). `livePrice` is the store's localized per-period `displayPrice` (annual product → the yearly
 * total, monthly → the monthly charge). When the live price is absent (products not loaded / store
 * couldn't price it), returns a price-free line rather than inventing a number.
 *   formatLiveRenewalLine("€37.99", "annual", may30) -> "€37.99 / year, renews May 30, 2027"
 *   formatLiveRenewalLine("€3.99", "monthly", null)  -> "€3.99 / month, renews automatically."
 *   formatLiveRenewalLine(undefined, "annual", may30) -> "Renews May 30, 2027."
 *   formatLiveRenewalLine(undefined, "annual", null)  -> "Renews automatically — manage in the App Store."
 */
export function formatLiveRenewalLine(
  livePrice: string | undefined | null,
  interval: BillingInterval,
  renewsAt: Date | null | undefined,
): string {
  const dateStr = renewsAt ? formatRenewalDate(renewsAt) : "";
  const period = interval === "annual" ? "year" : "month";
  if (livePrice) {
    return dateStr
      ? `${livePrice} / ${period}, renews ${dateStr}`
      : `${livePrice} / ${period}, renews automatically.`;
  }
  return dateStr ? `Renews ${dateStr}.` : "Renews automatically — manage in the App Store.";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "May 30, 2027" — UTC-based so it never drifts by a day across timezones. Invalid date → "". */
export function formatRenewalDate(date: Date): string {
  const t = date.getTime();
  if (Number.isNaN(t)) return "";
  // getUTCMonth() is 0–11, always in range; the `?? ""` only satisfies noUncheckedIndexedAccess.
  const month = MONTHS[date.getUTCMonth()] ?? "";
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** The plan + interval label for a header, e.g. "Pro · Annual" / "Free". */
export function formatPlanLabel(planName: string, interval?: BillingInterval): string {
  if (!interval) return planName;
  const intervalLabel = interval === "annual" ? "Annual" : "Monthly";
  return `${planName} · ${intervalLabel}`;
}
