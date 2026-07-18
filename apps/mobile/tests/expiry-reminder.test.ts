import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPrefs } from "@/src/notifications/prefs";

// scheduleExpiryReminderOnCreate is the create-time orchestration: schedule the local "expiring soon"
// reminder (when the pref is on, permission is granted, and the fire time is still ahead), then PERSIST
// its notification id onto the link's tracked record so a later revoke can cancel it (Task 2.10's
// reminder-cancel path). All three collaborators are DI'd via module mocks so this stays node-testable
// with no native modules and no React renderer; expiry-plan is pure and used for real.

const { loadNotificationPrefsMock, getPermissionStatusMock, scheduleLocalMock, setReminderIdMock } =
  vi.hoisted(() => ({
    loadNotificationPrefsMock: vi.fn(),
    getPermissionStatusMock: vi.fn(),
    scheduleLocalMock: vi.fn(),
    setReminderIdMock: vi.fn(),
  }));

vi.mock("@/src/notifications/prefs", () => ({
  loadNotificationPrefs: loadNotificationPrefsMock,
}));

vi.mock("@/src/notifications/notifications", () => ({
  getPermissionStatus: getPermissionStatusMock,
  scheduleLocal: scheduleLocalMock,
}));

// The store is mocked so this test never touches the encrypted-at-rest blob under node-env.
// __deleteSentLinksStoreForTests is stubbed because tests/setup.ts calls it on every run.
vi.mock("@/src/links/sent-links-store", () => ({
  setSentLinkReminderNotificationId: setReminderIdMock,
  __deleteSentLinksStoreForTests: vi.fn(async () => {}),
}));

import { scheduleExpiryReminderOnCreate } from "@/src/notifications/expiry-reminder";

// Quiet hours OFF for the happy-path fixture so scheduling is independent of the machine's local
// timezone / wall-clock (the reminder fires ~23h out, which could otherwise land inside a real quiet
// window intermittently). Quiet-hours enforcement gets its own deterministic cases below.
const PREFS_ON: NotificationPrefs = {
  linkOpened: true,
  expiringSoon: true,
  keyChanged: true,
  quietHours: { enabled: false, from: "22:00", to: "07:00" },
  permissionPrimed: true,
};

// Far enough ahead that planExpiryReminder (fires one hour before expiry) has a future fire time.
function futureExpiry(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

describe("scheduleExpiryReminderOnCreate", () => {
  beforeEach(() => {
    loadNotificationPrefsMock.mockReset();
    getPermissionStatusMock.mockReset();
    scheduleLocalMock.mockReset();
    setReminderIdMock.mockReset();
    // Sensible defaults for the happy path; individual cases override.
    loadNotificationPrefsMock.mockResolvedValue(PREFS_ON);
    getPermissionStatusMock.mockResolvedValue("granted");
    scheduleLocalMock.mockResolvedValue("notif-scheduled-1");
    setReminderIdMock.mockResolvedValue(undefined);
  });

  it("schedules the reminder, persists its id on the record, and returns the id", async () => {
    const id = await scheduleExpiryReminderOnCreate({
      id: "link000000000001",
      expiresAt: futureExpiry(),
    });

    expect(scheduleLocalMock).toHaveBeenCalledTimes(1);
    expect(scheduleLocalMock.mock.calls[0]?.[0]).toMatchObject({
      title: "aesmsg",
      data: { linkId: "link000000000001" },
    });
    // The scheduled id is threaded onto the link's tracked record so revoke can cancel it later.
    expect(setReminderIdMock).toHaveBeenCalledWith("link000000000001", "notif-scheduled-1");
    expect(id).toBe("notif-scheduled-1");
  });

  it("does nothing (no schedule, no persist, null) when the expiringSoon pref is off", async () => {
    loadNotificationPrefsMock.mockResolvedValue({ ...PREFS_ON, expiringSoon: false });

    const id = await scheduleExpiryReminderOnCreate({
      id: "link000000000002",
      expiresAt: futureExpiry(),
    });

    expect(id).toBeNull();
    expect(scheduleLocalMock).not.toHaveBeenCalled();
    expect(setReminderIdMock).not.toHaveBeenCalled();
  });

  it("does nothing when notifications permission is not granted", async () => {
    getPermissionStatusMock.mockResolvedValue("denied");

    const id = await scheduleExpiryReminderOnCreate({
      id: "link000000000003",
      expiresAt: futureExpiry(),
    });

    expect(id).toBeNull();
    expect(scheduleLocalMock).not.toHaveBeenCalled();
    expect(setReminderIdMock).not.toHaveBeenCalled();
  });

  it("does nothing when the reminder time has already passed (expiry within the lead window)", async () => {
    // Expiry is 10 minutes out; the reminder fires one hour before → planExpiryReminder returns null.
    const soon = new Date(Date.now() + 10 * 60 * 1000);

    const id = await scheduleExpiryReminderOnCreate({ id: "link000000000004", expiresAt: soon });

    expect(id).toBeNull();
    expect(scheduleLocalMock).not.toHaveBeenCalled();
    expect(setReminderIdMock).not.toHaveBeenCalled();
  });

  it("suppresses the reminder when it would fire during quiet hours (enforced, not a placebo)", async () => {
    // A whole-day quiet window (from === to) guarantees the fire time is inside quiet hours in ANY
    // timezone, so the suppression is asserted deterministically.
    loadNotificationPrefsMock.mockResolvedValue({
      ...PREFS_ON,
      quietHours: { enabled: true, from: "09:00", to: "09:00" },
    });

    const id = await scheduleExpiryReminderOnCreate({
      id: "link000000000007",
      expiresAt: futureExpiry(),
    });

    expect(id).toBeNull();
    expect(scheduleLocalMock).not.toHaveBeenCalled();
    expect(setReminderIdMock).not.toHaveBeenCalled();
  });

  it("still schedules when quiet hours is disabled", async () => {
    loadNotificationPrefsMock.mockResolvedValue({
      ...PREFS_ON,
      quietHours: { enabled: false, from: "09:00", to: "09:00" },
    });

    const id = await scheduleExpiryReminderOnCreate({
      id: "link000000000008",
      expiresAt: futureExpiry(),
    });

    expect(id).toBe("notif-scheduled-1");
    expect(scheduleLocalMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a scheduling failure: returns null, never persists, never throws", async () => {
    scheduleLocalMock.mockRejectedValue(new Error("expo-notifications unavailable"));

    const id = await scheduleExpiryReminderOnCreate({
      id: "link000000000005",
      expiresAt: futureExpiry(),
    });

    expect(id).toBeNull();
    expect(setReminderIdMock).not.toHaveBeenCalled();
  });

  it("swallows a persist failure: still schedules, returns null, never throws", async () => {
    // The reminder was scheduled, but writing its id onto the record failed — best-effort: the created
    // link is never affected, and returning null honestly reports "no reminder id was persisted".
    setReminderIdMock.mockRejectedValue(new Error("encrypted-storage write failed"));

    const id = await scheduleExpiryReminderOnCreate({
      id: "link000000000006",
      expiresAt: futureExpiry(),
    });

    expect(scheduleLocalMock).toHaveBeenCalledTimes(1);
    expect(id).toBeNull();
  });
});
