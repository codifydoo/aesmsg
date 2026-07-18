import { describe, expect, it } from "vitest";
import { formatFingerprintLines } from "@/src/keys/fingerprint-lines";

// formatFingerprintLines backs the My Public Key (screen 40) identity card's two-line fingerprint
// block. Pure logic tested here per the node-env / no-React-renderer convention.

describe("formatFingerprintLines", () => {
  it("lays a 16-group fingerprint out as two lines of four 4-char groups (the design layout)", () => {
    expect(formatFingerprintLines("E82F4D11A9C277BE3A905FA10C8A9E21")).toEqual([
      "E82F 4D11 A9C2 77BE",
      "3A90 5FA1 0C8A 9E21",
    ]);
  });

  it("normalizes existing whitespace first, so layout is independent of input spacing", () => {
    expect(formatFingerprintLines("E82F 4D11 A9C2 77BE 3A90 5FA1 0C8A 9E21")).toEqual([
      "E82F 4D11 A9C2 77BE",
      "3A90 5FA1 0C8A 9E21",
    ]);
  });

  it("keeps a single short line when there are fewer than groupsPerLine groups", () => {
    expect(formatFingerprintLines("A1B2C3D4")).toEqual(["A1B2 C3D4"]);
  });

  it("keeps trailing partial groups and a trailing partial line (never pads)", () => {
    expect(formatFingerprintLines("A1B2C3D4E5")).toEqual(["A1B2 C3D4 E5"]);
    // 6 groups, 4 per line -> one full line of 4, one short line of 2.
    expect(formatFingerprintLines("AABBCCDDEEFFAABBCCDD", 2, 4)).toEqual([
      "AA BB CC DD",
      "EE FF AA BB",
      "CC DD",
    ]);
  });

  it("honors custom group size and groups-per-line", () => {
    expect(formatFingerprintLines("AABBCC", 2, 2)).toEqual(["AA BB", "CC"]);
    expect(formatFingerprintLines("ABCDEF", 3, 1)).toEqual(["ABC", "DEF"]);
  });

  it("clamps non-positive sizes to 1 instead of hanging", () => {
    expect(formatFingerprintLines("ABCD", 0, 0)).toEqual(["A", "B", "C", "D"]);
    expect(formatFingerprintLines("ABCD", -3, -3)).toEqual(["A", "B", "C", "D"]);
  });

  it("returns an empty array for empty / whitespace input", () => {
    expect(formatFingerprintLines("")).toEqual([]);
    expect(formatFingerprintLines("   ")).toEqual([]);
  });
});
