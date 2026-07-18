import { describe, expect, it } from "vitest";
import { appDeepLink, isValidLinkId } from "@/src/bouncer/deep-link";

describe("isValidLinkId", () => {
  it("accepts a canonical 16-char id", () => {
    expect(isValidLinkId("abcdefghijkl0123")).toBe(true);
    expect(isValidLinkId("AbCd-_90EfGhIjKl")).toBe(true);
  });
  it("rejects wrong length or illegal characters", () => {
    expect(isValidLinkId("too-short")).toBe(false);
    expect(isValidLinkId("waytoolongtobevalid12345")).toBe(false);
    expect(isValidLinkId("has spaces 12345")).toBe(false);
    expect(isValidLinkId("dots.dots.dots..")).toBe(false);
  });
});

describe("appDeepLink", () => {
  it("builds an aesmsg:// scheme link for a valid id", () => {
    expect(appDeepLink("abcdefghijkl0123")).toBe("aesmsg://l/abcdefghijkl0123");
  });
  it("returns null for an invalid id (so the bouncer shows the generic message)", () => {
    expect(appDeepLink("nope")).toBeNull();
  });
});
