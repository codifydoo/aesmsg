import { describe, expect, it } from "vitest";
import {
  APP_STORE_URL,
  compareVersions,
  isUpdateRequired,
  PLAY_STORE_URL,
  parseVersion,
  storeUrlForPlatform,
} from "@/src/system/update-version";

// Pure version-comparison logic backing the blocking "Update required" gate (63 · Update Required).
// Tested per the node-env / no-React-renderer convention — the .tsx screen stays presentational.

describe("parseVersion", () => {
  it("splits a dotted version into numeric segments", () => {
    expect(parseVersion("2.4.0")).toEqual([2, 4, 0]);
  });

  it("treats non-numeric / pre-release segments as their leading integer (or 0)", () => {
    expect(parseVersion("2.4.0-rc1")).toEqual([2, 4, 0]);
    expect(parseVersion("v2.x")).toEqual([0, 0]);
  });

  it("handles empty / nullish input as a single zero segment", () => {
    expect(parseVersion("")).toEqual([0]);
  });
});

describe("compareVersions", () => {
  it("orders by most-significant segment first", () => {
    expect(compareVersions("1.4.0", "2.4.0")).toBe(-1);
    expect(compareVersions("2.4.0", "1.4.0")).toBe(1);
  });

  it("returns 0 for equal versions, padding missing segments with zeros", () => {
    expect(compareVersions("2.4.0", "2.4.0")).toBe(0);
    expect(compareVersions("2.4", "2.4.0")).toBe(0);
  });

  it("compares patch/minor segments when majors match", () => {
    expect(compareVersions("2.4.1", "2.4.0")).toBe(1);
    expect(compareVersions("2.3.9", "2.4.0")).toBe(-1);
  });
});

describe("isUpdateRequired", () => {
  it("requires an update when installed is older than the minimum (design 1.4.0 < 2.4.0)", () => {
    expect(isUpdateRequired("1.4.0", "2.4.0")).toBe(true);
  });

  it("allows equal or newer installs through", () => {
    expect(isUpdateRequired("2.4.0", "2.4.0")).toBe(false);
    expect(isUpdateRequired("2.5.0", "2.4.0")).toBe(false);
  });
});

describe("store URLs", () => {
  // Regression guard for FE-5/R27: a force-upgrade must send users to the LIVE listings, not a 404.
  // These must match the web's canonical values (apps/web/src/landing/app-store-links.ts).
  it("APP_STORE_URL is the live App Store listing (id6775473926)", () => {
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/aesmsg/id6775473926");
  });

  it("PLAY_STORE_URL is the live Play listing keyed on the real package id (com.aesmsg.app)", () => {
    expect(PLAY_STORE_URL).toBe("https://play.google.com/store/apps/details?id=com.aesmsg.app");
  });
});

describe("storeUrlForPlatform", () => {
  it("returns the Play Store URL on Android", () => {
    expect(storeUrlForPlatform("android")).toBe(PLAY_STORE_URL);
  });

  it("returns the App Store URL on iOS and unknown platforms", () => {
    expect(storeUrlForPlatform("ios")).toBe(APP_STORE_URL);
    expect(storeUrlForPlatform("web")).toBe(APP_STORE_URL);
  });
});
