import { describe, expect, it } from "vitest";
import {
  IMPORT_BLOCKED_DESTINATION_TAB,
  importBackupBlockedNote,
} from "@/src/home/import-backup-blocked";

// Pure-logic test for the Home "Import backup" tile guard. When an identity already exists (always
// true on Home — it only renders in the unlocked shell), tapping the tile must NOT start a
// destructive restore. It surfaces a calm, non-destructive note pointing the user to the Wipe flow
// in Settings. This module owns the copy + the destination so the screen stays presentational.

describe("import-backup-blocked note", () => {
  it("directs the user to the Settings tab (where the Wipe flow lives)", () => {
    expect(IMPORT_BLOCKED_DESTINATION_TAB).toBe("settings");
  });

  it("explains that restoring replaces the current identity and requires a Wipe first", () => {
    const note = importBackupBlockedNote();
    expect(note.title).toBe("You already have an identity");
    // Body names the consequence (replace) and the required precondition (wipe first).
    expect(note.body).toMatch(/replace/i);
    expect(note.body).toMatch(/wipe/i);
    expect(note.cta).toBe("Go to Settings");
    expect(note.destinationTab).toBe(IMPORT_BLOCKED_DESTINATION_TAB);
  });

  it("uses calm, in-voice copy with no banned words", () => {
    const note = importBackupBlockedNote();
    const text = `${note.title} ${note.body} ${note.cta}`.toLowerCase();
    for (const banned of [
      "unbreakable",
      "military-grade",
      "impossible",
      "forgot passphrase",
      "100%",
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});
