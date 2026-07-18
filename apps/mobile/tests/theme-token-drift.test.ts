import {
  colors as canonicalColors,
  rounded as canonicalRounded,
  spacing as canonicalSpacing,
} from "@aesmsg/design-tokens";
import { describe, expect, it } from "vitest";
import {
  colors as mobileColors,
  radii as mobileRadii,
  space as mobileSpace,
} from "@/src/theme/tokens";

// Design-token drift guard (ARCH-3 / R30).
//
// `@aesmsg/design-tokens` is the single canonical source of truth for the palette,
// spacing, and corner radii. The React Native app cannot consume the CSS/Tailwind
// package at runtime, so `apps/mobile/src/theme/tokens.ts` HAND-MIRRORS the subset of
// tokens the native screens use. Hand-mirroring drifts silently — this is exactly how
// the "safe/verified" green forked (mobile `emerald` #6fd29a vs canonical `success`
// #7ee2b8). These tests fail whenever the mobile mirror diverges from canonical, so any
// future change to either side must be made on both (or explicitly excepted below).
//
// The maps below are the CONTRACT: each mobile token key is declared to mirror a named
// canonical token. Adding a mobile token without adding it here (or to a *_MOBILE_ONLY
// / *_EXCEPTIONS set) fails the completeness check, forcing a conscious decision.

// mobile color key -> canonical color key it mirrors.
const COLOR_MIRROR = {
  surface: "surface",
  surfaceContainerLowest: "surfaceContainerLowest",
  surfaceContainerLow: "surfaceContainerLow",
  surfaceContainer: "surfaceContainer",
  surfaceContainerHigh: "surfaceContainerHigh",
  surfaceContainerHighest: "surfaceContainerHighest",
  onSurface: "onSurface",
  onSurfaceVariant: "onSurfaceVariant",
  outline: "outline",
  outlineVariant: "outlineVariant",
  primary: "primary",
  onPrimary: "onPrimary",
  primaryContainer: "primaryContainer",
  onPrimaryContainer: "onPrimaryContainer",
  secondary: "secondary",
  tertiary: "tertiary",
  onTertiary: "onTertiary",
  error: "error",
  errorContainer: "errorContainer",
  onErrorContainer: "onErrorContainer",
  emerald: "success", // the historically-forked "safe / verified" green
  amber: "tertiary", // mobile alias of tertiary
  background: "background",
} as const satisfies Record<keyof typeof mobileColors, keyof typeof canonicalColors>;

// Mobile color keys that intentionally have NO canonical equivalent. Document each with
// a reason. Currently empty — the mobile palette mirrors canonical 1:1.
const COLOR_MOBILE_ONLY = new Set<keyof typeof mobileColors>([]);

// Intentional value divergences from canonical (mobile key). Add a mobile key here with a
// comment explaining why it must differ; the equality assertion then skips it. Currently
// empty — no intentional forks. Keeping the mechanism means an intentional divergence is a
// visible, reviewed, one-line allowlist entry, not silent drift.
const COLOR_VALUE_EXCEPTIONS = new Set<keyof typeof mobileColors>([]);

// mobile spacing key -> canonical spacing key. Mobile stores points (number); canonical
// stores CSS px strings ("16px"). Mobile mirrors a subset (no `xxl`).
const SPACE_MIRROR = {
  xs: "xs",
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
} as const satisfies Record<keyof typeof mobileSpace, keyof typeof canonicalSpacing>;

// mobile radius key -> canonical rounded key. Mobile stores points (number); canonical
// stores CSS length strings ("0.25rem" | "9999px"). Mobile mirrors a subset.
const RADII_MIRROR = {
  sm: "sm",
  md: "md",
  lg: "lg",
  full: "full",
} as const satisfies Record<keyof typeof mobileRadii, keyof typeof canonicalRounded>;

// Convert a canonical CSS length ("16px" | "1rem") to a number of points, matching the
// mobile convention (1rem = 16pt).
function toPoints(css: string): number {
  const rem = css.match(/^(-?[\d.]+)rem$/);
  if (rem?.[1]) return Number.parseFloat(rem[1]) * 16;
  const px = css.match(/^(-?[\d.]+)px$/);
  if (px?.[1]) return Number.parseFloat(px[1]);
  throw new Error(`Unrecognized canonical length: "${css}"`);
}

describe("design-token mobile mirror drift guard", () => {
  it("mirrors every canonical color it claims to, with no unintentional fork", () => {
    for (const mobileKey of Object.keys(COLOR_MIRROR) as (keyof typeof COLOR_MIRROR)[]) {
      if (COLOR_VALUE_EXCEPTIONS.has(mobileKey)) continue;
      const canonicalKey = COLOR_MIRROR[mobileKey];
      expect(
        mobileColors[mobileKey],
        `mobile colors.${mobileKey} must mirror canonical colors.${canonicalKey}`,
      ).toBe(canonicalColors[canonicalKey]);
    }
  });

  it("keeps the previously-forked safe/verified green aligned to canonical success", () => {
    // Regression pin for ARCH-3: emerald was #6fd29a while canonical success was #7ee2b8.
    expect(mobileColors.emerald).toBe(canonicalColors.success);
  });

  it("declares every mobile color key as either mirrored or explicitly mobile-only", () => {
    for (const mobileKey of Object.keys(mobileColors) as (keyof typeof mobileColors)[]) {
      const declared = mobileKey in COLOR_MIRROR || COLOR_MOBILE_ONLY.has(mobileKey);
      expect(
        declared,
        `mobile colors.${mobileKey} is undeclared — map it to a canonical token or add it to COLOR_MOBILE_ONLY`,
      ).toBe(true);
    }
  });

  it("mirrors the canonical spacing scale (points === canonical px/rem)", () => {
    for (const mobileKey of Object.keys(SPACE_MIRROR) as (keyof typeof SPACE_MIRROR)[]) {
      const canonicalKey = SPACE_MIRROR[mobileKey];
      expect(
        mobileSpace[mobileKey],
        `mobile space.${mobileKey} must mirror canonical spacing.${canonicalKey}`,
      ).toBe(toPoints(canonicalSpacing[canonicalKey]));
    }
  });

  it("mirrors the canonical corner-radius scale (points === canonical px/rem)", () => {
    for (const mobileKey of Object.keys(RADII_MIRROR) as (keyof typeof RADII_MIRROR)[]) {
      const canonicalKey = RADII_MIRROR[mobileKey];
      expect(
        mobileRadii[mobileKey],
        `mobile radii.${mobileKey} must mirror canonical rounded.${canonicalKey}`,
      ).toBe(toPoints(canonicalRounded[canonicalKey]));
    }
  });
});
