import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, WHEN_UNLOCKED_THIS_DEVICE_ONLY } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  getItemAsync: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

import {
  DEFAULT_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  updateNotificationPrefs,
} from "@/src/notifications/prefs";
import { isWithinQuietHours } from "@/src/notifications/quiet-hours";

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("notification prefs", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await loadNotificationPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("round-trips saved prefs", async () => {
    const next = { ...DEFAULT_PREFS, expiringSoon: false };
    await saveNotificationPrefs(next);
    expect(await loadNotificationPrefs()).toEqual(next);
  });

  it("merges a partial patch over the current prefs and returns the result", async () => {
    const result = await updateNotificationPrefs({ permissionPrimed: true });
    expect(result.permissionPrimed).toBe(true);
    expect(result.expiringSoon).toBe(DEFAULT_PREFS.expiringSoon);
    expect((await loadNotificationPrefs()).permissionPrimed).toBe(true);
  });

  it("backfills newly-added keys when stored JSON predates them", async () => {
    // A stored blob missing quietHours / permissionPrimed must not lose the new defaults.
    store.set("aesmsg.notification-prefs", JSON.stringify({ expiringSoon: false }));
    const loaded = await loadNotificationPrefs();
    expect(loaded.expiringSoon).toBe(false);
    expect(loaded.quietHours).toEqual(DEFAULT_PREFS.quietHours);
    expect(loaded.permissionPrimed).toBe(false);
  });

  it("falls back to defaults on corrupt JSON", async () => {
    store.set("aesmsg.notification-prefs", "{not json");
    expect(await loadNotificationPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe("quiet-hours default is opt-in", () => {
  // 02:00 local — squarely inside the default 22:00→07:00 window, so it is the discriminating time:
  // suppressed only if quiet hours are actually enabled.
  const TWO_AM = 2 * 60;

  it("defaults quiet hours to DISABLED while keeping the 22:00–07:00 window", () => {
    expect(DEFAULT_PREFS.quietHours.enabled).toBe(false);
    expect(DEFAULT_PREFS.quietHours.from).toBe("22:00");
    expect(DEFAULT_PREFS.quietHours.to).toBe("07:00");
  });

  it("does NOT suppress an in-window reminder under the default (disabled) prefs", async () => {
    // A fresh install (nothing stored) → defaults → a reminder at 02:00 (inside 22:00–07:00) is NOT
    // silenced, so night-time expiry reminders still reach the user until they opt in.
    const prefs = await loadNotificationPrefs();
    expect(prefs.quietHours.enabled).toBe(false);
    expect(isWithinQuietHours(TWO_AM, prefs.quietHours)).toBe(false);
  });

  it("DOES suppress the same in-window reminder once the user enables quiet hours", async () => {
    const next = await updateNotificationPrefs({ quietHours: { enabled: true } });
    expect(next.quietHours).toEqual({ enabled: true, from: "22:00", to: "07:00" });
    // With the toggle on, the 02:00 reminder now lands inside the quiet window and is suppressed —
    // enforcement still really works, it's just no longer on by default.
    expect(isWithinQuietHours(TWO_AM, next.quietHours)).toBe(true);
    // 12:00 (outside the window) is still delivered even when quiet hours are enabled.
    expect(isWithinQuietHours(12 * 60, next.quietHours)).toBe(false);
  });
});
