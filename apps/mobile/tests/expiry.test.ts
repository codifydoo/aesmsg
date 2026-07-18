import { describe, expect, it } from "vitest";
import {
  EXPIRY_OPTIONS,
  expiryToDate,
  MAX_LINK_LIFETIME_MS,
  MAX_OPENS_OPTIONS,
} from "@/src/create/expiry";

describe("expiryToDate", () => {
  const now = new Date(1_700_000_000_000);
  it.each([
    ["10m", 10 * 60_000],
    ["1h", 60 * 60_000],
    ["24h", 24 * 60 * 60_000],
    ["7d", 7 * 24 * 60 * 60_000],
  ] as const)("%s adds the right delta", (choice, deltaMs) => {
    expect(expiryToDate(choice, now).getTime()).toBe(now.getTime() + deltaMs);
  });

  it("1y → a real bounded now + 365 days (NOT a 'never' sentinel)", () => {
    // The longest option is a concrete instant the client both sends and seals into the AAD; there is
    // no year-9999 forever sentinel anymore (roadmap 2.5 retention ceiling).
    expect(MAX_LINK_LIFETIME_MS).toBe(365 * 24 * 60 * 60_000);
    expect(expiryToDate("1y", now).getTime()).toBe(now.getTime() + MAX_LINK_LIFETIME_MS);
  });

  it("offers no 'never'/'forever' option — the longest is the bounded 1-year maximum", () => {
    const values = EXPIRY_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["10m", "1h", "24h", "7d", "1y"]);
    for (const o of EXPIRY_OPTIONS) {
      expect(o.label.toLowerCase()).not.toContain("never");
      expect(o.label.toLowerCase()).not.toContain("forever");
    }
  });
});

describe("MAX_OPENS_OPTIONS", () => {
  it("offers 1 / 5 / 10 / unlimited(-1)", () => {
    expect(MAX_OPENS_OPTIONS.map((o) => o.value)).toEqual([1, 5, 10, -1]);
  });
});
