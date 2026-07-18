// Friendly, spelled-out countdown strings for expiry / lock deadlines shown to the user.
//
// The Links detail row uses a compact "in 3h 42m" form (see links/link-display.ts). Some primary
// surfaces — notably the reader landing — previously dumped a raw `Date.toLocaleString()` ("Expires
// 5/9/2026, 11:04:22 PM"), which is jarring next to the calm countdowns used elsewhere. This helper
// produces the SPELLED-OUT variant the design's body copy wants ("in 2 hours", "in 3 days", "in 5
// minutes"), rounding to a single leading unit so it reads as a calm approximation, not a precise
// clock.
//
// Pure + `now`-injected so it is deterministic in tests (no Date.now() inside). No React /
// React Native imports — node-env testable per the apps/mobile convention.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * A spelled-out "time remaining" phrase for `ms` milliseconds, rounded to the largest sensible unit:
 *   <= 0            -> "now"
 *   < 1 minute      -> "in under a minute"
 *   < 1 hour        -> "in N minutes"   (e.g. "in 5 minutes")
 *   < 1 day         -> "in N hours"     (e.g. "in 2 hours")
 *   otherwise       -> "in N days"      (e.g. "in 3 days")
 * The singular unit is used at N === 1 ("in 1 hour", "in 1 day").
 */
export function friendlyRemaining(ms: number): string {
  if (ms <= 0) return "now";
  if (ms < MINUTE) return "in under a minute";
  if (ms < HOUR) return `in ${plural(Math.floor(ms / MINUTE), "minute")}`;
  if (ms < DAY) return `in ${plural(Math.floor(ms / HOUR), "hour")}`;
  return `in ${plural(Math.floor(ms / DAY), "day")}`;
}

/**
 * The reader-landing expiry recap for an ISO `expiresAt`, relative to `nowMs`.
 *   - The "never expires" sentinel (year >= 9999) -> "Never expires (revoke manually)".
 *   - Already past -> "Expired".
 *   - Otherwise a friendly countdown, e.g. "Expires in 2 hours".
 */
export function friendlyExpiryRecap(expiresAtIso: string, nowMs: number): string {
  const d = new Date(expiresAtIso);
  if (d.getUTCFullYear() >= 9999) return "Never expires (revoke manually)";
  const remaining = d.getTime() - nowMs;
  if (remaining <= 0) return "Expired";
  return `Expires ${friendlyRemaining(remaining)}`;
}
