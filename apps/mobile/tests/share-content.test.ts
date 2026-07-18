import { describe, expect, it } from "vitest";
import { buildShareContent } from "@/src/create/share-content";

describe("buildShareContent", () => {
  it("carries the link URL in the RN Share `message` field", () => {
    // React Native's Share.share populates from `message` on both iOS and Android — the correct
    // primitive for a text link (expo-sharing only shares file URIs).
    expect(buildShareContent("https://aesmsg.com/l/abc123DEF456ghij")).toEqual({
      message: "https://aesmsg.com/l/abc123DEF456ghij",
    });
  });

  it("shares exactly the URL and nothing else (no plaintext / metadata leak)", () => {
    const content = buildShareContent("https://links.test/l/xyz");
    expect(Object.keys(content)).toEqual(["message"]);
    expect(content.message).toBe("https://links.test/l/xyz");
  });
});
