// The web subset of the mobile SettingsRecord (apps/mobile/src/settings/settings-format.ts). The web
// keeps only the ACTIONABLE device-only prefs and drops what is native-only or inherent (D7):
//   • clipboardClearSeconds (10..90, default 45) — wired into the reader clipboard hook (D8/Task 12).
//   • appLockTimeout ("never"/1m/5m/15m/1h, default "never") — drives the web idle auto-lock (D8).
// Everything else the mobile record carries is dropped on web: biometrics/requireUnlock (no
// biometrics — the passphrase re-prompt IS the gate), blurPreview (inherent — the reader already
// blurs on visibilitychange), blockScreens (impossible on web — surfaced as the honest gap, not a
// toggle), autoWipe (inherent — decrypted plaintext is memory-only), analytics (app.aesmsg.com ships
// none). CRITICAL INVARIANT: this record holds NO key material — only prefs + timestamps.
//
// validate/migrate below are FAIL-SOFT (ported from mobile): a missing/corrupt blob, or a single bad
// field, falls back to its default and NEVER throws — a broken settings blob must not brick startup.

export type AppLockTimeout = "never" | "1m" | "5m" | "15m" | "1h";

export interface SettingsRecord {
  /** Clipboard auto-clear delay in whole seconds, clamped to [10,90]. */
  clipboardClearSeconds: number;
  /** Inactivity window before the app auto-locks; "never" disables the timer. */
  appLockTimeout: AppLockTimeout;
  schemaVersion: 1;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

const SETTINGS_SCHEMA_VERSION = 1 as const;

// ── Clipboard auto-clear ─────────────────────────────────────────────────────
// The design caps the clear delay between 10s and 90s (45s default lands near the middle).
export const CLIPBOARD_CLEAR_MIN_SECONDS = 10;
export const CLIPBOARD_CLEAR_MAX_SECONDS = 90;

/** Clamp an arbitrary number into the supported clipboard-clear range (floored to whole seconds). */
export function clampClipboardSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return CLIPBOARD_CLEAR_MIN_SECONDS;
  const floored = Math.floor(seconds);
  if (floored < CLIPBOARD_CLEAR_MIN_SECONDS) return CLIPBOARD_CLEAR_MIN_SECONDS;
  if (floored > CLIPBOARD_CLEAR_MAX_SECONDS) return CLIPBOARD_CLEAR_MAX_SECONDS;
  return floored;
}

/** Human label for a clipboard-clear delay, e.g. 45 -> "45s". Non-finite/out-of-range clamps. */
export function formatClipboardClear(seconds: number): string {
  return `${clampClipboardSeconds(seconds)}s`;
}

/** True only for whole seconds within the supported clipboard-clear range [10,90]. */
export function isValidClipboardSeconds(seconds: unknown): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isInteger(seconds) &&
    seconds >= CLIPBOARD_CLEAR_MIN_SECONDS &&
    seconds <= CLIPBOARD_CLEAR_MAX_SECONDS
  );
}

// ── App-lock timeout ─────────────────────────────────────────────────────────
const APP_LOCK_TIMEOUTS: readonly AppLockTimeout[] = ["never", "1m", "5m", "15m", "1h"];
const APP_LOCK_TIMEOUT_MS: Record<Exclude<AppLockTimeout, "never">, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

/** Inactivity window in ms; "never" -> null (no timeout-driven lock). Wired into the auto-lock hook. */
export function appLockTimeoutMs(timeout: AppLockTimeout): number | null {
  if (timeout === "never") return null;
  return APP_LOCK_TIMEOUT_MS[timeout];
}

/** Selectable app-lock-timeout options (value + label + one-line description) for the picker. */
export const APP_LOCK_TIMEOUT_OPTIONS: ReadonlyArray<{
  value: AppLockTimeout;
  label: string;
  description: string;
}> = [
  { value: "never", label: "Never", description: "Don't auto-lock" },
  { value: "1m", label: "1 minute", description: "Re-lock after 1 minute idle" },
  { value: "5m", label: "5 minutes", description: "Re-lock after 5 minutes idle" },
  { value: "15m", label: "15 minutes", description: "Re-lock after 15 minutes idle" },
  { value: "1h", label: "1 hour", description: "Re-lock after 1 hour idle" },
];

/** The short label for a timeout value (e.g. "5m" → "5 minutes"); falls back to the raw value. */
export function appLockTimeoutLabel(timeout: AppLockTimeout): string {
  return APP_LOCK_TIMEOUT_OPTIONS.find((o) => o.value === timeout)?.label ?? timeout;
}

function isAppLockTimeout(v: unknown): v is AppLockTimeout {
  return typeof v === "string" && (APP_LOCK_TIMEOUTS as readonly string[]).includes(v);
}

// ── Defaults ─────────────────────────────────────────────────────────────────
const SETTINGS_DEFAULTS_BASE: Omit<SettingsRecord, "createdAt" | "updatedAt"> = {
  clipboardClearSeconds: 45,
  appLockTimeout: "never",
  schemaVersion: SETTINGS_SCHEMA_VERSION,
};

/** Spec defaults (§4). A fresh object each access so a caller's mutation can't poison the baseline. */
export const SETTINGS_DEFAULTS: SettingsRecord = {
  ...SETTINGS_DEFAULTS_BASE,
  createdAt: 0,
  updatedAt: 0,
};

/**
 * Coerce arbitrary parsed JSON into a complete, well-typed SettingsRecord. Every field is checked
 * independently and falls back to its default if missing or wrong-typed — a single corrupt field
 * NEVER discards the rest. createdAt/updatedAt are preserved when finite, else 0. Never throws.
 */
export function validateSettings(input: unknown): SettingsRecord {
  if (input === null || typeof input !== "object") {
    return { ...SETTINGS_DEFAULTS };
  }
  const r = input as Record<string, unknown>;
  const createdAt =
    typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : 0;
  const updatedAt =
    typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : 0;
  return {
    clipboardClearSeconds: isValidClipboardSeconds(r.clipboardClearSeconds)
      ? r.clipboardClearSeconds
      : SETTINGS_DEFAULTS.clipboardClearSeconds,
    appLockTimeout: isAppLockTimeout(r.appLockTimeout)
      ? r.appLockTimeout
      : SETTINGS_DEFAULTS.appLockTimeout,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    createdAt,
    updatedAt,
  };
}

/**
 * Bring any stored record up to the current schema. Only schemaVersion 1 exists today, so migration
 * is "normalise via validateSettings": recognised fields survive, unknown fields are dropped, and the
 * version is stamped. Future versions add explicit step-ups above this call.
 */
export function migrateSettings(input: unknown): SettingsRecord {
  return validateSettings(input);
}
