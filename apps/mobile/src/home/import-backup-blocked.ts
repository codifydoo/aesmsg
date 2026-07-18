// Pure copy + routing for the Home hub's "Import backup" quick action.
//
// Restoring an encrypted backup REPLACES the device's active identity. On Home that identity always
// exists (Home only renders inside the unlocked shell), so the tile must never auto-start a
// destructive restore. Instead it surfaces a calm, non-destructive note that explains the
// consequence and points the user to the Wipe flow in Settings — the deliberate, single-purpose
// place to clear the current identity before a fresh-install restore.
//
// Keeping this here (pure, no React) lets the copy + destination be unit-tested per the node-env /
// no-renderer convention, so HomeScreen stays presentational.

import type { Tab } from "@/src/navigation/tabs";

/** The Wipe flow lives in Settings — the note routes the user there. */
export const IMPORT_BLOCKED_DESTINATION_TAB: Tab = "settings";

/** The note shown when "Import backup" is tapped while an identity already exists. */
export interface ImportBackupBlockedNote {
  title: string;
  body: string;
  cta: string;
  destinationTab: Tab;
}

/**
 * Copy for the non-destructive "Import backup" note. In-voice and calm: it names the consequence
 * (a restore replaces this identity) and the required precondition (wipe the current identity in
 * Settings first), without destructive language or banned marketing words.
 */
export function importBackupBlockedNote(): ImportBackupBlockedNote {
  return {
    title: "You already have an identity",
    body:
      "Restoring a backup replaces the identity on this device. To restore a different one, wipe " +
      "the current identity in Settings first.",
    cta: "Go to Settings",
    destinationTab: IMPORT_BLOCKED_DESTINATION_TAB,
  };
}
