import { describe, expect, it } from "vitest";
import { colors, rounded, spacing, typography } from "../src/index.js";

describe("design tokens", () => {
  it("exposes the dark surface color from DESIGN.md", () => {
    expect(colors.surface).toBe("#141218");
  });

  it("exposes the Electric Violet primary color from DESIGN.md", () => {
    expect(colors.primary).toBe("#cfbcff");
  });

  it("exposes the surface-container ladder", () => {
    expect(colors.surfaceContainerLowest).toBe("#0f0d13");
    expect(colors.surfaceContainerLow).toBe("#1d1b20");
    expect(colors.surfaceContainer).toBe("#211f24");
    expect(colors.surfaceContainerHigh).toBe("#2b292f");
    expect(colors.surfaceContainerHighest).toBe("#36343a");
  });

  it("exposes the semantic status colors (success = safe, warning = unverified)", () => {
    expect(colors.success).toBe("#7ee2b8");
    expect(colors.warning).toBe("#ffd9a0");
  });

  it("exposes the typography scale with Geist for headings", () => {
    expect(typography.display.fontFamily).toBe("Geist");
    expect(typography.h1.fontFamily).toBe("Geist");
    expect(typography.bodyMd.fontFamily).toBe("Inter");
    expect(typography.monoCode.fontFamily).toBe("JetBrains Mono");
  });

  it("exposes 8px-based spacing scale", () => {
    expect(spacing.xs).toBe("4px");
    expect(spacing.sm).toBe("8px");
    expect(spacing.md).toBe("16px");
    expect(spacing.lg).toBe("24px");
    expect(spacing.xl).toBe("48px");
    expect(spacing.xxl).toBe("80px");
  });

  it("exposes the rounded scale", () => {
    expect(rounded.sm).toBe("0.25rem");
    expect(rounded.DEFAULT).toBe("0.5rem");
    expect(rounded.md).toBe("0.75rem");
    expect(rounded.lg).toBe("1rem");
    expect(rounded.xl).toBe("1.5rem");
    expect(rounded.full).toBe("9999px");
  });
});
