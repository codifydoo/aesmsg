import { describe, expect, it } from "vitest";
import { formatAppVersion, formatDeviceLabel, osDisplayName } from "@/src/account/account-device";

// Pure device / app-version presentation for the Account screen's "Identity & device" list (node-env,
// no renderer). AccountScreen injects the real Platform.OS / Platform version / expo-application
// values; these helpers only format them and NEVER fabricate a value.

describe("osDisplayName", () => {
  it("maps the known react-native OS tokens to human names", () => {
    expect(osDisplayName("ios")).toBe("iOS");
    expect(osDisplayName("android")).toBe("Android");
    expect(osDisplayName("macos")).toBe("macOS");
    expect(osDisplayName("windows")).toBe("Windows");
    expect(osDisplayName("web")).toBe("Web");
  });

  it("passes unknown tokens through unchanged (never invents a name)", () => {
    expect(osDisplayName("harmonyos")).toBe("harmonyos");
    expect(osDisplayName("")).toBe("");
  });
});

describe("formatDeviceLabel", () => {
  it("joins a real OS name + version", () => {
    expect(formatDeviceLabel("iOS", "18.2")).toBe("iOS 18.2");
    expect(formatDeviceLabel("Android", "14")).toBe("Android 14");
  });

  it("shows just the OS name when no version is known", () => {
    expect(formatDeviceLabel("iOS", "")).toBe("iOS");
    expect(formatDeviceLabel("Android", "   ")).toBe("Android");
  });

  it("returns '' when the OS is blank so the caller hides the row (no placeholder)", () => {
    expect(formatDeviceLabel("", "18.2")).toBe("");
    expect(formatDeviceLabel("   ", "18.2")).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(formatDeviceLabel("  iOS  ", "  18.2  ")).toBe("iOS 18.2");
  });
});

describe("formatAppVersion", () => {
  it("returns the native version string", () => {
    expect(formatAppVersion("1.0.0")).toBe("1.0.0");
  });

  it("returns '' for a missing/blank version so the row is hidden, never faked", () => {
    expect(formatAppVersion(null)).toBe("");
    expect(formatAppVersion(undefined)).toBe("");
    expect(formatAppVersion("   ")).toBe("");
  });
});
