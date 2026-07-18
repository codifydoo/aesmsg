import { describe, expect, it } from "vitest";
import { planExpiryReminder } from "@/src/notifications/expiry-plan";

const HOUR = 60 * 60 * 1000;

describe("planExpiryReminder", () => {
  it("schedules one hour before expiry when there is more than an hour left", () => {
    const plan = planExpiryReminder({ expiresAtMs: 10 * HOUR, nowMs: 0 });
    expect(plan).toEqual({ fireAtMs: 9 * HOUR });
  });

  it("returns null when the link expires in under an hour (no immediate reminder)", () => {
    expect(planExpiryReminder({ expiresAtMs: 30 * 60 * 1000, nowMs: 0 })).toBeNull();
  });

  it("returns null when the reminder time is exactly now", () => {
    expect(planExpiryReminder({ expiresAtMs: HOUR, nowMs: 0 })).toBeNull();
  });

  it("returns null when the link is already expired", () => {
    expect(planExpiryReminder({ expiresAtMs: 0, nowMs: 5 * HOUR })).toBeNull();
  });
});
