// Activity inbox mock store + pure grouping / relative-time logic, extracted (node-env testable) so
// the .tsx screen stays thin & presentational, per the apps/mobile test convention.
//
// PRODUCT INVARIANT: an activity event carries COUNTS / METADATA ONLY — never message content. The
// `context` strings below describe the event (a link was opened, a link is expiring, a contact's key
// changed); they never quote plaintext. The zero-knowledge backend only ever holds ciphertext, so
// there is nothing here it could leak even if it wanted to.
//
// FOLLOW-UP (tracked): this is a presentational mock seeded from the design's exact S_Activity rows.
// Real activity is a later slice — a metadata-only event feed (link id + event kind + timestamp),
// derived from server-visible state changes, with NO content ever attached.

import type { ChipTone } from "@/src/components";

/**
 * The kind of activity event. Drives the row's icon + tone:
 *   - "opened"      → a recipient opened one of your links (violet / informational)
 *   - "expiring"    → a link is expiring soon (amber / caution — act before it's gone)
 *   - "key-changed" → a contact's key changed; re-verify the fingerprint (amber / caution)
 *   - "revoked"     → a link was revoked and its ciphertext purged from the server (violet)
 */
export type ActivityKind = "opened" | "expiring" | "key-changed" | "revoked";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  /** Short event title, e.g. "Link opened". Metadata only — never message content. */
  title: string;
  /** One-line context describing the event. Counts / metadata only — never plaintext. */
  context: string;
  /**
   * Event time as epoch milliseconds. The screen renders a relative label via {@link relativeTime}
   * and groups via {@link groupActivity}; storing the raw instant keeps the logic pure + testable.
   */
  timestamp: number;
  /** Whether the user has yet to see this event (drives the unread dot). */
  unread: boolean;
}

/** Visual treatment for an activity kind — icon glyph + chip/dot tone. Pure lookup, no rendering. */
export interface ActivityVisual {
  icon: string;
  tone: ChipTone;
}

const VISUALS: Record<ActivityKind, ActivityVisual> = {
  // Informational — a link was opened. Violet = brand/neutral activity, not a caution.
  opened: { icon: "visibility", tone: "violet" },
  // Caution — expiring soon. Amber per color semantics (expiring), never red (not destructive).
  expiring: { icon: "schedule", tone: "amber" },
  // Caution — a contact's key changed. Amber per color semantics (key changed → re-verify).
  "key-changed": { icon: "key", tone: "amber" },
  // Informational — a link was revoked + ciphertext purged. Violet, not red: the event already
  // happened; red is reserved for the destructive *action*, not for reporting it after the fact.
  revoked: { icon: "block", tone: "violet" },
};

/** The icon glyph + tone for an activity kind. */
export function activityVisual(kind: ActivityKind): ActivityVisual {
  return VISUALS[kind];
}

// ── Relative-time label ──────────────────────────────────────────────────────
// A compact label like the design's "2h" / "3h" / "Yesterday". Pure: takes the event instant and a
// reference "now" (injected so tests are deterministic — no Date.now() inside).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact relative-time label for an event at `timestamp` ms, relative to `now` ms.
 *   < 1 min            → "Now"
 *   < 1 hour           → "<m>m"   (e.g. "12m")
 *   < 24 hours         → "<h>h"   (e.g. "2h")
 *   yesterday (1 day)  → "Yesterday"
 *   < 7 days           → "<d>d"   (e.g. "3d")
 *   otherwise          → "<w>w"   (whole weeks)
 * Future timestamps (clock skew) clamp to "Now".
 */
export function relativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp;
  if (diff < MINUTE) return "Now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

// ── Time grouping ────────────────────────────────────────────────────────────
// The design groups rows under "Today" / "Yesterday" / "Earlier" section labels. Pure bucketing by
// calendar day relative to an injected `now`, so it is deterministic in tests.

export type ActivityBucket = "Today" | "Yesterday" | "Earlier";

export interface ActivityGroup {
  bucket: ActivityBucket;
  events: ActivityEvent[];
}

/** The calendar bucket an event falls into relative to `now` (local-day boundaries). */
export function bucketFor(timestamp: number, now: number): ActivityBucket {
  const startOfToday = startOfDay(now);
  if (timestamp >= startOfToday) return "Today";
  if (timestamp >= startOfToday - DAY) return "Yesterday";
  return "Earlier";
}

/**
 * Group events into Today / Yesterday / Earlier sections, newest-first within each, dropping empty
 * sections. Section order is fixed (Today → Yesterday → Earlier) regardless of input order.
 */
export function groupActivity(events: ActivityEvent[], now: number): ActivityGroup[] {
  const order: ActivityBucket[] = ["Today", "Yesterday", "Earlier"];
  const byBucket = new Map<ActivityBucket, ActivityEvent[]>();
  for (const ev of events) {
    const b = bucketFor(ev.timestamp, now);
    const list = byBucket.get(b) ?? [];
    list.push(ev);
    byBucket.set(b, list);
  }
  const groups: ActivityGroup[] = [];
  for (const bucket of order) {
    const list = byBucket.get(bucket);
    if (list && list.length > 0) {
      list.sort((a, b) => b.timestamp - a.timestamp);
      groups.push({ bucket, events: list });
    }
  }
  return groups;
}

/** Count of unread events — drives the "Mark all read" affordance + any tab badge. */
export function unreadCount(events: ActivityEvent[]): number {
  return events.reduce((n, e) => (e.unread ? n + 1 : n), 0);
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// NOTE: there is deliberately NO seeded sample feed here. Rendering fabricated security events
// ("Acme staging key was viewed", "Verify Maya's new fingerprint") as if they were this user's real
// activity is a trust hazard, so the screen renders the empty state until a real metadata-only event
// source exists. The grouping / relative-time helpers above stay and are exercised with test-local
// fixtures.
