import * as SecureStore from "expo-secure-store";

// Local notification preferences. Not secret, but stored via SecureStore (already a dependency) with
// the device-local accessibility class so they share the app's no-iCloud-sync posture and we avoid
// adding an AsyncStorage native module. Stored as one JSON blob under a single key. Loads merge over
// DEFAULT_PREFS so a stored blob written by an older build (missing newer keys) backfills defaults.

const KEY = "aesmsg.notification-prefs";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface NotificationPrefs {
  /** Inert this round (no remote push yet); value persisted so it lights up later. */
  linkOpened: boolean;
  /** Gates the on-device "expiring soon" reminder. */
  expiringSoon: boolean;
  /** Inert this round (contact-verification feature); value persisted. */
  keyChanged: boolean;
  /**
   * Enforced for the local "expiring soon" reminder: a reminder whose fire time lands inside this
   * window is suppressed (see quiet-hours.ts + expiry-reminder.ts). Also persisted for future
   * remote-push alerts once those exist.
   */
  quietHours: { enabled: boolean; from: string; to: string };
  /** Whether the soft permission-priming sheet has been shown once. */
  permissionPrimed: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  linkOpened: true,
  expiringSoon: true,
  keyChanged: true,
  // Opt-in: quiet hours are DISABLED by default. Since a reminder that would fire in-window is
  // suppressed (never deferred — see quiet-hours.ts), enabling this by default would silently drop
  // night-time "expiring soon" reminders for users who never asked for it. We keep a sensible
  // 22:00–07:00 window so turning the toggle ON yields a good default window immediately.
  quietHours: { enabled: false, from: "22:00", to: "07:00" },
  permissionPrimed: false,
};

// Fresh copy of the defaults (incl. a new nested quietHours) so callers can never mutate the
// shared DEFAULT_PREFS constant via a returned value.
function freshDefaults(): NotificationPrefs {
  return { ...DEFAULT_PREFS, quietHours: { ...DEFAULT_PREFS.quietHours } };
}

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return freshDefaults();
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      quietHours: { ...DEFAULT_PREFS.quietHours, ...(parsed.quietHours ?? {}) },
    };
  } catch {
    return freshDefaults();
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(prefs), OPTIONS);
}

export async function updateNotificationPrefs(
  // quietHours accepts a partial: the merge below applies it field-wise over the stored value.
  patch: Partial<Omit<NotificationPrefs, "quietHours">> & {
    quietHours?: Partial<NotificationPrefs["quietHours"]>;
  },
): Promise<NotificationPrefs> {
  const current = await loadNotificationPrefs();
  const next: NotificationPrefs = {
    ...current,
    ...patch,
    quietHours: { ...current.quietHours, ...(patch.quietHours ?? {}) },
  };
  await saveNotificationPrefs(next);
  return next;
}
