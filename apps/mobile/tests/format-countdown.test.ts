import { describe, expect, it } from "vitest";
import { friendlyExpiryRecap, friendlyRemaining } from "@/src/system/format-countdown";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("friendlyRemaining", () => {
  it("returns 'now' at or past the deadline", () => {
    expect(friendlyRemaining(0)).toBe("now");
    expect(friendlyRemaining(-5 * MINUTE)).toBe("now");
  });

  it("collapses sub-minute remainders to 'in under a minute'", () => {
    expect(friendlyRemaining(30 * SECOND)).toBe("in under a minute");
    expect(friendlyRemaining(MINUTE - 1)).toBe("in under a minute");
  });

  it("spells out minutes, hours, and days with a single leading unit", () => {
    expect(friendlyRemaining(5 * MINUTE)).toBe("in 5 minutes");
    expect(friendlyRemaining(2 * HOUR + 42 * MINUTE)).toBe("in 2 hours");
    expect(friendlyRemaining(3 * DAY + 5 * HOUR)).toBe("in 3 days");
  });

  it("uses the singular unit at exactly one", () => {
    expect(friendlyRemaining(MINUTE)).toBe("in 1 minute");
    expect(friendlyRemaining(HOUR)).toBe("in 1 hour");
    expect(friendlyRemaining(DAY)).toBe("in 1 day");
  });
});

describe("friendlyExpiryRecap", () => {
  const now = Date.parse("2026-05-09T12:00:00.000Z");

  it("renders a friendly 'Expires in …' countdown for a live link", () => {
    const expires = new Date(now + 2 * HOUR).toISOString();
    expect(friendlyExpiryRecap(expires, now)).toBe("Expires in 2 hours");
  });

  it("reports an already-past expiry as 'Expired'", () => {
    const expires = new Date(now - HOUR).toISOString();
    expect(friendlyExpiryRecap(expires, now)).toBe("Expired");
  });

  it("recognises the 'never expires' sentinel (year >= 9999)", () => {
    expect(friendlyExpiryRecap("9999-12-31T23:59:59.000Z", now)).toBe(
      "Never expires (revoke manually)",
    );
  });
});
