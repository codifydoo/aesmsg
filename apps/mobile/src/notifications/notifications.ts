import * as Notifications from "expo-notifications";
import type { PermissionStatus } from "@/src/notifications/prime-decision";

// Thin DI seam over expo-notifications so the rest of the app depends on this small interface (and
// so the native module is imported in exactly one place). Not unit-tested — verified on device.

function toStatus(status: Notifications.PermissionStatus): PermissionStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function getPermissionStatus(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return toStatus(status);
}

export async function requestPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync();
  return toStatus(status);
}

export interface ScheduleLocalInput {
  title: string;
  body: string;
  fireAtMs: number;
  data?: Record<string, unknown>;
}

export async function scheduleLocal(input: ScheduleLocalInput): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title: input.title, body: input.body, data: input.data ?? {} },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(input.fireAtMs),
    },
  });
}

// Counterpart to scheduleLocal: cancel a previously-scheduled local reminder (e.g. when its link
// is revoked or opened early). Part of the seam's schedule/cancel pair.
export async function cancel(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

// Present alerts even while the app is foregrounded (a reminder that fires in-app is still useful).
// Call once at app startup — setNotificationHandler is process-global (last-writer-wins).
export function configureForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Fires when the user taps a notification. Returns a subscription with remove().
export function addResponseListener(handler: (data: Record<string, unknown>) => void): {
  remove: () => void;
} {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data ?? {});
  });
}
