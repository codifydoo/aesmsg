// Backup-state: the tiny persisted record of whether this device's identity has EVER been exported
// as an encrypted backup, plus whether the one-time onboarding nudge has been shown (PG-11 / R20).
//
// WHY THIS EXISTS: the security model is "lost/wrong private key = unrecoverable, no fallback", so an
// encrypted backup export is the ONLY recovery path. Yet backup is opt-in and easy to skip — a user
// can set up, use the app, lose their phone, and permanently lose their identity (and the ability to
// revoke every link they ever sent). So we (a) drive backup creation right after setup with the
// stakes stated, and (b) keep a calm, passive "not backed up" reminder until a backup exists.
//
// The pure decisions + transitions live here (node-testable, no React) so the Home surface and the
// onboarding nudge stay presentational. Persistence layers over the single shared EncryptedStore
// (same pattern as settings-store.ts); every read is fail-soft so a corrupt byte can never brick
// startup. The blob is cleared by the identity wipe (wipeEncryptedStorage → store.clear()), so a
// fresh identity always starts as "not backed up".

import { DecryptionError, getEncryptedStore } from "@/src/storage";

/** Canonical blob key for the backup-state domain inside the shared EncryptedStore. */
export const BACKUP_STATE_BLOB_KEY = "backup-state" as const;

export interface BackupState {
  /** True once an encrypted backup export has completed at least once on this device. */
  backedUp: boolean;
  /** Epoch ms of the most recent completed export, or 0 when never backed up. */
  backedUpAt: number;
  /** True once the one-time post-setup backup nudge has been surfaced (so it won't auto-reappear). */
  nudgeSeen: boolean;
}

/** First-run state: nothing backed up, nudge not yet shown. */
export const DEFAULT_BACKUP_STATE: BackupState = {
  backedUp: false,
  backedUpAt: 0,
  nudgeSeen: false,
};

/** Coerce an unknown persisted/blob value into a complete, well-typed BackupState. Never throws. */
export function normalizeBackupState(raw: unknown): BackupState {
  if (raw === null || typeof raw !== "object") return { ...DEFAULT_BACKUP_STATE };
  const r = raw as Partial<Record<keyof BackupState, unknown>>;
  const backedUp = r.backedUp === true;
  const backedUpAt =
    typeof r.backedUpAt === "number" && Number.isFinite(r.backedUpAt) && r.backedUpAt > 0
      ? r.backedUpAt
      : 0;
  return {
    backedUp,
    // A record that claims backedUp but lost its timestamp is still "backed up"; keep 0 for the ts.
    backedUpAt: backedUp ? backedUpAt : 0,
    nudgeSeen: r.nudgeSeen === true,
  };
}

// --- Pure decisions (the reminder + onboarding-nudge logic) -----------------------------------

/**
 * The one-time, post-setup onboarding push. Show it only while the identity has never been backed up
 * AND the nudge has not been surfaced yet — so it appears once and is never a modal on every launch.
 */
export function shouldShowBackupNudge(state: BackupState): boolean {
  return !state.backedUp && !state.nudgeSeen;
}

/**
 * The persistent, passive "not backed up" reminder. Shows whenever no backup exists — independent of
 * the nudge, so it keeps reminding calmly after the user taps "Later". Clears the moment a backup
 * completes.
 */
export function shouldShowBackupReminder(state: BackupState): boolean {
  return !state.backedUp;
}

// --- Pure transitions -------------------------------------------------------------------------

/** Mark an export as complete at `at` (epoch ms). Idempotent; also implies the nudge is done. */
export function withBackedUp(state: BackupState, at: number): BackupState {
  return { ...state, backedUp: true, backedUpAt: at, nudgeSeen: true };
}

/** Record that the one-time nudge has been surfaced (so it won't auto-reappear). */
export function withNudgeSeen(state: BackupState): BackupState {
  return { ...state, nudgeSeen: true };
}

// --- Persistence (fail-soft over the shared EncryptedStore) -----------------------------------

/**
 * Load the persisted backup-state, normalised. Returns DEFAULT_BACKUP_STATE when nothing is stored,
 * the blob is undecryptable, or any unexpected error occurs. Never throws.
 */
export async function loadBackupState(): Promise<BackupState> {
  try {
    const store = await getEncryptedStore();
    const raw = await store.getJson<unknown>(BACKUP_STATE_BLOB_KEY);
    if (raw === null) return { ...DEFAULT_BACKUP_STATE };
    return normalizeBackupState(raw);
  } catch (err) {
    if (err instanceof DecryptionError) {
      console.warn("[backup-state] undecryptable blob; falling back to defaults");
    } else {
      console.warn("[backup-state] failed to load; falling back to defaults", err);
    }
    return { ...DEFAULT_BACKUP_STATE };
  }
}

/** Read-modify-write helper so concurrent flags (backedUp / nudgeSeen) never clobber each other. */
async function updateBackupState(mutate: (prev: BackupState) => BackupState): Promise<BackupState> {
  const store = await getEncryptedStore();
  const prev = await loadBackupState();
  const next = mutate(prev);
  await store.setJson(BACKUP_STATE_BLOB_KEY, next);
  return next;
}

/**
 * Record that an encrypted backup export has completed. Called when the export flow reaches its
 * success state (see ExportBackupScreen). Also marks the nudge as seen so it never reappears.
 */
export async function markBackedUp(at: number = Date.now()): Promise<BackupState> {
  return updateBackupState((prev) => withBackedUp(prev, at));
}

/** Record that the one-time backup nudge has been surfaced. */
export async function markNudgeSeen(): Promise<BackupState> {
  return updateBackupState(withNudgeSeen);
}
