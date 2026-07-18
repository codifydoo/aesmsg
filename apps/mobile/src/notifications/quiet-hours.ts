// Quiet-hours enforcement decision for local notifications.
//
// The Notifications settings expose a "Quiet hours" window (from/to, e.g. 22:00 -> 07:00). Until now
// the toggle was PERSISTED BUT NOT ENFORCED — a placebo. This module makes it real: the create-time
// "expiring soon" reminder (the only local notification we schedule) is SUPPRESSED when its fire
// moment falls inside the user's quiet window, honouring "silence alerts during this window".
//
// Why suppress rather than defer: the expiry reminder is time-critical (it fires ~1h before a link
// expires). Deferring it to the end of quiet hours would routinely land AFTER the link is already
// gone, making it useless. So when the only useful fire time is inside the quiet window, we respect
// the user's request for silence and skip that reminder.
//
// Pure + side-effect-free except `localMinuteOfDay`, which reads the device clock's LOCAL time (that
// is what quiet hours means); the wrap-around window logic in `isWithinQuietHours` is fully pure and
// unit-tested directly. No React / React Native imports (node-env testable).

export interface QuietHoursConfig {
  enabled: boolean;
  /** "HH:MM" 24h local time the quiet window opens. */
  from: string;
  /** "HH:MM" 24h local time the quiet window closes. */
  to: string;
}

const MINUTES_PER_DAY = 24 * 60;

/** Parse "HH:MM" (24h) into minutes-since-local-midnight, or null when malformed / out of range. */
export function parseTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes since local midnight for an epoch-ms instant, using the device's local timezone. */
export function localMinuteOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Whether `minuteOfDay` (0..1439, local) is inside the quiet window. The window is treated as
 * [from, to): the opening minute is quiet, the closing minute is not. Handles the common overnight
 * wrap (from > to, e.g. 22:00 -> 07:00). Fails OPEN (returns false) when disabled or when either
 * bound is malformed — a bad config never silently swallows notifications. `from === to` means the
 * whole day is quiet (a deliberate "all day" window).
 */
export function isWithinQuietHours(minuteOfDay: number, quiet: QuietHoursConfig): boolean {
  if (!quiet.enabled) return false;
  const from = parseTimeToMinutes(quiet.from);
  const to = parseTimeToMinutes(quiet.to);
  if (from === null || to === null) return false;
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (from === to) return true; // whole-day quiet window
  if (from < to) return m >= from && m < to; // same-day window
  return m >= from || m < to; // overnight wrap
}

/**
 * Whether a reminder scheduled to fire at `fireAtMs` should be SUPPRESSED because it lands inside the
 * user's quiet hours. Convenience wrapper combining the local-time projection with the pure window
 * test; used by the create-time expiry-reminder scheduler.
 */
export function shouldSuppressForQuietHours(fireAtMs: number, quiet: QuietHoursConfig): boolean {
  return isWithinQuietHours(localMinuteOfDay(fireAtMs), quiet);
}
