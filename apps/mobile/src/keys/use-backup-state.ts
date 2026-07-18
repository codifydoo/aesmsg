import { useCallback, useEffect, useState } from "react";
import {
  type BackupState,
  DEFAULT_BACKUP_STATE,
  loadBackupState,
  markNudgeSeen as persistNudgeSeen,
  shouldShowBackupNudge,
  shouldShowBackupReminder,
  withNudgeSeen,
} from "@/src/keys/backup-state";

// React binding for the persisted backup-state (PG-11). Loads the flag once on mount; the Home
// surface remounts on every tab switch (App renders <HomeFlow/> only while the Encrypt tab is active),
// so a fresh mount naturally re-reads the store after an export completes on the Keys tab — no
// cross-tab event bus needed. Kept out of the pure backup-state module so that stays node-testable.

export interface UseBackupState {
  /** True until the first load resolves (defaults shown meanwhile — nothing renders on Home yet). */
  loading: boolean;
  /** Whether an encrypted backup has ever completed on this device. */
  backedUp: boolean;
  /** Show the persistent passive reminder (iff not backed up, once loaded). */
  showReminder: boolean;
  /** Show the one-time onboarding nudge (iff never backed up AND never nudged, once loaded). */
  showNudge: boolean;
  /** Persist that the one-time nudge was surfaced (optimistic) so it won't auto-reappear. */
  markNudgeSeen: () => void;
}

export function useBackupState(): UseBackupState {
  const [state, setState] = useState<BackupState | null>(null);

  useEffect(() => {
    let alive = true;
    void loadBackupState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const markSeen = useCallback(() => {
    setState((prev) => (prev ? withNudgeSeen(prev) : prev));
    // Fire-and-forget persist; a write failure just means the nudge may show once more — harmless.
    void persistNudgeSeen().catch((err) => {
      console.warn("[backup-state] failed to persist nudge-seen", err);
    });
  }, []);

  const resolved = state ?? DEFAULT_BACKUP_STATE;
  const loading = state === null;

  return {
    loading,
    backedUp: resolved.backedUp,
    showReminder: !loading && shouldShowBackupReminder(resolved),
    showNudge: !loading && shouldShowBackupNudge(resolved),
    markNudgeSeen: markSeen,
  };
}
