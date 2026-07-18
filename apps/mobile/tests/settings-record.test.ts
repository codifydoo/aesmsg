import { describe, expect, it } from "vitest";
import {
  appLockTimeoutMs,
  isValidClipboardSeconds,
  migrateSettings,
  SETTINGS_DEFAULTS,
  type SettingsRecord,
  validateSettings,
} from "@/src/settings/settings-format";

// Pure validation / migration / derivation backing the persisted Settings store. Tested per the
// node-env / no-React-renderer convention. The store (settings-store.ts) layers persistence on top
// of these; the screens read derived values through useSettings.

describe("SETTINGS_DEFAULTS", () => {
  it("matches the spec defaults exactly", () => {
    expect(SETTINGS_DEFAULTS.biometric).toBe(true);
    expect(SETTINGS_DEFAULTS.introSeen).toBe(false);
    expect(SETTINGS_DEFAULTS.biometricOnboardingSeen).toBe(false);
    expect(SETTINGS_DEFAULTS.requireUnlock).toBe(true);
    expect(SETTINGS_DEFAULTS.blurPreview).toBe(true);
    expect(SETTINGS_DEFAULTS.blockScreens).toBe(true);
    expect(SETTINGS_DEFAULTS.autoWipe).toBe(true);
    expect(SETTINGS_DEFAULTS.clipboardClearSeconds).toBe(45);
    expect(SETTINGS_DEFAULTS.appLockTimeout).toBe("never");
    expect(SETTINGS_DEFAULTS.analytics).toBe(false);
    expect(SETTINGS_DEFAULTS.schemaVersion).toBe(1);
  });

  it("is returned as a fresh copy (callers can mutate without poisoning the shared default)", () => {
    const a = { ...SETTINGS_DEFAULTS };
    a.biometric = false;
    expect(SETTINGS_DEFAULTS.biometric).toBe(true);
  });
});

describe("isValidClipboardSeconds", () => {
  it("accepts integers inside the 10..90 range", () => {
    expect(isValidClipboardSeconds(10)).toBe(true);
    expect(isValidClipboardSeconds(45)).toBe(true);
    expect(isValidClipboardSeconds(90)).toBe(true);
  });

  it("rejects out-of-range, non-finite, and non-integer values", () => {
    expect(isValidClipboardSeconds(9)).toBe(false);
    expect(isValidClipboardSeconds(91)).toBe(false);
    expect(isValidClipboardSeconds(45.5)).toBe(false);
    expect(isValidClipboardSeconds(Number.NaN)).toBe(false);
    expect(isValidClipboardSeconds(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("appLockTimeoutMs", () => {
  it("maps 'never' to null (no auto-lock-on-timeout)", () => {
    expect(appLockTimeoutMs("never")).toBeNull();
  });

  it("maps each labelled window to milliseconds", () => {
    expect(appLockTimeoutMs("1m")).toBe(60_000);
    expect(appLockTimeoutMs("5m")).toBe(5 * 60_000);
    expect(appLockTimeoutMs("15m")).toBe(15 * 60_000);
    expect(appLockTimeoutMs("1h")).toBe(60 * 60_000);
  });
});

describe("validateSettings", () => {
  it("returns a complete record unchanged (round-trips a valid blob)", () => {
    const valid: SettingsRecord = {
      ...SETTINGS_DEFAULTS,
      biometric: false,
      clipboardClearSeconds: 30,
      appLockTimeout: "5m",
      createdAt: 111,
      updatedAt: 222,
    };
    expect(validateSettings(valid)).toEqual(valid);
  });

  it("fills missing / wrong-typed fields from defaults (a single bad field never discards the rest)", () => {
    const partial = {
      biometric: false,
      biometricOnboardingSeen: "yes", // wrong type -> default (false)
      clipboardClearSeconds: 999, // out of range -> default
      appLockTimeout: "bogus", // not in the union -> default
      analytics: "yes", // wrong type -> default
    } as unknown;
    const out = validateSettings(partial);
    expect(out.biometric).toBe(false); // valid field preserved
    expect(out.biometricOnboardingSeen).toBe(SETTINGS_DEFAULTS.biometricOnboardingSeen); // false
    expect(out.clipboardClearSeconds).toBe(SETTINGS_DEFAULTS.clipboardClearSeconds);
    expect(out.appLockTimeout).toBe(SETTINGS_DEFAULTS.appLockTimeout);
    expect(out.analytics).toBe(SETTINGS_DEFAULTS.analytics);
    expect(out.schemaVersion).toBe(1);
  });

  it("round-trips biometricOnboardingSeen true (persisted after onboarding completes)", () => {
    const seen = { ...SETTINGS_DEFAULTS, biometricOnboardingSeen: true };
    expect(validateSettings(seen).biometricOnboardingSeen).toBe(true);
  });

  it("round-trips introSeen true (the first-run intro is not re-shown after it is dismissed)", () => {
    const seen = { ...SETTINGS_DEFAULTS, introSeen: true };
    expect(validateSettings(seen).introSeen).toBe(true);
  });

  it("defaults introSeen to false when missing / wrong-typed (fresh install shows the intro)", () => {
    expect(validateSettings({}).introSeen).toBe(false);
    expect(validateSettings({ introSeen: "yes" }).introSeen).toBe(false);
  });

  it("returns defaults for null / non-object input", () => {
    expect(validateSettings(null)).toEqual(SETTINGS_DEFAULTS);
    expect(validateSettings(42)).toEqual(SETTINGS_DEFAULTS);
    expect(validateSettings("nope")).toEqual(SETTINGS_DEFAULTS);
  });
});

describe("migrateSettings", () => {
  it("passes a current-schema record through validation", () => {
    const rec = { ...SETTINGS_DEFAULTS, biometric: false };
    expect(migrateSettings(rec)).toEqual(rec);
  });

  it("treats an unknown/future schemaVersion as best-effort: keeps recognised fields, fills the rest", () => {
    const future = {
      ...SETTINGS_DEFAULTS,
      schemaVersion: 99,
      biometric: false,
      somethingNew: true,
    } as unknown;
    const out = migrateSettings(future);
    expect(out.schemaVersion).toBe(1); // normalised to the version this build understands
    expect(out.biometric).toBe(false); // recognised field preserved
    expect("somethingNew" in out).toBe(false); // unknown field dropped
  });

  it("returns defaults for null input", () => {
    expect(migrateSettings(null)).toEqual(SETTINGS_DEFAULTS);
  });
});
