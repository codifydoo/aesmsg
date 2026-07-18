import { describe, expect, it } from "vitest";
import type { LinkStatus } from "@/src/links/link-status";
import {
  filterByStatus,
  filterEmptyCopy,
  type LinkFilter,
  matchesFilter,
} from "@/src/links/links-filter";

// matchesFilter / filterByStatus back the Links list segmented control; per the node-env /
// no-React-renderer convention the bucketing is tested here, not by rendering the screen.

const ALL: LinkStatus[] = ["available", "opened", "expiring", "revoked", "expired", "unknown"];

describe("matchesFilter", () => {
  it("'all' admits every status", () => {
    for (const s of ALL) expect(matchesFilter(s, "all")).toBe(true);
  });

  it("'active' admits available / opened / expiring / unknown only", () => {
    expect(matchesFilter("available", "active")).toBe(true);
    expect(matchesFilter("opened", "active")).toBe(true);
    expect(matchesFilter("expiring", "active")).toBe(true);
    // "unknown" (offline/unreachable) is presumed still-open → Active, not Expired.
    expect(matchesFilter("unknown", "active")).toBe(true);
    expect(matchesFilter("revoked", "active")).toBe(false);
    expect(matchesFilter("expired", "active")).toBe(false);
  });

  it("'expired' admits expired / revoked only", () => {
    expect(matchesFilter("expired", "expired")).toBe(true);
    expect(matchesFilter("revoked", "expired")).toBe(true);
    expect(matchesFilter("available", "expired")).toBe(false);
    expect(matchesFilter("opened", "expired")).toBe(false);
    expect(matchesFilter("expiring", "expired")).toBe(false);
    // "unknown" must never fall into the inert Expired bucket.
    expect(matchesFilter("unknown", "expired")).toBe(false);
  });

  it("partitions: active and expired are disjoint and cover all statuses", () => {
    for (const s of ALL) {
      const inActive = matchesFilter(s, "active");
      const inExpired = matchesFilter(s, "expired");
      expect(inActive && inExpired).toBe(false); // disjoint
      expect(inActive || inExpired).toBe(true); // exhaustive
    }
  });
});

describe("filterByStatus", () => {
  const items = ALL.map((status, i) => ({ id: String(i), status }));

  it("returns everything for 'all'", () => {
    expect(filterByStatus(items, "all")).toHaveLength(6);
  });

  it("returns the active items (available / opened / expiring / unknown), input order preserved", () => {
    const active = filterByStatus(items, "active").map((i) => i.status);
    expect(active).toEqual(["available", "opened", "expiring", "unknown"]);
  });

  it("returns 2 expired/revoked items", () => {
    const expired = filterByStatus(items, "expired").map((i) => i.status);
    expect(expired).toEqual(["revoked", "expired"]);
  });

  it("is stable for an unknown-but-typed filter union member", () => {
    // exhaustiveness sanity: every filter value yields an array
    const filters: LinkFilter[] = ["all", "active", "expired"];
    for (const f of filters) expect(Array.isArray(filterByStatus(items, f))).toBe(true);
  });
});

describe("filterEmptyCopy", () => {
  it("gives distinct 'no matches' copy for the Active and Expired segments", () => {
    expect(filterEmptyCopy("active")?.title).toBe("No active links");
    expect(filterEmptyCopy("expired")?.title).toBe("No expired links");
    expect(filterEmptyCopy("active")?.body).not.toBe(filterEmptyCopy("expired")?.body);
  });

  it("returns null for 'all' (an empty all-segment cannot occur on a non-empty list)", () => {
    expect(filterEmptyCopy("all")).toBeNull();
  });
});
