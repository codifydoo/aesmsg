import { useFonts } from "expo-font";

// Custom-font loading path for the app (expo-font). This is WIRED but currently INERT: no binary font
// assets are bundled in this repo, so FONT_ASSETS is empty and `useAppFonts()` reports "loaded"
// immediately (nothing to wait for). The app therefore renders with the safe system-font fallback
// today (see theme/typography.ts, FONTS_BUNDLED = false).
//
// TO ACTIVATE the real Geist / Inter / JetBrains Mono (see assets/fonts/README.md):
//   1. Drop the .ttf files into apps/mobile/assets/fonts/.
//   2. Populate FONT_ASSETS below with `require(...)` entries, keyed by the FONT_FAMILY names from
//      theme/typography.ts, e.g.:
//        import { FONT_FAMILY } from "@/src/theme/typography";
//        export const FONT_ASSETS = {
//          [FONT_FAMILY.display]: require("../../assets/fonts/Geist-Regular.ttf"),
//          [FONT_FAMILY.body]: require("../../assets/fonts/Inter-Regular.ttf"),
//          [FONT_FAMILY.mono]: require("../../assets/fonts/JetBrainsMono-Regular.ttf"),
//        };
//   3. Set FONTS_BUNDLED = true in theme/typography.ts.
// The App root already gates its first render on useAppFonts(), so the fonts are guaranteed present
// before any text paints — no FOUC and no per-screen change.
//
// NOTE: the `require("../../assets/fonts/…")` calls MUST stay out until the files exist — Metro
// resolves asset requires at bundle time and would fail the build on a missing path.

export const FONT_ASSETS: Record<string, number> = {};

/**
 * True once the app's custom fonts are ready to paint. With no assets bundled the map is empty and
 * this returns true on the first render (short-circuit), so gating on it is a no-op today; once
 * FONT_ASSETS is populated it holds until expo-font finishes loading.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts(FONT_ASSETS);
  return Object.keys(FONT_ASSETS).length === 0 ? true : loaded;
}
