// Pure option tables + expiry math for the compose screen (D6). These follow the SPEC presets
// (10m / 1h / 24h / 7d / custom; 1 / 3 / unlimited), which differ from the mobile numbers — a
// UI-only difference: any real future expiry Date and any positive-int-or-(-1) maxOpens seal +
// upload identically, so interop is unaffected.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Longest link lifetime offered (365 days). There is NO "Never" option — the server rejects
 * unbounded links (retention ceiling). Mirrors mobile MAX_LINK_LIFETIME_MS and the server's
 * DEFAULT_MAX_RETENTION_MS; a custom expiry is clamped to at most this.
 */
export const MAX_LINK_LIFETIME_MS = 365 * DAY;

/** Floor for a custom expiry so a link is never "already expired on creation". */
export const MIN_CUSTOM_EXPIRY_MS = MINUTE;

export type ExpiryChoice = "10m" | "1h" | "24h" | "7d" | "custom";

export interface ExpiryPreset {
  value: ExpiryChoice;
  label: string;
  /** Offset in ms added to `now`; null for "custom" (uses the picked date). */
  offsetMs: number | null;
}

export const EXPIRY_PRESETS: ExpiryPreset[] = [
  { value: "10m", label: "10 minutes", offsetMs: 10 * MINUTE },
  { value: "1h", label: "1 hour", offsetMs: HOUR },
  { value: "24h", label: "24 hours", offsetMs: DAY },
  { value: "7d", label: "7 days", offsetMs: 7 * DAY },
  { value: "custom", label: "Custom…", offsetMs: null },
];

export const DEFAULT_EXPIRY: ExpiryChoice = "24h";

export type MaxOpensChoice = 1 | 3 | -1;

export interface MaxOpensOption {
  value: MaxOpensChoice;
  label: string;
  /** One calm line — no server-trust implied. */
  description: string;
}

export const MAX_OPENS_OPTIONS: MaxOpensOption[] = [
  {
    value: 1,
    label: "1 view (burn on read)",
    description: "The link stops working the moment it's opened once.",
  },
  {
    value: 3,
    label: "3 views",
    description: "Opens up to three times, then the link is gone.",
  },
  {
    value: -1,
    label: "Unlimited (until expiry)",
    description: "Opens as many times as needed until the link expires.",
  },
];

export const DEFAULT_MAX_OPENS: MaxOpensChoice = 1;

export type CustomExpiryError = "past" | "too_far";
export type CustomExpiryCheck = { ok: true } | { ok: false; reason: CustomExpiryError };

/** Validate a picked custom expiry for inline errors. */
export function validateCustomExpiry(date: Date, now: Date): CustomExpiryCheck {
  const delta = date.getTime() - now.getTime();
  if (Number.isNaN(delta) || delta < MIN_CUSTOM_EXPIRY_MS) return { ok: false, reason: "past" };
  if (delta > MAX_LINK_LIFETIME_MS) return { ok: false, reason: "too_far" };
  return { ok: true };
}

/**
 * Resolve a compose choice to the single expiry Date used for BOTH the sealed AAD (expiresAtMs) and
 * the uploaded expiresAt — they must be the same instant (mobile invariant). Presets add their
 * offset; `custom` returns the picked date CLAMPED to (now + MIN_CUSTOM_EXPIRY_MS, now + MAX].
 */
export function expiryToDate(choice: ExpiryChoice, now: Date, customDate?: Date): Date {
  const preset = EXPIRY_PRESETS.find((p) => p.value === choice);
  if (preset && preset.offsetMs !== null) {
    return new Date(now.getTime() + preset.offsetMs);
  }
  const min = now.getTime() + MIN_CUSTOM_EXPIRY_MS;
  const max = now.getTime() + MAX_LINK_LIFETIME_MS;
  const target = customDate?.getTime() ?? max;
  const clamped = Math.min(Math.max(Number.isNaN(target) ? min : target, min), max);
  return new Date(clamped);
}
