import { describe, expect, it } from "vitest";
import { ABOUT_LINKS } from "@/src/system/about-data";
import {
  PRIVACY_URL,
  resolveAboutLinkUrl,
  SECURITY_URL,
  SOURCE_URL,
  TERMS_URL,
} from "@/src/system/legal-links";

// Pure resolver for the About-screen legal/info links + the canonical destination URLs. Node-tested
// (no React renderer) per the mobile test convention so the wiring is verified without a screen.

describe("legal-links URL constants", () => {
  it("points at the live aesmsg web pages + the public repo", () => {
    expect(PRIVACY_URL).toBe("https://aesmsg.com/privacy");
    expect(TERMS_URL).toBe("https://aesmsg.com/terms");
    expect(SECURITY_URL).toBe("https://aesmsg.com/docs");
    expect(SOURCE_URL).toBe("https://github.com/codifydoo/aesmsg");
  });
});

describe("resolveAboutLinkUrl", () => {
  it("maps each known About link id to its destination", () => {
    expect(resolveAboutLinkUrl("privacy")).toBe(PRIVACY_URL);
    expect(resolveAboutLinkUrl("terms")).toBe(TERMS_URL);
    expect(resolveAboutLinkUrl("security")).toBe(SECURITY_URL);
    expect(resolveAboutLinkUrl("acknowledgements")).toBe(SOURCE_URL);
  });

  it("returns null for an unknown id", () => {
    expect(resolveAboutLinkUrl("nope")).toBeNull();
    expect(resolveAboutLinkUrl("")).toBeNull();
  });

  it("resolves every ABOUT_LINKS id to a non-null destination", () => {
    for (const link of ABOUT_LINKS) {
      expect(resolveAboutLinkUrl(link.id)).not.toBeNull();
    }
  });
});
