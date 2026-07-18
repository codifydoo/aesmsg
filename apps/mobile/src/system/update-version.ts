// Pure version-comparison logic backing the blocking "Update required" gate (63 · Update Required).
// Extracted (node-env testable) so the .tsx screen stays thin & presentational, per the apps/mobile
// test convention (no React renderer in tests).
//
// The gate's only real decision is "is the installed app older than the minimum supported build?".
// That is a pure semantic-version comparison plus the platform store URL to send the user to — both
// crypto/native-free and trivially unit-testable here.

/** A parsed dotted version (e.g. "2.4.0" → [2, 4, 0]). Missing segments are treated as 0. */
export function parseVersion(version: string): number[] {
  return (version ?? "")
    .trim()
    .split(".")
    .map((seg) => {
      // Strip any pre-release / build suffix (e.g. "2.4.0-rc1" → "2", "1" → 1).
      const n = Number.parseInt(seg, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/**
 * Compare two dotted versions. Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Differing segment counts pad with zeros ("2.4" === "2.4.0").
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * Whether the installed version is below the minimum supported one — i.e. the blocking update gate
 * must be shown. Equal or newer installs are allowed through.
 *   isUpdateRequired("1.4.0", "2.4.0") → true
 *   isUpdateRequired("2.4.0", "2.4.0") → false
 *   isUpdateRequired("2.5.0", "2.4.0") → false
 */
export function isUpdateRequired(installed: string, minimum: string): boolean {
  return compareVersions(installed, minimum) < 0;
}

// App-store deep links for the "Update now" action. The screen is presentational — Integration wires
// onUpdate to Linking.openURL with the right platform URL; these constants keep the IDs in one place.
//
// These MUST point at the live listings or a force-upgrade strands users on a 404. They mirror the
// web's canonical values (apps/web/src/landing/app-store-links.ts): the App Store numeric id
// (id6775473926) and the Play Store listing keyed on the Android package id (com.aesmsg.app, see
// apps/mobile/app.config.ts). Keep all three in sync if a store id ever changes.
export const APP_STORE_URL = "https://apps.apple.com/app/aesmsg/id6775473926";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.aesmsg.app";

/** Resolve the store URL for the running platform; defaults to the App Store for unknown platforms. */
export function storeUrlForPlatform(platform: "ios" | "android" | string): string {
  return platform === "android" ? PLAY_STORE_URL : APP_STORE_URL;
}
