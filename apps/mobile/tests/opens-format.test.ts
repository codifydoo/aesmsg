import { describe, expect, it } from "vitest";
import { formatOpens, formatOpensUsed } from "@/src/links/opens-format";

// formatOpens / formatOpensUsed back the Links list rows + detail screen; per the node-env /
// no-React-renderer convention the ∞-unlimited branch is tested here, not by rendering rows.
// Expected strings mirror the design (grp-links.jsx S_LinksList + S_LinkDetails).

describe("formatOpens (list row)", () => {
  it("renders used/max with a trailing 'opens'", () => {
    expect(formatOpens(0, 3)).toBe("0/3 opens");
    expect(formatOpens(1, 3)).toBe("1/3 opens");
    expect(formatOpens(2, 3)).toBe("2/3 opens");
  });

  it("renders ∞ for an unlimited (null) max", () => {
    expect(formatOpens(1, null)).toBe("1/∞ opens");
  });
});

describe("formatOpensUsed (detail screen)", () => {
  it("renders 'used of max'", () => {
    expect(formatOpensUsed(1, 3)).toBe("1 of 3");
  });

  it("renders ∞ for an unlimited (null) max", () => {
    expect(formatOpensUsed(1, null)).toBe("1 of ∞");
  });
});
