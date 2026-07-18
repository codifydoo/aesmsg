// Pure helper: the type-to-confirm matching for the Wipe Identity screen (design grp-keys.jsx
// S_WipeConfirm, screen 43). The destructive "Wipe private key" action stays disarmed until the
// user types the confirmation word exactly — a deliberate friction gate on an IRREVERSIBLE action
// (wiping the device's private key is by-design unrecoverable: no backup, no recovery).
//
// Extracted (node-env testable, per the no-React-renderer convention) so WipeIdentityScreen.tsx
// stays thin & presentational. This is pure string comparison — it does NOT touch crypto or storage
// (the actual key wipe is owned by src/identity / src/settings and wired by Integration).

/** The word the user must type to arm the wipe. Lifted verbatim from the design ("Type WIPE…"). */
export const WIPE_CONFIRM_WORD = "WIPE";

/**
 * Whether the typed text arms the destructive wipe action.
 *
 * Matching is case-insensitive and ignores surrounding whitespace so an autocapitalize keyboard or a
 * stray trailing space never blocks a user who typed the right word. Interior characters still must
 * match exactly — "WI PE" or "WIPED" do NOT arm it.
 *
 * - matchesWipeConfirm("WIPE")    -> true
 * - matchesWipeConfirm("  wipe ") -> true
 * - matchesWipeConfirm("wiped")   -> false
 * - matchesWipeConfirm("")        -> false
 */
export function matchesWipeConfirm(input: string, word: string = WIPE_CONFIRM_WORD): boolean {
  return (input ?? "").trim().toUpperCase() === word.toUpperCase();
}
