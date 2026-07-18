import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPIRY,
  expiryOptionRows,
  expirySummary,
  maxOpensOptionRows,
  maxOpensSummary,
} from "@/src/create/compose-options";
import { EXPIRY_OPTIONS, MAX_OPENS_OPTIONS } from "@/src/create/expiry";

describe("expiry option modeling", () => {
  it("default expiry is 24h (matches the design's Default badge)", () => {
    expect(DEFAULT_EXPIRY).toBe("24h");
  });

  it("rows mirror the shared EXPIRY_OPTIONS in order, marking exactly the default", () => {
    const rows = expiryOptionRows();
    expect(rows.map((r) => r.value)).toEqual(EXPIRY_OPTIONS.map((o) => o.value));
    expect(rows.filter((r) => r.isDefault).map((r) => r.value)).toEqual(["24h"]);
  });

  it("summary echoes the shared label", () => {
    expect(expirySummary("24h")).toBe("24 hours");
    expect(expirySummary("1y")).toBe("1 year (maximum)");
  });
});

describe("max-opens option modeling", () => {
  it("rows mirror the shared MAX_OPENS_OPTIONS in order", () => {
    const rows = maxOpensOptionRows();
    expect(rows.map((r) => r.value)).toEqual(MAX_OPENS_OPTIONS.map((o) => o.value));
  });

  it("every row carries a non-empty description", () => {
    for (const row of maxOpensOptionRows()) {
      expect(row.description.length).toBeGreaterThan(0);
    }
  });

  it("describes the burn-after-first and unlimited cases distinctly", () => {
    const rows = maxOpensOptionRows();
    const once = rows.find((r) => r.value === 1);
    const unlimited = rows.find((r) => r.value === -1);
    expect(once?.description).toMatch(/first/i);
    expect(unlimited?.description).toMatch(/expires/i);
  });

  it("summary echoes the shared label", () => {
    expect(maxOpensSummary(1)).toBe("Once");
    expect(maxOpensSummary(-1)).toBe("Unlimited (until expiry)");
  });
});
