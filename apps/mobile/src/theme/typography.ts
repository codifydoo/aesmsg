// aesmsg typography for React Native, mirrored from the authoritative type ramp in
//   /tmp/aesmsg_bundle/aesmsg/project/app/aesmsg.css  (.t-display, .t-h1, … .t-mono)
//
// The design uses Geist (display/headings), Inter (body), and JetBrains Mono (fingerprints / public
// keys / secure links ONLY). The custom-font LOADING PATH is wired end-to-end (see theme/app-fonts.ts
// + assets/fonts/README.md): drop the .ttf files into assets/fonts/, fill FONT_ASSETS, and flip
// FONTS_BUNDLED below — the families then flow into `type` everywhere with no per-screen change.
//
// Until those binary assets are added, display/body fall back to the platform system font (a clean,
// safe substitute), and `mono` ALWAYS resolves to a real monospace family (Menlo on iOS, monospace
// on Android) so the hard requirement — fingerprints / keys / links render monospaced — holds today.
//
// JetBrains-mono styling is ONLY for fingerprints, public keys, and secure links — never for
// general UI text. Use `type.mono` (or `fonts.mono`) for those, the system fonts everywhere else.
import { Platform, type TextStyle } from "react-native";

// Flip to `true` once the Geist / Inter / JetBrains Mono assets are bundled (see app-fonts.ts). While
// `false`, headings/body use the system font and mono uses the platform monospace — the current,
// asset-free behaviour.
export const FONTS_BUNDLED: boolean = false;

// PostScript / family names the app registers the bundled fonts under (must match app-fonts.ts).
export const FONT_FAMILY = {
  display: "Geist",
  body: "Inter",
  mono: "JetBrainsMono",
} as const;

const SYSTEM_MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export const fonts = {
  // Geist once bundled; system default otherwise.
  display: (FONTS_BUNDLED ? FONT_FAMILY.display : undefined) as string | undefined,
  // Inter once bundled; system default otherwise.
  body: (FONTS_BUNDLED ? FONT_FAMILY.body : undefined) as string | undefined,
  // JetBrains Mono once bundled; a REAL platform monospace otherwise (never the system sans).
  mono: FONTS_BUNDLED ? FONT_FAMILY.mono : SYSTEM_MONO,
} as const;

// Letter-spacing in the CSS ramp is expressed in `em`; RN expects points.
// points = em * fontSize. e.g. h1: -0.02em * 32 = -0.64.
//   .t-display  48 / 600 / lh 1.1 / -0.04em  → lineHeight 53, ls -1.92
//   .t-h1       32 / 600 / lh 1.2 / -0.02em  → lineHeight 38, ls -0.64
//   .t-h2       24 / 500 / lh 1.3 / -0.01em  → lineHeight 31, ls -0.24
//   .t-body-lg  18 / 400 / lh 1.6            → lineHeight 29
//   .t-body     15 / 400 / lh 1.5            → lineHeight 23
//   .t-label    13 / 500 / lh 1.4 / 0.05em / uppercase → lineHeight 18, ls 0.65
//   .t-mono     14 / 400 / lh 1.5            → lineHeight 21
export const type = {
  display: {
    fontFamily: fonts.display,
    fontSize: 48,
    fontWeight: "600",
    lineHeight: 53,
    letterSpacing: -1.92,
  } satisfies TextStyle,
  h1: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: "600",
    lineHeight: 38,
    letterSpacing: -0.64,
  } satisfies TextStyle,
  h2: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "500",
    lineHeight: 31,
    letterSpacing: -0.24,
  } satisfies TextStyle,
  bodyLg: {
    fontFamily: fonts.body,
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 29,
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 23,
  } satisfies TextStyle,
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    letterSpacing: 0.65,
    textTransform: "uppercase",
  } satisfies TextStyle,
  mono: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 21,
  } satisfies TextStyle,
} as const;

export type TypeToken = keyof typeof type;
