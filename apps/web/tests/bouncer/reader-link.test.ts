import { describe, expect, it } from "vitest";
import { browserReaderUrl, WEBAPP_ORIGIN } from "@/src/bouncer/reader-link";

describe("browserReaderUrl", () => {
  it("builds an app.aesmsg.com/l/<id> reader link for a valid id", () => {
    expect(browserReaderUrl("abcdefghijkl0123")).toBe(`${WEBAPP_ORIGIN}/l/abcdefghijkl0123`);
    expect(browserReaderUrl("abcdefghijkl0123")).toBe("https://app.aesmsg.com/l/abcdefghijkl0123");
  });
  it("returns null for an invalid id (so the bouncer builds no misleading link)", () => {
    expect(browserReaderUrl("nope")).toBeNull();
    expect(browserReaderUrl("waytoolongtobevalid12345")).toBeNull();
  });
});
