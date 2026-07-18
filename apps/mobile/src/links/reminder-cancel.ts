import type { SentLinkRecord } from "@/src/links/sent-links-store";

// Pure decision: which scheduled local reminder to cancel when a tracked link is killed early.
//
// A link's "expiring soon" reminder (expo-notifications, scheduled at create time) becomes pointless
// the moment the link is revoked — the recipient can no longer open it, so a "your link is expiring"
// nudge would be noise. When the reminder's notification id was persisted on the record at create
// time, revoking cancels it; legacy records and links whose reminder was never scheduled carry no id
// and resolve to null (a no-op).
//
// Side-effect-free (no expo-notifications import) so the cancel DECISION is node-testable; the actual
// cancellation goes through the injected `cancelReminder` dep (use-sent-links.ts).

/**
 * The reminder notification id to cancel for this link, or null when there is nothing to cancel
 * (no record, a legacy record, or a link created without a scheduled reminder).
 */
export function reminderCancelTarget(record: SentLinkRecord | null): string | null {
  return record?.reminderNotificationId ?? null;
}
