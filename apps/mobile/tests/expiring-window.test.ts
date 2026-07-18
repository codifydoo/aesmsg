import { describe, expect, it } from "vitest";
import {
  EXPIRING_MAX_WINDOW_MS,
  EXPIRING_MIN_WINDOW_MS,
  expiringWindowMs,
  isExpiringSoon,
} from "@/src/links/expiring-window";

// Proportional "expiring soon" window: a fixed fraction of each link's own lifetime, clamped between
// a 1-minute floor (so ultra-short links still get a heads-up) and a 24h ceiling (so multi-day links
// don't go amber days early). No Date.now() — everything is injected — so the boundaries are pinned.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("expiringWindowMs", () => {
  it("is 20% of the lifetime in the normal (unclamped) range", () => {
    expect(expiringWindowMs(10 * HOUR)).toBe(2 * HOUR); // 20% of 10h
    expect(expiringWindowMs(5 * HOUR)).toBe(HOUR); // 20% of 5h
  });

  it("floors ultra-short lifetimes at the 1-minute minimum", () => {
    expect(expiringWindowMs(2 * MINUTE)).toBe(EXPIRING_MIN_WINDOW_MS); // 20% = 24s < 1m floor
    expect(expiringWindowMs(4 * MINUTE)).toBe(EXPIRING_MIN_WINDOW_MS); // 20% = 48s < 1m floor
  });

  it("caps long lifetimes at the 24h ceiling", () => {
    expect(expiringWindowMs(7 * DAY)).toBe(EXPIRING_MAX_WINDOW_MS); // 20% = 1.4d > 1d ceiling
    expect(expiringWindowMs(30 * DAY)).toBe(EXPIRING_MAX_WINDOW_MS);
  });

  it("collapses non-positive / NaN lifetimes to the floor (never zero/negative)", () => {
    expect(expiringWindowMs(0)).toBe(EXPIRING_MIN_WINDOW_MS);
    expect(expiringWindowMs(-HOUR)).toBe(EXPIRING_MIN_WINDOW_MS);
    expect(expiringWindowMs(Number.NaN)).toBe(EXPIRING_MIN_WINDOW_MS);
  });

  it("10-minute lifetime yields the 2-minute proportional window (20%)", () => {
    expect(expiringWindowMs(10 * MINUTE)).toBe(2 * MINUTE);
  });
});

describe("isExpiringSoon", () => {
  const created = 1_000_000_000_000;

  it("is false for a fresh short link (not yet in its final window)", () => {
    // 10min link, 10min remaining, 2min window → not expiring (fixes 'born amber').
    expect(
      isExpiringSoon({ createdAtMs: created, expiresAtMs: created + 10 * MINUTE, nowMs: created }),
    ).toBe(false);
  });

  it("is true once a short link enters its final window", () => {
    const expiresAt = created + 10 * MINUTE;
    expect(
      isExpiringSoon({ createdAtMs: created, expiresAtMs: expiresAt, nowMs: expiresAt - MINUTE }),
    ).toBe(true);
  });

  it("is false for a fresh 7-day link, true only inside the clamped 24h ceiling", () => {
    const expiresAt = created + 7 * DAY;
    expect(isExpiringSoon({ createdAtMs: created, expiresAtMs: expiresAt, nowMs: created })).toBe(
      false,
    );
    // 2 days out: still outside the 24h ceiling.
    expect(
      isExpiringSoon({ createdAtMs: created, expiresAtMs: expiresAt, nowMs: expiresAt - 2 * DAY }),
    ).toBe(false);
    // 12 hours out: inside the 24h ceiling → expiring.
    expect(
      isExpiringSoon({
        createdAtMs: created,
        expiresAtMs: expiresAt,
        nowMs: expiresAt - 12 * HOUR,
      }),
    ).toBe(true);
  });

  it("is false for an already-expired link (that is 'Expired', not 'expiring')", () => {
    const expiresAt = created + HOUR;
    expect(isExpiringSoon({ createdAtMs: created, expiresAtMs: expiresAt, nowMs: expiresAt })).toBe(
      false,
    );
    expect(
      isExpiringSoon({ createdAtMs: created, expiresAtMs: expiresAt, nowMs: expiresAt + MINUTE }),
    ).toBe(false);
  });
});
