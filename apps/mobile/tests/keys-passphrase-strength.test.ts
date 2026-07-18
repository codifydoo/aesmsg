import { describe, expect, it } from "vitest";
import {
  estimatePassphraseBits,
  evaluatePassphrase,
  MIN_EXPORT_ENTROPY_BITS,
  MIN_PASSPHRASE_LENGTH,
  scorePassphrase,
} from "@/src/keys/passphrase-strength";

// Pure logic for the Export Backup (screen 41) strength meter + requirement checklist + export gate.
// Tested here per the node-env / no-React-renderer convention.
//
// The security-critical property (SEC-3 / R19): the exported `.aesmsg` file is the ONE artifact that
// can leave the device and is only ever attacked offline, so a low-entropy passphrase — even one that
// clears the 12-char length rule, e.g. "password12345" — must be REJECTED for export. The gate is the
// entropy floor MIN_EXPORT_ENTROPY_BITS; the meter score is derived from the SAME estimate so the bar
// and the Export button always agree.

// Two lowercase passphrases of 12 vs 13 distinct, non-adjacent chars (so their effective length is
// their literal length, ~4.7 bits/char): they straddle the export floor by a single character —
// BELOW_FLOOR ≈ 56 bits (blocked), AT_FLOOR ≈ 61 bits (allowed).
const BELOW_FLOOR = "bmvxdqkhnzgp";
const AT_FLOOR = "bmvxdqkhnzgpt";

describe("estimatePassphraseBits + the export entropy floor", () => {
  it("is 0 bits for an empty passphrase", () => {
    expect(estimatePassphraseBits("")).toBe(0);
  });

  it("discounts a blocked common word so a long common-word passphrase stays far below the floor", () => {
    // 13 chars — clears the length rule — but built on the blocked token "password".
    expect(estimatePassphraseBits("password12345")).toBeLessThan(MIN_EXPORT_ENTROPY_BITS);
  });

  it("straddles the floor by a single character at the boundary", () => {
    expect(estimatePassphraseBits(BELOW_FLOOR)).toBeLessThan(MIN_EXPORT_ENTROPY_BITS);
    expect(estimatePassphraseBits(AT_FLOOR)).toBeGreaterThanOrEqual(MIN_EXPORT_ENTROPY_BITS);
  });
});

describe("scorePassphrase", () => {
  it("is 0 for an empty passphrase", () => {
    expect(scorePassphrase("")).toBe(0);
  });

  it("collapses a blocked common word to the single weakest lit segment", () => {
    // "password" is a blocked token: its effective length collapses toward ~1, so it lights only the
    // weakest segment regardless of its literal length.
    expect(scorePassphrase("password")).toBe(1);
  });

  it("lights at most 2 segments below the export floor and at least 3 at/above it", () => {
    // The meter is derived from the entropy estimate so it agrees with the export gate.
    expect(scorePassphrase(BELOW_FLOOR)).toBeLessThan(3);
    expect(scorePassphrase(AT_FLOOR)).toBeGreaterThanOrEqual(3);
  });

  it("never exceeds 4", () => {
    expect(scorePassphrase("Tr0ub4dour&3-correct-horse-battery")).toBe(4);
  });
});

describe("evaluatePassphrase", () => {
  const STRONG = "Correct-Horse-Battery-9";

  it("reports the three design requirements in order", () => {
    const { requirements } = evaluatePassphrase("", "");
    expect(requirements.map((r) => r.key)).toEqual(["length", "strength", "reuse"]);
    expect(requirements[0]?.label).toBe(`${MIN_PASSPHRASE_LENGTH}+ characters`);
    expect(requirements[1]?.label).toBe("Hard to guess (avoid common words)");
    expect(requirements[2]?.label).toBe("Not a reused passphrase");
  });

  it("fails the length requirement under the minimum", () => {
    const { requirements } = evaluatePassphrase("short", "short");
    expect(requirements[0]?.met).toBe(false);
  });

  it("REJECTS a long-but-weak passphrase: length passes, the entropy floor does not", () => {
    // The core security intent: a 13-char passphrase built on a blocked common word must not export.
    const weak = "password12345";
    const { requirements, canExport } = evaluatePassphrase(weak, weak);
    expect(requirements[0]?.met).toBe(true); // length — 13 ≥ 12
    expect(requirements[1]?.met).toBe(false); // strength — below the entropy floor
    expect(canExport).toBe(false);
  });

  it("accepts a genuinely strong passphrase at/above the floor", () => {
    const { requirements, entropyBits } = evaluatePassphrase(STRONG, STRONG);
    expect(entropyBits).toBeGreaterThanOrEqual(MIN_EXPORT_ENTROPY_BITS);
    expect(requirements.every((r) => r.met)).toBe(true);
    expect(evaluatePassphrase(STRONG, STRONG).canExport).toBe(true);
  });

  it("gates the strength requirement (and export) exactly at the entropy floor", () => {
    // One character decides it — the strength row and canExport both follow the floor.
    expect(evaluatePassphrase(BELOW_FLOOR, BELOW_FLOOR).requirements[1]?.met).toBe(false);
    expect(evaluatePassphrase(BELOW_FLOOR, BELOW_FLOOR).canExport).toBe(false);
    expect(evaluatePassphrase(AT_FLOOR, AT_FLOOR).requirements[1]?.met).toBe(true);
    expect(evaluatePassphrase(AT_FLOOR, AT_FLOOR).canExport).toBe(true);
  });

  it("an empty passphrase is not counted as reused", () => {
    const { requirements } = evaluatePassphrase("", "");
    expect(requirements[2]?.met).toBe(false); // empty -> nothing typed yet, so not yet satisfied
  });

  it("flags a reused passphrase when present in the provided set", () => {
    const reused = new Set([STRONG]);
    const { requirements, canExport } = evaluatePassphrase(STRONG, STRONG, reused);
    expect(requirements[2]?.met).toBe(false);
    expect(canExport).toBe(false);
  });

  it("only allows export when all requirements are met AND confirm matches", () => {
    expect(evaluatePassphrase(STRONG, STRONG).canExport).toBe(true);
    expect(evaluatePassphrase(STRONG, "different").canExport).toBe(false);
    expect(evaluatePassphrase("short", "short").canExport).toBe(false);
  });

  it("reports a mismatch only when both fields are non-empty and differ", () => {
    expect(evaluatePassphrase(STRONG, "").mismatch).toBe(false);
    expect(evaluatePassphrase("", STRONG).mismatch).toBe(false);
    expect(evaluatePassphrase(STRONG, "nope").mismatch).toBe(true);
    expect(evaluatePassphrase(STRONG, STRONG).mismatch).toBe(false);
  });
});
