// Pure bounds + formatting for the Pro "custom expiry" date/time. No React/native. The compose flow
// supplies the chosen Date; this validates it against [now+min, now+max] and renders a stable label.

import { MAX_LINK_LIFETIME_MS } from "@/src/create/expiry";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Minimum future window for a custom expiry (5 minutes) — avoids "already expired on creation". */
export const CUSTOM_EXPIRY_MIN_MS = 5 * MINUTE;

/**
 * Maximum custom expiry: the same 365-day bound as the free "1 year (maximum)" preset. Pinned to
 * MAX_LINK_LIFETIME_MS so a Pro custom date can never exceed the client max lifetime — which is also
 * the server's default retention ceiling (AESMSG_MAX_RETENTION_MS). Keeping them equal means the
 * server never rejects a Pro custom expiry the picker allowed.
 */
export const CUSTOM_EXPIRY_MAX_MS = MAX_LINK_LIFETIME_MS;

export type CustomExpiryCheck = { ok: true } | { ok: false; reason: "too-soon" | "too-far" };

export function validateCustomExpiry(date: Date, now: Date = new Date()): CustomExpiryCheck {
  const delta = date.getTime() - now.getTime();
  if (Number.isNaN(delta) || delta < CUSTOM_EXPIRY_MIN_MS) return { ok: false, reason: "too-soon" };
  if (delta > CUSTOM_EXPIRY_MAX_MS) return { ok: false, reason: "too-far" };
  return { ok: true };
}

/** Sensible initial value for the picker: 3 days out. */
export function customExpiryDefault(now: Date = new Date()): Date {
  return new Date(now.getTime() + 3 * DAY);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Dec 31, 2026, 09:30" — UTC-based so tests are timezone-stable. */
export function customExpirySummary(date: Date): string {
  const t = date.getTime();
  if (Number.isNaN(t)) return "";
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${hh}:${mm}`;
}
