import { describe, expect, it } from "vitest";
import { iconA11yLabel } from "@/src/components/icon-a11y-label";

describe("iconA11yLabel", () => {
  it("maps the AppBar overflow/security glyphs to spoken labels (not raw ligature names)", () => {
    expect(iconA11yLabel("more_horiz")).toBe("More options");
    expect(iconA11yLabel("shield")).toBe("Security");
    expect(iconA11yLabel("shield_lock")).toBe("Security");
  });

  it("labels the common icon-only actions", () => {
    expect(iconA11yLabel("content_copy")).toBe("Copy");
    expect(iconA11yLabel("ios_share")).toBe("Share");
    expect(iconA11yLabel("download")).toBe("Save");
    expect(iconA11yLabel("qr_code_scanner")).toBe("Scan QR code");
    expect(iconA11yLabel("arrow_back_ios_new")).toBe("Back");
  });

  it("de-slugifies an unmapped name into a readable sentence-case fallback", () => {
    expect(iconA11yLabel("some_new_glyph")).toBe("Some new glyph");
    expect(iconA11yLabel("volume_up")).toBe("Volume up");
  });

  it("never returns an empty string for a non-empty name", () => {
    expect(iconA11yLabel("x").length).toBeGreaterThan(0);
  });
});
