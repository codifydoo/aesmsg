import { describe, expect, it } from "vitest";
import { generateLinkId, LINK_ID_REGEX } from "@/src/lib/link-id";

describe("generateLinkId", () => {
  it("produces a 16-char url-safe id matching LINK_ID_REGEX", () => {
    const id = generateLinkId();
    expect(id).toMatch(LINK_ID_REGEX);
    expect(LINK_ID_REGEX.source).toBe("^[A-Za-z0-9_-]{16}$");
  });

  it("produces different ids across calls (CSPRNG)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateLinkId()));
    expect(ids.size).toBe(50);
  });
});
