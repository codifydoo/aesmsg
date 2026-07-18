import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKUP_STATE,
  normalizeBackupState,
  shouldShowBackupNudge,
  shouldShowBackupReminder,
  withBackedUp,
  withNudgeSeen,
} from "@/src/keys/backup-state";

// backup-state.ts imports { DecryptionError, getEncryptedStore } from "@/src/storage", which pulls in
// native expo-file-system at module load. We only exercise the PURE decisions + transitions here, so
// mock the storage barrel with harmless stubs (same convention as settings-store.test.ts) — no native
// module loads and no persistence is touched. getEncryptedStore returns a benign no-op store: the
// pure functions under test never call it, and it keeps setup.ts's cross-store reset hooks
// (contacts / sent-links / settings) happy without hitting a real backend.
vi.mock("@/src/storage", () => {
  const noopStore = {
    getJson: vi.fn(async () => null),
    setJson: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  };
  return {
    DecryptionError: class DecryptionError extends Error {},
    getEncryptedStore: vi.fn(async () => noopStore),
    // setup.ts's global beforeEach calls this on the storage barrel; provide a no-op so the hook runs.
    __resetEncryptedStoreForTests: vi.fn(() => {}),
  };
});

describe("backup-state reminder + nudge decisions (PG-11)", () => {
  it("reminds while not backed up, and stops the moment a backup exists", () => {
    // The persistent, passive reminder shows iff no backup exists.
    expect(shouldShowBackupReminder(DEFAULT_BACKUP_STATE)).toBe(true);
    expect(shouldShowBackupReminder(withBackedUp(DEFAULT_BACKUP_STATE, 1_000))).toBe(false);
  });

  it("keeps reminding after 'Later' — the reminder is independent of the one-time nudge", () => {
    // Tapping "Later" only marks the nudge seen; a backup still doesn't exist, so the passive
    // reminder must persist.
    expect(shouldShowBackupReminder(withNudgeSeen(DEFAULT_BACKUP_STATE))).toBe(true);
  });

  it("shows the one-time nudge only until it is seen OR a backup exists", () => {
    expect(shouldShowBackupNudge(DEFAULT_BACKUP_STATE)).toBe(true);
    expect(shouldShowBackupNudge(withNudgeSeen(DEFAULT_BACKUP_STATE))).toBe(false);
    expect(shouldShowBackupNudge(withBackedUp(DEFAULT_BACKUP_STATE, 1))).toBe(false);
  });
});

describe("withBackedUp — the export-complete transition", () => {
  it("moves never-backed-up -> backed-up, records the timestamp, and implies the nudge is done", () => {
    expect(DEFAULT_BACKUP_STATE.backedUp).toBe(false);
    const next = withBackedUp(DEFAULT_BACKUP_STATE, 1_700_000_000_000);
    expect(next.backedUp).toBe(true);
    expect(next.backedUpAt).toBe(1_700_000_000_000);
    expect(next.nudgeSeen).toBe(true);
  });

  it("does not mutate the input state", () => {
    const before = { ...DEFAULT_BACKUP_STATE };
    withBackedUp(DEFAULT_BACKUP_STATE, 42);
    expect(DEFAULT_BACKUP_STATE).toEqual(before);
  });
});

describe("normalizeBackupState — fail-soft coercion", () => {
  it("coerces junk / missing fields to the safe default (not backed up)", () => {
    expect(normalizeBackupState(null)).toEqual(DEFAULT_BACKUP_STATE);
    expect(normalizeBackupState("nope")).toEqual(DEFAULT_BACKUP_STATE);
    expect(normalizeBackupState({})).toEqual(DEFAULT_BACKUP_STATE);
  });

  it("keeps a valid backed-up record and drops a bogus timestamp", () => {
    expect(normalizeBackupState({ backedUp: true, backedUpAt: 123, nudgeSeen: true })).toEqual({
      backedUp: true,
      backedUpAt: 123,
      nudgeSeen: true,
    });
    // Claims backed up but the timestamp is garbage -> still backed up, ts falls back to 0.
    expect(normalizeBackupState({ backedUp: true, backedUpAt: -5 })).toEqual({
      backedUp: true,
      backedUpAt: 0,
      nudgeSeen: false,
    });
  });
});
