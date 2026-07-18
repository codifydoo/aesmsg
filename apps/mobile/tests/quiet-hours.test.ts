import { describe, expect, it } from "vitest";
import {
  isWithinQuietHours,
  parseTimeToMinutes,
  type QuietHoursConfig,
} from "@/src/notifications/quiet-hours";

describe("parseTimeToMinutes", () => {
  it("parses valid HH:MM into minutes since midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("07:00")).toBe(420);
    expect(parseTimeToMinutes("22:30")).toBe(22 * 60 + 30);
    expect(parseTimeToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("rejects malformed or out-of-range values", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("7pm")).toBeNull();
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("12:60")).toBeNull();
    expect(parseTimeToMinutes("12")).toBeNull();
  });
});

describe("isWithinQuietHours", () => {
  const overnight: QuietHoursConfig = { enabled: true, from: "22:00", to: "07:00" };

  it("treats [from, to) with the opening minute quiet and the closing minute awake (overnight wrap)", () => {
    expect(isWithinQuietHours(22 * 60, overnight)).toBe(true); // 22:00 opens quiet
    expect(isWithinQuietHours(23 * 60, overnight)).toBe(true); // 23:00
    expect(isWithinQuietHours(0, overnight)).toBe(true); // 00:00 (past midnight)
    expect(isWithinQuietHours(6 * 60 + 59, overnight)).toBe(true); // 06:59 still quiet
    expect(isWithinQuietHours(7 * 60, overnight)).toBe(false); // 07:00 closes quiet
    expect(isWithinQuietHours(12 * 60, overnight)).toBe(false); // midday awake
    expect(isWithinQuietHours(21 * 60 + 59, overnight)).toBe(false); // 21:59 awake
  });

  it("handles a same-day (non-wrapping) window", () => {
    const daytime: QuietHoursConfig = { enabled: true, from: "09:00", to: "17:00" };
    expect(isWithinQuietHours(8 * 60, daytime)).toBe(false);
    expect(isWithinQuietHours(9 * 60, daytime)).toBe(true);
    expect(isWithinQuietHours(12 * 60, daytime)).toBe(true);
    expect(isWithinQuietHours(17 * 60, daytime)).toBe(false);
  });

  it("treats from === to as a whole-day quiet window", () => {
    const allDay: QuietHoursConfig = { enabled: true, from: "09:00", to: "09:00" };
    expect(isWithinQuietHours(0, allDay)).toBe(true);
    expect(isWithinQuietHours(9 * 60, allDay)).toBe(true);
    expect(isWithinQuietHours(15 * 60, allDay)).toBe(true);
  });

  it("fails open when disabled", () => {
    expect(isWithinQuietHours(0, { ...overnight, enabled: false })).toBe(false);
  });

  it("fails open on a malformed bound (never silently swallows notifications)", () => {
    expect(isWithinQuietHours(0, { enabled: true, from: "oops", to: "07:00" })).toBe(false);
    expect(isWithinQuietHours(0, { enabled: true, from: "22:00", to: "" })).toBe(false);
  });

  it("normalises out-of-range minute inputs", () => {
    // 25:00 worth of minutes wraps to 01:00, still inside the overnight window.
    expect(isWithinQuietHours(25 * 60, overnight)).toBe(true);
  });
});
