import { describe, expect, it } from "vitest";
import { landingNotice } from "@/src/reader/landing-notice";

// landing-notice is dependency-free (no react / react-native / crypto), so it loads in plain Node.
// It backs the reader landing's "opening costs a view" caution — the FE-2 / R7 single-open warning.

describe("landingNotice — view-once (maxOpens === 1)", () => {
  it("flags the only view and warns it can't be re-opened on any device", () => {
    const n = landingNotice({ maxOpens: 1, opensCount: 0 });
    expect(n.lastView).toBe(true);
    expect(n.warning).toContain("can be opened once");
    expect(n.warning).toContain("can't be opened again");
    expect(n.opensLabel).toBe("0 of 1 opens used");
  });
});

describe("landingNotice — final remaining open of a capped multi-open link", () => {
  it("flags the last view when one open remains", () => {
    const n = landingNotice({ maxOpens: 3, opensCount: 2 });
    expect(n.lastView).toBe(true);
    expect(n.warning).toContain("last available open");
    expect(n.opensLabel).toBe("2 of 3 opens used");
  });

  it("treats an already-exhausted count as a last view (remaining clamps at 0)", () => {
    const n = landingNotice({ maxOpens: 3, opensCount: 3 });
    expect(n.lastView).toBe(true);
    expect(n.opensLabel).toBe("3 of 3 opens used");
  });
});

describe("landingNotice — capped link with views to spare", () => {
  it("shows a neutral count and NO caution", () => {
    const n = landingNotice({ maxOpens: 3, opensCount: 0 });
    expect(n.lastView).toBe(false);
    expect(n.warning).toBeNull();
    expect(n.opensLabel).toBe("0 of 3 opens used");
  });
});

describe("landingNotice — unlimited (maxOpens < 0 sentinel)", () => {
  it("shows no count and no caution (nothing scarce is consumed)", () => {
    const n = landingNotice({ maxOpens: -1, opensCount: 5 });
    expect(n.lastView).toBe(false);
    expect(n.warning).toBeNull();
    expect(n.opensLabel).toBeNull();
  });
});
