import { setSentLinkReminderNotificationId } from "@/src/links/sent-links-store";
import { planExpiryReminder } from "@/src/notifications/expiry-plan";
import * as notifications from "@/src/notifications/notifications";
import { loadNotificationPrefs } from "@/src/notifications/prefs";
import { shouldSuppressForQuietHours } from "@/src/notifications/quiet-hours";

// Quiet hours: the reminder is suppressed (not scheduled) when its fire moment lands inside the
// user's quiet window — the "Quiet hours" toggle is thus enforced, not a placebo. See quiet-hours.ts
// for why a time-critical expiry reminder is suppressed rather than deferred.
//
// Best-effort: after a link is created, schedule the local "expiring soon" reminder if the user has
// the preference on, permission is granted, and the reminder time is still in the future, THEN persist
// the scheduled notification's id onto that link's local record so a later revoke can cancel the
// now-pointless reminder (see reminder-cancel.ts). Never blocks or surfaces an error to the create
// flow — a missing reminder (or a failed persist) must not break sending.
//
// Returns the scheduled notification id, or null when no reminder was scheduled: the preference is
// off, permission is not granted, the reminder time has already passed, or scheduling/persisting the
// id failed. Schedules AT MOST once (no double-schedule).
export async function scheduleExpiryReminderOnCreate(input: {
  id: string;
  expiresAt: Date;
}): Promise<string | null> {
  try {
    const prefs = await loadNotificationPrefs();
    if (!prefs.expiringSoon) return null;
    if ((await notifications.getPermissionStatus()) !== "granted") return null;
    const plan = planExpiryReminder({ expiresAtMs: input.expiresAt.getTime(), nowMs: Date.now() });
    if (!plan) return null;
    // Enforce quiet hours: skip a reminder that would fire during the user's silent window.
    if (shouldSuppressForQuietHours(plan.fireAtMs, prefs.quietHours)) return null;
    const notificationId = await notifications.scheduleLocal({
      title: "aesmsg",
      body: "A secure link is expiring soon.",
      fireAtMs: plan.fireAtMs,
      data: { linkId: input.id },
    });
    // Attach the reminder to the link's tracked record so revoking the link cancels it. If the record
    // isn't there (its create-time write failed, or the link was already deleted), this is a no-op.
    await setSentLinkReminderNotificationId(input.id, notificationId);
    return notificationId;
  } catch {
    // best-effort: scheduling or persisting the id must never break the just-created link.
    return null;
  }
}
