import { describe, expect, it } from "vitest";
import { generateLinkId, LINK_ID_REGEX } from "@/src/lib/link-id";

describe("generateLinkId", () => {
  it("always produces a 16-char id matching LINK_ID_REGEX", () => {
    for (let i = 0; i < 500; i++) {
      const id = generateLinkId();
      expect(id).toHaveLength(16);
      expect(id).toMatch(LINK_ID_REGEX);
    }
  });

  it("produces unique ids across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateLinkId());
    expect(seen.size).toBe(1000);
  });
});
