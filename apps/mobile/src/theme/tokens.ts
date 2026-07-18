// aesmsg design tokens for React Native, mirrored from the authoritative design source:
//   @aesmsg/design-tokens  (packages/design-tokens/src/*.ts — the canonical TS exports)
//   secure_message_design_system/DESIGN.md
//
// The @aesmsg/design-tokens package is CSS/Tailwind-oriented; this module is the single
// RN-side mirror so screens never hardcode hex. Keep these in sync with the canonical
// @aesmsg/design-tokens exports if the design tokens change — the mirror is pinned by
// apps/mobile/tests/theme-token-drift.test.ts, which fails when this file diverges.
//
// Color semantics (non-negotiable):
//   primary (electric violet) = brand / primary action
//   emerald (green)           = verified | decrypted | safe
//   tertiary / amber          = unverified | expiring soon | key changed
//   error (red)               = destructive ONLY (revoke, delete, wipe)
export const colors = {
  // ── surfaces ──────────────────────────────────────────────
  surface: "#141218",
  surfaceContainerLowest: "#0f0d13",
  surfaceContainerLow: "#1d1b20",
  surfaceContainer: "#211f24",
  surfaceContainerHigh: "#2b292f",
  surfaceContainerHighest: "#36343a",

  // ── text / outlines ───────────────────────────────────────
  onSurface: "#e6e0e9",
  onSurfaceVariant: "#cbc4d2",
  outline: "#948e9c",
  outlineVariant: "#494551",

  // ── primary (electric violet) ─────────────────────────────
  primary: "#cfbcff",
  onPrimary: "#381e72",
  primaryContainer: "#6750a4",
  onPrimaryContainer: "#e0d2ff",
  secondary: "#cdc0e9",

  // ── semantic ──────────────────────────────────────────────
  tertiary: "#e7c365", // amber: unverified / expiring
  onTertiary: "#3e2e00",
  error: "#ffb4ab",
  errorContainer: "#93000a",
  onErrorContainer: "#ffdad6",
  emerald: "#7ee2b8", // green: verified / safe (mirrors @aesmsg/design-tokens `success`)

  // ── back-compat aliases (do not remove — existing screens import these) ──
  amber: "#e7c365", // alias of tertiary
  background: "#141218", // alias of surface
} as const;

export type ColorToken = keyof typeof colors;

// Corner radii — mirrors --r-sm/.25rem, --r-md/.75rem, --r-lg/1rem (1rem = 16px base).
export const radii = {
  sm: 4,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

// Spacing scale (points). Co-located here so layout spacing is centralized too.
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 48,
} as const;
