// Pure logic: model the rows shown in the Expiry (14) and Max-Opens (15) selector sheets, and the
// short summary values shown on the compose screen's summary rows (11).
//
// This REUSES the existing, already-tested option tables from ./expiry (EXPIRY_OPTIONS /
// MAX_OPENS_OPTIONS / ExpiryChoice / MaxOpensChoice) — it never re-defines the choices or their
// values, so the seal call keeps feeding the exact same expiry dates + max-opens numbers. It only
// adds the presentational layer the design asks for: a "Default" marker on 24h, a one-line
// description per max-opens option, and compact summary labels for the compose rows.
//
// Extracted (node-env testable) so the sheets stay thin and the labelling/default logic is unit-
// tested rather than baked into JSX.

import {
  EXPIRY_OPTIONS,
  type ExpiryChoice,
  MAX_OPENS_OPTIONS,
  type MaxOpensChoice,
} from "@/src/create/expiry";

/** The expiry choice the compose screen starts on — matches the design's "Default" badge on 24h. */
export const DEFAULT_EXPIRY: ExpiryChoice = "24h";

/** A row in the Expiry selector sheet (14). `isDefault` drives the violet "Default" badge. */
export interface ExpiryOptionRow {
  value: ExpiryChoice;
  label: string;
  isDefault: boolean;
}

/** Build the Expiry sheet rows from the shared EXPIRY_OPTIONS, marking the default. */
export function expiryOptionRows(): ExpiryOptionRow[] {
  return EXPIRY_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    isDefault: o.value === DEFAULT_EXPIRY,
  }));
}

/** Compact value shown on the compose "Expiry" summary row (e.g. "24 hours"). */
export function expirySummary(choice: ExpiryChoice): string {
  return EXPIRY_OPTIONS.find((o) => o.value === choice)?.label ?? "";
}

// One-line descriptions for the max-opens sheet, keyed by the shared MaxOpensChoice values.
// Copy mirrors the design's S_MaxOpens helper text (burn-after-first / N-then-gone / freely-until-
// expiry). The "never reveal more than necessary" tone is preserved — no server-trust implied.
const MAX_OPENS_DESCRIPTIONS: Record<MaxOpensChoice, string> = {
  1: "Burns after the first successful open.",
  5: "Available for up to five opens, then gone.",
  10: "Available for up to ten opens, then gone.",
  [-1]: "Opens freely until the link expires.",
};

/** A row in the Max-Opens selector sheet (15): label + supporting description. */
export interface MaxOpensOptionRow {
  value: MaxOpensChoice;
  label: string;
  description: string;
}

/** Build the Max-Opens sheet rows from the shared MAX_OPENS_OPTIONS, attaching descriptions. */
export function maxOpensOptionRows(): MaxOpensOptionRow[] {
  return MAX_OPENS_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    description: MAX_OPENS_DESCRIPTIONS[o.value],
  }));
}

/** Compact value shown on the compose "Max opens" summary row (e.g. "Once", "Unlimited"). */
export function maxOpensSummary(choice: MaxOpensChoice): string {
  return MAX_OPENS_OPTIONS.find((o) => o.value === choice)?.label ?? "";
}
