import { describe, expect, it } from "vitest";
import { deriveInitials } from "@/src/components/initials";

// deriveInitials backs the Avatar primitive; per the node-env / no-React-renderer convention the
// pure logic is tested here, not by rendering Avatar.

describe("deriveInitials", () => {
  it("takes first + last token initials for multi-word names", () => {
    expect(deriveInitials("Ada Lovelace")).toBe("AL");
    expect(deriveInitials("Grace Brewster Hopper")).toBe("GH"); // first + LAST, not first two
  });

  it("takes a single letter for single-token names", () => {
    expect(deriveInitials("ada")).toBe("A");
    expect(deriveInitials("Bob")).toBe("B");
  });

  it("always uppercases", () => {
    expect(deriveInitials("jean picard")).toBe("JP");
  });

  it("strips punctuation / symbols inside tokens", () => {
    expect(deriveInitials("Jean-Luc Picard")).toBe("JP");
    expect(deriveInitials("  Q3   board  ")).toBe("QB");
  });

  it("never returns empty — falls back to '?'", () => {
    expect(deriveInitials("")).toBe("?");
    expect(deriveInitials("   ")).toBe("?");
    expect(deriveInitials("***")).toBe("?");
  });

  it("handles names with extra internal whitespace", () => {
    expect(deriveInitials("Ada    Lovelace")).toBe("AL");
  });
});
