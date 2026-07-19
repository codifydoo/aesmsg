import { describe, expect, it } from "vitest";
import {
  appLockTimeoutLabel,
  appLockTimeoutMs,
  clampClipboardSeconds,
  formatClipboardClear,
  migrateSettings,
  SETTINGS_DEFAULTS,
  validateSettings,
} from "@/src/settings/settings-format";

describe("settings-format", () => {
  describe("clampClipboardSeconds", () => {
    it("clamps below/above the [10,90] range and floors to whole seconds", () => {
      expect(clampClipboardSeconds(5)).toBe(10);
      expect(clampClipboardSeconds(200)).toBe(90);
      expect(clampClipboardSeconds(45.9)).toBe(45);
      expect(clampClipboardSeconds(Number.NaN)).toBe(10);
      expect(clampClipboardSeconds(Number.POSITIVE_INFINITY)).toBe(10);
    });
  });

  describe("formatClipboardClear", () => {
    it("renders a clamped seconds label", () => {
      expect(formatClipboardClear(45)).toBe("45s");
      expect(formatClipboardClear(3)).toBe("10s");
    });
  });

  describe("appLockTimeoutMs", () => {
    it("maps each timeout to ms and 'never' to null", () => {
      expect(appLockTimeoutMs("never")).toBeNull();
      expect(appLockTimeoutMs("1m")).toBe(60_000);
      expect(appLockTimeoutMs("5m")).toBe(300_000);
      expect(appLockTimeoutMs("15m")).toBe(900_000);
      expect(appLockTimeoutMs("1h")).toBe(3_600_000);
    });
  });

  describe("appLockTimeoutLabel", () => {
    it("returns a human label for each option", () => {
      expect(appLockTimeoutLabel("never")).toBe("Never");
      expect(appLockTimeoutLabel("5m")).toBe("5 minutes");
    });
  });

  describe("validateSettings (fail-soft, per-field fallback)", () => {
    it("returns defaults for a non-object / null input", () => {
      expect(validateSettings(null)).toEqual(SETTINGS_DEFAULTS);
      expect(validateSettings("nope")).toEqual(SETTINGS_DEFAULTS);
      expect(validateSettings(42)).toEqual(SETTINGS_DEFAULTS);
    });

    it("falls back a single corrupt field WITHOUT discarding the rest, never throws", () => {
      const r = validateSettings({
        clipboardClearSeconds: 999, // out of range → default 45
        appLockTimeout: "5m", // valid → kept
        createdAt: 111,
        updatedAt: 222,
      });
      expect(r.clipboardClearSeconds).toBe(45);
      expect(r.appLockTimeout).toBe("5m");
      expect(r.createdAt).toBe(111);
      expect(r.updatedAt).toBe(222);
      expect(r.schemaVersion).toBe(1);
    });

    it("falls back a bad appLockTimeout to 'never' and keeps a valid clipboard value", () => {
      const r = validateSettings({ clipboardClearSeconds: 30, appLockTimeout: "bogus" });
      expect(r.clipboardClearSeconds).toBe(30);
      expect(r.appLockTimeout).toBe("never");
    });

    it("resets non-finite timestamps to 0", () => {
      const r = validateSettings({ createdAt: Number.NaN, updatedAt: "x" });
      expect(r.createdAt).toBe(0);
      expect(r.updatedAt).toBe(0);
    });
  });

  describe("migrateSettings", () => {
    it("normalises via validateSettings and stamps the schema version", () => {
      const r = migrateSettings({ clipboardClearSeconds: 60, unknownField: "dropped" });
      expect(r.clipboardClearSeconds).toBe(60);
      expect(r.schemaVersion).toBe(1);
      expect((r as unknown as Record<string, unknown>).unknownField).toBeUndefined();
    });
  });
});
