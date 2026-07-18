// Pure "expiring soon" decision for the Links tab.
//
// The amber "Expiring soon" highlight must be PROPORTIONAL to the link's total lifetime, not a fixed
// absolute cutoff. A single absolute window (the old 24h) made a 10-minute and a 1-hour link amber
// for their entire life while a 7-day link only went amber in its final day — training users to
// ignore amber (UX §B: "Default (and 1h/10m) links are born amber"). Instead we flag a link as
// expiring once it enters the LAST FRACTION of its own lifetime, clamped so ultra-short links still
// get a usable heads-up and multi-day links don't go amber days early.
//
// Kept side-effect-free (no Date.now(), no React) so the boundaries are unit-tested in Node per the
// node-env / no-renderer convention; link-display consumes it.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** The link is "expiring" once it has ≤ this share of its total lifetime left. */
export const EXPIRING_FRACTION = 0.2; // last 20% of the link's lifetime
/** Floor: even the shortest links get at least this much amber warning (ultra-short-link guard). */
export const EXPIRING_MIN_WINDOW_MS = MINUTE_MS; // 1 minute
/** Ceiling: long (multi-day) links never go amber more than this far ahead of real expiry. */
export const EXPIRING_MAX_WINDOW_MS = 24 * HOUR_MS; // 1 day

/**
 * The proportional "expiring soon" window for a link of `lifetimeMs` total lifetime: a fixed fraction
 * of the lifetime, clamped between the min floor and max ceiling. A non-positive lifetime (createdAt ≥
 * expiresAt, or unknown) collapses to the floor so the math never yields a zero/negative window.
 */
export function expiringWindowMs(lifetimeMs: number): number {
  const raw = lifetimeMs * EXPIRING_FRACTION;
  if (!(raw > EXPIRING_MIN_WINDOW_MS)) return EXPIRING_MIN_WINDOW_MS; // also catches NaN / ≤0
  if (raw > EXPIRING_MAX_WINDOW_MS) return EXPIRING_MAX_WINDOW_MS;
  return raw;
}

/**
 * Whether a still-live link should render as "Expiring soon". True only when it is within the
 * proportional window of `expiresAtMs` AND has not already expired (remaining > 0 — an already-expired
 * link is "Expired", never "expiring"). `createdAtMs`/`expiresAtMs`/`nowMs` are injected for
 * determinism.
 */
export function isExpiringSoon(input: {
  createdAtMs: number;
  expiresAtMs: number;
  nowMs: number;
}): boolean {
  const remaining = input.expiresAtMs - input.nowMs;
  if (remaining <= 0) return false; // already expired — handled as "Expired" upstream, not "expiring"
  const lifetime = input.expiresAtMs - input.createdAtMs;
  return remaining <= expiringWindowMs(lifetime);
}
