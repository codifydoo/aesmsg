import { describe, expect, it } from "vitest";
import {
  CUSTOM_EXPIRY_MAX_MS,
  CUSTOM_EXPIRY_MIN_MS,
  customExpiryDefault,
  customExpirySummary,
  validateCustomExpiry,
} from "@/src/pro/custom-expiry";

const now = new Date(Date.UTC(2026, 5, 2, 12, 0, 0));

describe("validateCustomExpiry", () => {
  it("rejects a date in the past or under the minimum window as too-soon", () => {
    expect(validateCustomExpiry(new Date(now.getTime() - 1000), now)).toEqual({
      ok: false,
      reason: "too-soon",
    });
    expect(validateCustomExpiry(new Date(now.getTime() + CUSTOM_EXPIRY_MIN_MS - 1), now)).toEqual({
      ok: false,
      reason: "too-soon",
    });
  });

  it("rejects a date beyond the 1-year maximum as too-far", () => {
    expect(
      validateCustomExpiry(new Date(now.getTime() + CUSTOM_EXPIRY_MAX_MS + 1000), now),
    ).toEqual({ ok: false, reason: "too-far" });
  });

  it("accepts a date within [min, max]", () => {
    expect(validateCustomExpiry(new Date(now.getTime() + 3 * 24 * 3600 * 1000), now).ok).toBe(true);
  });
});

describe("customExpiryDefault", () => {
  it("defaults to 3 days out from now", () => {
    expect(customExpiryDefault(now).getTime()).toBe(now.getTime() + 3 * 24 * 3600 * 1000);
  });
});

describe("customExpirySummary", () => {
  it("formats a UTC-stable date label", () => {
    expect(customExpirySummary(new Date(Date.UTC(2026, 11, 31, 9, 30)))).toBe(
      "Dec 31, 2026, 09:30",
    );
  });
});
