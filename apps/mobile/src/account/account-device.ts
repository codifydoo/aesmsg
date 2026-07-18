// Pure device / app-version presentation for the Account screen's "Identity & device" list. No
// native imports (react-native Platform / expo-application) live here, so it is node-testable per the
// mobile convention; the thin AccountScreen injects the real values it reads from those native
// sources. These helpers NEVER fabricate a value — a blank input yields "" so the caller hides the
// row rather than showing a placeholder.

/** Human OS name for a react-native `Platform.OS` token. Unknown tokens pass through unchanged. */
export function osDisplayName(os: string): string {
  switch (os) {
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "web":
      return "Web";
    default:
      return os;
  }
}

/**
 * The "This device" label from an OS name + version string, e.g.
 *   formatDeviceLabel("iOS", "18.2")   -> "iOS 18.2"
 *   formatDeviceLabel("Android", "14") -> "Android 14"
 *   formatDeviceLabel("iOS", "")       -> "iOS"   (no version → just the OS name)
 *   formatDeviceLabel("", "18.2")      -> ""      (no OS → caller hides the row)
 *
 * NOTE: this is the OS + version, not the hardware model. The model ("iPhone 16 Pro") requires
 * `expo-device`, which is NOT a dependency (see the gap note in AccountScreen) — so we show real OS
 * info rather than a fabricated model string.
 */
export function formatDeviceLabel(osName: string, osVersion: string): string {
  const name = (osName ?? "").trim();
  if (!name) return "";
  const version = (osVersion ?? "").trim();
  return version ? `${name} ${version}` : name;
}

/** Normalize a native app-version string; blank/nullish -> "" so the caller can hide the row. */
export function formatAppVersion(version: string | null | undefined): string {
  return (version ?? "").trim();
}
