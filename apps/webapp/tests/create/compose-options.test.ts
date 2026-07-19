import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPIRY,
  DEFAULT_MAX_OPENS,
  EXPIRY_PRESETS,
  expiryToDate,
  MAX_LINK_LIFETIME_MS,
  MAX_OPENS_OPTIONS,
  validateCustomExpiry,
} from "@/src/create/compose-options";

const NOW = new Date("2026-07-18T12:00:00.000Z");

describe("compose-options", () => {
  it("exposes the spec presets and defaults", () => {
    expect(EXPIRY_PRESETS.map((p) => p.value)).toEqual(["10m", "1h", "24h", "7d", "custom"]);
    expect(MAX_OPENS_OPTIONS.map((o) => o.value)).toEqual([1, 3, -1]);
    expect(DEFAULT_EXPIRY).toBe("24h");
    expect(DEFAULT_MAX_OPENS).toBe(1);
  });

  it("expiryToDate adds the exact preset offset", () => {
    expect(expiryToDate("10m", NOW).getTime()).toBe(NOW.getTime() + 10 * 60_000);
    expect(expiryToDate("1h", NOW).getTime()).toBe(NOW.getTime() + 60 * 60_000);
    expect(expiryToDate("24h", NOW).getTime()).toBe(NOW.getTime() + 24 * 60 * 60_000);
    expect(expiryToDate("7d", NOW).getTime()).toBe(NOW.getTime() + 7 * 24 * 60 * 60_000);
  });

  it("expiryToDate passes an in-range custom date through unchanged", () => {
    const custom = new Date(NOW.getTime() + 3 * 24 * 60 * 60_000);
    expect(expiryToDate("custom", NOW, custom).getTime()).toBe(custom.getTime());
  });

  it("expiryToDate clamps a custom date beyond 365 days down to the max", () => {
    const tooFar = new Date(NOW.getTime() + MAX_LINK_LIFETIME_MS + 10 * 24 * 60 * 60_000);
    expect(expiryToDate("custom", NOW, tooFar).getTime()).toBe(
      NOW.getTime() + MAX_LINK_LIFETIME_MS,
    );
  });

  it("validateCustomExpiry flags past, too-far, and accepts in-range", () => {
    expect(validateCustomExpiry(new Date(NOW.getTime() - 60_000), NOW)).toEqual({
      ok: false,
      reason: "past",
    });
    expect(
      validateCustomExpiry(new Date(NOW.getTime() + MAX_LINK_LIFETIME_MS + 60_000), NOW),
    ).toEqual({ ok: false, reason: "too_far" });
    expect(validateCustomExpiry(new Date(NOW.getTime() + 60 * 60_000), NOW)).toEqual({ ok: true });
  });
});
