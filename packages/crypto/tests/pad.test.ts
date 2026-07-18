import { describe, expect, it } from "vitest";
import { PAD_BUCKETS, targetPaddedLen } from "../src/pad.js";

describe("targetPaddedLen", () => {
  it("exposes the fixed small buckets", () => {
    expect(PAD_BUCKETS).toEqual([256, 1024, 4096]);
  });

  it("rounds up to the smallest bucket >= rawLen for small inputs", () => {
    expect(targetPaddedLen(0)).toBe(256);
    expect(targetPaddedLen(1)).toBe(256);
    expect(targetPaddedLen(255)).toBe(256);
    expect(targetPaddedLen(256)).toBe(256);
    expect(targetPaddedLen(257)).toBe(1024);
    expect(targetPaddedLen(1023)).toBe(1024);
    expect(targetPaddedLen(1024)).toBe(1024);
    expect(targetPaddedLen(1025)).toBe(4096);
    expect(targetPaddedLen(4095)).toBe(4096);
    expect(targetPaddedLen(4096)).toBe(4096);
  });

  it("never returns a value smaller than the input", () => {
    for (let n = 0; n <= 5000; n += 7) {
      expect(targetPaddedLen(n)).toBeGreaterThanOrEqual(n);
    }
    // sparse large sweep
    for (let n = 4097; n <= 20_000_000; n = Math.floor(n * 1.3) + 1) {
      expect(targetPaddedLen(n)).toBeGreaterThanOrEqual(n);
    }
  });

  it("is monotonic non-decreasing across the bucket->Padmé seam and beyond", () => {
    let prev = 0;
    for (let n = 4090; n <= 4200; n++) {
      const t = targetPaddedLen(n);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    prev = 0;
    for (let n = 1; n <= 12_000_000; n = Math.floor(n * 1.17) + 1) {
      const t = targetPaddedLen(n);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it("bounds Padmé overhead to ~12% for inputs above 4096", () => {
    for (let n = 4097; n <= 14_000_000; n = Math.floor(n * 1.11) + 1) {
      const t = targetPaddedLen(n);
      // Padmé guarantees overhead < ~12% (1/(2^... )); use a safe 12.6% ceiling.
      expect(t).toBeLessThanOrEqual(Math.ceil(n * 1.126));
    }
  });

  it("the trailer-inclusive caller formula yields a non-negative padLen at every bucket edge", () => {
    // Mirrors encodePayload: bodyLen + 4 (u32 padLen) -> target -> padLen.
    const edgeBodyLens = [
      0, 1, 248, 249, 250, 251, 252, 253, 1017, 1020, 1021, 4088, 4092, 4093, 4097, 100000,
    ];
    for (const bodyLen of edgeBodyLens) {
      const minLen = bodyLen + 4;
      const target = targetPaddedLen(minLen);
      const padLen = target - minLen;
      expect(padLen, `bodyLen=${bodyLen}`).toBeGreaterThanOrEqual(0);
      expect(bodyLen + 4 + padLen).toBe(target); // total lands exactly on the bucket
    }
  });

  it("rejects a negative input", () => {
    expect(() => targetPaddedLen(-1)).toThrow();
  });
});
