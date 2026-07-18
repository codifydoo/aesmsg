import { describe, expect, it } from "vitest";
import { matchesWipeConfirm, WIPE_CONFIRM_WORD } from "@/src/keys/wipe-confirm";

// matchesWipeConfirm gates the IRREVERSIBLE wipe action on the Wipe Identity screen (43): the
// destructive button stays disarmed until the user types the confirm word. Pure logic tested here per
// the node-env / no-React-renderer convention. Wiping is by-design unrecoverable, so getting this gate
// right matters — it must arm on the exact word (tolerating case + surrounding whitespace) and on
// nothing else.

describe("matchesWipeConfirm", () => {
  it("arms on the exact confirm word", () => {
    expect(matchesWipeConfirm(WIPE_CONFIRM_WORD)).toBe(true);
    expect(matchesWipeConfirm("WIPE")).toBe(true);
  });

  it("is case-insensitive (an autocapitalize keyboard or lowercase still arms)", () => {
    expect(matchesWipeConfirm("wipe")).toBe(true);
    expect(matchesWipeConfirm("Wipe")).toBe(true);
    expect(matchesWipeConfirm("wIpE")).toBe(true);
  });

  it("tolerates surrounding whitespace (a trailing space must not block confirmation)", () => {
    expect(matchesWipeConfirm("  WIPE")).toBe(true);
    expect(matchesWipeConfirm("WIPE ")).toBe(true);
    expect(matchesWipeConfirm("\tWIPE\n")).toBe(true);
  });

  it("does NOT arm on a near-miss, prefix, suffix, or interior space", () => {
    expect(matchesWipeConfirm("WIPED")).toBe(false);
    expect(matchesWipeConfirm("WIP")).toBe(false);
    expect(matchesWipeConfirm("WI PE")).toBe(false);
    expect(matchesWipeConfirm("please WIPE")).toBe(false);
    expect(matchesWipeConfirm("WIPE now")).toBe(false);
  });

  it("does NOT arm on empty / whitespace-only input", () => {
    expect(matchesWipeConfirm("")).toBe(false);
    expect(matchesWipeConfirm("   ")).toBe(false);
  });

  it("handles nullish input without throwing", () => {
    // The screen always passes a string, but guard the pure helper anyway.
    expect(matchesWipeConfirm(undefined as unknown as string)).toBe(false);
  });

  it("honors a custom confirm word (also case-insensitive)", () => {
    expect(matchesWipeConfirm("DELETE", "delete")).toBe(true);
    expect(matchesWipeConfirm("delete", "DELETE")).toBe(true);
    expect(matchesWipeConfirm("WIPE", "DELETE")).toBe(false);
  });
});
