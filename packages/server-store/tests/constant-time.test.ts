import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { timingSafeEqualHex } from "../src/constant-time.js";

const hash = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

describe("timingSafeEqualHex", () => {
  it("returns true for two identical SHA-256 hex digests", () => {
    const h = hash("some-revocation-token");
    expect(timingSafeEqualHex(h, h)).toBe(true);
  });

  it("returns false for digests of different inputs (same length)", () => {
    expect(timingSafeEqualHex(hash("token-a"), hash("token-b"))).toBe(false);
  });

  it("returns false without throwing when the hex lengths differ", () => {
    // A short/garbage value must not throw (timingSafeEqual would RangeError on unequal lengths).
    expect(timingSafeEqualHex(hash("token"), "deadbeef")).toBe(false);
  });

  it("returns false for two empty strings (no compare on zero-length buffers)", () => {
    expect(timingSafeEqualHex("", "")).toBe(false);
  });
});
