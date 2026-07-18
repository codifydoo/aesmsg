import { describe, expect, it } from "vitest";
import {
  CLIPBOARD_CLEAR_MAX_SECONDS,
  CLIPBOARD_CLEAR_MIN_SECONDS,
  clampClipboardSeconds,
  clipboardFillFraction,
  clipboardSecondsForX,
  formatClipboardClear,
  formatFingerprintGroups,
} from "@/src/settings/settings-format";

// Pure formatting logic backing the Settings screens (clipboard-clear slider + fingerprint display).
// Tested per the node-env / no-React-renderer convention — the .tsx screens stay presentational.

describe("clampClipboardSeconds", () => {
  it("passes through values inside the range", () => {
    expect(clampClipboardSeconds(45)).toBe(45);
    expect(clampClipboardSeconds(CLIPBOARD_CLEAR_MIN_SECONDS)).toBe(CLIPBOARD_CLEAR_MIN_SECONDS);
    expect(clampClipboardSeconds(CLIPBOARD_CLEAR_MAX_SECONDS)).toBe(CLIPBOARD_CLEAR_MAX_SECONDS);
  });

  it("clamps below the min and above the max", () => {
    expect(clampClipboardSeconds(0)).toBe(CLIPBOARD_CLEAR_MIN_SECONDS);
    expect(clampClipboardSeconds(-30)).toBe(CLIPBOARD_CLEAR_MIN_SECONDS);
    expect(clampClipboardSeconds(120)).toBe(CLIPBOARD_CLEAR_MAX_SECONDS);
  });

  it("floors fractional seconds", () => {
    expect(clampClipboardSeconds(45.9)).toBe(45);
  });

  it("treats non-finite input as the min instead of NaN", () => {
    expect(clampClipboardSeconds(Number.NaN)).toBe(CLIPBOARD_CLEAR_MIN_SECONDS);
    expect(clampClipboardSeconds(Number.POSITIVE_INFINITY)).toBe(CLIPBOARD_CLEAR_MIN_SECONDS);
  });
});

describe("formatClipboardClear", () => {
  it("renders the design's '45s' for the default", () => {
    expect(formatClipboardClear(45)).toBe("45s");
  });

  it("appends 's' and clamps out-of-range input", () => {
    expect(formatClipboardClear(10)).toBe("10s");
    expect(formatClipboardClear(1000)).toBe("90s");
  });
});

describe("clipboardFillFraction", () => {
  it("is 0 at the min and 1 at the max", () => {
    expect(clipboardFillFraction(CLIPBOARD_CLEAR_MIN_SECONDS)).toBe(0);
    expect(clipboardFillFraction(CLIPBOARD_CLEAR_MAX_SECONDS)).toBe(1);
  });

  it("places the design default (45s) near the middle of [10,90]", () => {
    expect(clipboardFillFraction(45)).toBeCloseTo(0.4375, 4);
  });

  it("clamps out-of-range input to [0,1]", () => {
    expect(clipboardFillFraction(-5)).toBe(0);
    expect(clipboardFillFraction(500)).toBe(1);
  });
});

describe("clipboardSecondsForX", () => {
  const W = 200; // a measured track width

  it("returns null before the track is measured (width <= 0)", () => {
    expect(clipboardSecondsForX(50, 0)).toBeNull();
    expect(clipboardSecondsForX(50, -10)).toBeNull();
  });

  it("maps the track ends to the min/max delay", () => {
    expect(clipboardSecondsForX(0, W)).toBe(CLIPBOARD_CLEAR_MIN_SECONDS);
    expect(clipboardSecondsForX(W, W)).toBe(CLIPBOARD_CLEAR_MAX_SECONDS);
  });

  it("maps the track midpoint to the middle of [10,90]", () => {
    // 10 + round(0.5 * 80) = 50
    expect(clipboardSecondsForX(W / 2, W)).toBe(50);
  });

  it("maps a quarter along the track to 30s", () => {
    // 10 + round(0.25 * 80) = 30
    expect(clipboardSecondsForX(W / 4, W)).toBe(30);
  });

  it("clamps under-/over-shoot to the ends instead of going out of range", () => {
    expect(clipboardSecondsForX(-40, W)).toBe(CLIPBOARD_CLEAR_MIN_SECONDS);
    expect(clipboardSecondsForX(W + 40, W)).toBe(CLIPBOARD_CLEAR_MAX_SECONDS);
  });

  it("always returns a whole second within range", () => {
    const s = clipboardSecondsForX(123.45, W);
    expect(s).not.toBeNull();
    expect(Number.isInteger(s)).toBe(true);
    expect(s as number).toBeGreaterThanOrEqual(CLIPBOARD_CLEAR_MIN_SECONDS);
    expect(s as number).toBeLessThanOrEqual(CLIPBOARD_CLEAR_MAX_SECONDS);
  });
});

describe("formatFingerprintGroups", () => {
  const FP = "AM-E82F-4D11-A9C2-77BE-1A2B-3C4D-5E6F-7A8B";

  it("returns the first N hex groups space-joined (short profile fp)", () => {
    expect(formatFingerprintGroups(FP, 2)).toBe("E82F 4D11");
  });

  it("returns four groups for the advanced screen fingerprint", () => {
    expect(formatFingerprintGroups(FP, 4)).toBe("E82F 4D11 A9C2 77BE");
  });

  it("strips the 'AM-' prefix and accepts space- or hyphen-separated input", () => {
    expect(formatFingerprintGroups("E82F 4D11 A9C2 77BE", 2)).toBe("E82F 4D11");
    expect(formatFingerprintGroups("E82F-4D11", 2)).toBe("E82F 4D11");
  });

  it("never returns more groups than exist", () => {
    expect(formatFingerprintGroups("AM-E82F-4D11", 8)).toBe("E82F 4D11");
  });

  it("returns '' for empty / whitespace / non-positive group counts", () => {
    expect(formatFingerprintGroups("", 4)).toBe("");
    expect(formatFingerprintGroups("   ", 4)).toBe("");
    expect(formatFingerprintGroups(FP, 0)).toBe("");
    expect(formatFingerprintGroups(FP, -2)).toBe("");
  });
});
