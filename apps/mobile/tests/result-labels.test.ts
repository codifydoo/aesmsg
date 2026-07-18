import { describe, expect, it } from "vitest";
import { MAX_LINK_LIFETIME_MS } from "@/src/create/expiry";
import { expiryChipLabel, opensChipLabel, resultChipLabels } from "@/src/create/result-labels";

const now = new Date(1_700_000_000_000);

describe("expiryChipLabel", () => {
  it("renders the 1-year maximum as a concrete countdown, not 'Never expires'", () => {
    const at = new Date(now.getTime() + MAX_LINK_LIFETIME_MS);
    expect(expiryChipLabel(at, now)).toBe("Expires in 365d");
  });

  it("formats hours + minutes", () => {
    const at = new Date(now.getTime() + (23 * 60 + 59) * 60_000);
    expect(expiryChipLabel(at, now)).toBe("Expires in 23h 59m");
  });

  it("formats whole hours", () => {
    const at = new Date(now.getTime() + 60 * 60_000);
    expect(expiryChipLabel(at, now)).toBe("Expires in 1h");
  });

  it("formats days + hours", () => {
    const at = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
    expect(expiryChipLabel(at, now)).toBe("Expires in 7d");
  });

  it("formats minutes for sub-hour expiries", () => {
    const at = new Date(now.getTime() + 10 * 60_000);
    expect(expiryChipLabel(at, now)).toBe("Expires in 10m");
  });

  it("reports already-past as expired", () => {
    expect(expiryChipLabel(new Date(now.getTime() - 1000), now)).toBe("Expired");
  });
});

describe("opensChipLabel", () => {
  it("singular vs plural vs unlimited", () => {
    expect(opensChipLabel(1)).toBe("1 open");
    expect(opensChipLabel(5)).toBe("5 opens");
    expect(opensChipLabel(-1)).toBe("Unlimited");
  });
});

describe("resultChipLabels", () => {
  it("bundles both chip labels from the committed seal inputs", () => {
    // A full 24h normalizes to "1d" (24h = 1 day); the design's "23h 59m" chip is the typical case
    // where the link was created a moment before the 24h boundary — covered above.
    const at = new Date(now.getTime() + 24 * 60 * 60_000);
    expect(resultChipLabels(at, 1, now)).toEqual({
      expiry: "Expires in 1d",
      opens: "1 open",
    });
  });
});
