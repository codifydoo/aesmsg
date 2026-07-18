// Pure formatting logic for the Settings feature, extracted (node-env testable) so the .tsx screens
// stay thin & presentational, per the apps/mobile test convention (no React renderer in tests).
//
// Two concerns live here:
//   1. The clipboard-auto-clear slider (46 · Security): seconds -> display label + 0..1 fill fraction.
//   2. Fingerprint display strings (45 · Settings Root profile, 48 · Advanced) derived from a
//      resolved crypto Fingerprint ("AM-XXXX-XXXX-...") into the spaced JetBrains-mono groups the
//      design shows ("E82F 4D11" short, "E82F 4D11 A9C2 77BE" full).

// ── Clipboard auto-clear slider ──────────────────────────────────────────────
// The design caps the clear delay between 10s and 90s; the screenshot shows 45s with a ~50%-filled
// track. We keep that range so the default (45s) lands near the middle, matching the mockup.
export const CLIPBOARD_CLEAR_MIN_SECONDS = 10;
export const CLIPBOARD_CLEAR_MAX_SECONDS = 90;

/** Human label for a clipboard-clear delay, e.g. 45 -> "45s". Non-finite/negative clamps to the min. */
export function formatClipboardClear(seconds: number): string {
  const v = clampClipboardSeconds(seconds);
  return `${v}s`;
}

/**
 * Fraction (0..1) of the slider track that should be filled for a given delay — drives the fill bar
 * + knob position in the presentational slider. 45s over [10,90] → 0.4375; the design's ~half-fill.
 */
export function clipboardFillFraction(seconds: number): number {
  const v = clampClipboardSeconds(seconds);
  const span = CLIPBOARD_CLEAR_MAX_SECONDS - CLIPBOARD_CLEAR_MIN_SECONDS;
  if (span <= 0) return 0;
  return (v - CLIPBOARD_CLEAR_MIN_SECONDS) / span;
}

/**
 * Map a horizontal drag x-position over a measured track width into a clipboard-clear delay in whole
 * seconds — the inverse of clipboardFillFraction, used by the Security slider's gesture handler. The
 * fraction is clamped to [0,1] (over-/under-shoot pins to the ends) and mapped across [MIN,MAX]. Returns
 * null when the track has not been measured yet (width <= 0) so callers can ignore pre-layout gestures.
 */
export function clipboardSecondsForX(x: number, trackWidth: number): number | null {
  if (!(trackWidth > 0)) return null;
  const frac = Math.max(0, Math.min(1, x / trackWidth));
  const span = CLIPBOARD_CLEAR_MAX_SECONDS - CLIPBOARD_CLEAR_MIN_SECONDS;
  return clampClipboardSeconds(CLIPBOARD_CLEAR_MIN_SECONDS + Math.round(frac * span));
}

/** Clamp an arbitrary number into the supported clipboard-clear range (and floor to whole seconds). */
export function clampClipboardSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return CLIPBOARD_CLEAR_MIN_SECONDS;
  const floored = Math.floor(seconds);
  if (floored < CLIPBOARD_CLEAR_MIN_SECONDS) return CLIPBOARD_CLEAR_MIN_SECONDS;
  if (floored > CLIPBOARD_CLEAR_MAX_SECONDS) return CLIPBOARD_CLEAR_MAX_SECONDS;
  return floored;
}

// ── Fingerprint display strings ──────────────────────────────────────────────
// A resolved crypto Fingerprint looks like "AM-E82F-4D11-A9C2-77BE-…" (a "AM-" prefix + 8 hyphen-
// joined 4-char hex groups). The design shows it as space-joined groups in JetBrains Mono. These
// helpers slice off the prefix and re-join the first N groups with spaces, with no crypto dependency
// so they're trivially unit-testable.

const FINGERPRINT_PREFIX = "AM-";

/**
 * Take a resolved fingerprint string and return its first `groups` 4-char chunks, space-joined.
 *   formatFingerprintGroups("AM-E82F-4D11-A9C2-77BE", 2) -> "E82F 4D11"
 *   formatFingerprintGroups("AM-E82F-4D11-A9C2-77BE", 4) -> "E82F 4D11 A9C2 77BE"
 * Accepts already-hyphenated or already-spaced input; "" / nullish -> "".
 */
export function formatFingerprintGroups(fingerprint: string, groups: number): string {
  const raw = fingerprint ?? "";
  const body = raw.startsWith(FINGERPRINT_PREFIX) ? raw.slice(FINGERPRINT_PREFIX.length) : raw;
  const chunks = body.split(/[\s-]+/).filter((c) => c.length > 0);
  const want = Math.max(0, Math.floor(groups));
  return chunks.slice(0, want).join(" ");
}

// ── Persisted settings model (§4) ────────────────────────────────────────────
// The encrypted on-device preferences blob. Stored as JSON in the single EncryptedStore under the
// "settings" key. validate/migrate below guarantee a load NEVER throws on a partially-corrupt or
// stale-schema blob — a single bad field falls back to its default, never discarding the record.

export type AppLockTimeout = "never" | "1m" | "5m" | "15m" | "1h";

export interface SettingsRecord {
  biometric: boolean; // persisted; not a true on/off this slice (see §6)
  introSeen: boolean; // true once the first-run Welcome/How-It-Works intro has been dismissed
  biometricOnboardingSeen: boolean; // true once the one-time §5 onboarding screen has been resolved
  requireUnlock: boolean;
  blurPreview: boolean; // -> privacy-shield blur-on-background
  blockScreens: boolean; // -> expo-screen-capture prevent/allow
  autoWipe: boolean; // -> reader auto-wipe of decrypted content
  clipboardClearSeconds: number; // 10..90, integer
  appLockTimeout: AppLockTimeout; // "never" => no timeout-lock
  analytics: boolean; // persisted only — no SDK, nothing sent
  // Quiet-hours preferences now live in @/src/notifications/prefs (nested quietHours), the single
  // source of truth after the notifications work merged — they are intentionally NOT in SettingsRecord.
  schemaVersion: 1;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

const SETTINGS_SCHEMA_VERSION = 1 as const;

// A frozen baseline; SETTINGS_DEFAULTS is a getter-style fresh copy so callers can mutate freely.
const SETTINGS_DEFAULTS_BASE: Omit<SettingsRecord, "createdAt" | "updatedAt"> = {
  biometric: true,
  introSeen: false,
  biometricOnboardingSeen: false,
  requireUnlock: true,
  blurPreview: true,
  blockScreens: true,
  autoWipe: true,
  clipboardClearSeconds: 45,
  appLockTimeout: "never",
  analytics: false,
  schemaVersion: SETTINGS_SCHEMA_VERSION,
};

/** Spec defaults (§4). A fresh object each access so a caller's mutation can't poison the baseline. */
export const SETTINGS_DEFAULTS: SettingsRecord = {
  ...SETTINGS_DEFAULTS_BASE,
  createdAt: 0,
  updatedAt: 0,
};

const APP_LOCK_TIMEOUTS: readonly AppLockTimeout[] = ["never", "1m", "5m", "15m", "1h"];
const APP_LOCK_TIMEOUT_MS: Record<Exclude<AppLockTimeout, "never">, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

/** Inactivity window in ms; "never" -> null (no timeout-driven lock). Wired into identity auto-lock. */
export function appLockTimeoutMs(timeout: AppLockTimeout): number | null {
  if (timeout === "never") return null;
  return APP_LOCK_TIMEOUT_MS[timeout];
}

/** Selectable app-lock-timeout options (value + label + one-line description) for the picker sheet. */
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

/** True only for whole seconds within the supported clipboard-clear range [10,90]. */
export function isValidClipboardSeconds(seconds: unknown): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isInteger(seconds) &&
    seconds >= CLIPBOARD_CLEAR_MIN_SECONDS &&
    seconds <= CLIPBOARD_CLEAR_MAX_SECONDS
  );
}

function isAppLockTimeout(v: unknown): v is AppLockTimeout {
  return typeof v === "string" && (APP_LOCK_TIMEOUTS as readonly string[]).includes(v);
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Coerce arbitrary parsed JSON into a complete, well-typed SettingsRecord. Every field is checked
 * independently and falls back to its default if missing or wrong-typed — a single corrupt field
 * NEVER discards the rest. createdAt/updatedAt are preserved when finite, else 0.
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
    biometric: bool(r.biometric, SETTINGS_DEFAULTS.biometric),
    introSeen: bool(r.introSeen, SETTINGS_DEFAULTS.introSeen),
    biometricOnboardingSeen: bool(
      r.biometricOnboardingSeen,
      SETTINGS_DEFAULTS.biometricOnboardingSeen,
    ),
    requireUnlock: bool(r.requireUnlock, SETTINGS_DEFAULTS.requireUnlock),
    blurPreview: bool(r.blurPreview, SETTINGS_DEFAULTS.blurPreview),
    blockScreens: bool(r.blockScreens, SETTINGS_DEFAULTS.blockScreens),
    autoWipe: bool(r.autoWipe, SETTINGS_DEFAULTS.autoWipe),
    clipboardClearSeconds: isValidClipboardSeconds(r.clipboardClearSeconds)
      ? r.clipboardClearSeconds
      : SETTINGS_DEFAULTS.clipboardClearSeconds,
    appLockTimeout: isAppLockTimeout(r.appLockTimeout)
      ? r.appLockTimeout
      : SETTINGS_DEFAULTS.appLockTimeout,
    analytics: bool(r.analytics, SETTINGS_DEFAULTS.analytics),
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    createdAt,
    updatedAt,
  };
}

/**
 * Bring any stored record up to the current schema. Only schemaVersion 1 exists today, so migration
 * is "normalise via validateSettings": recognised fields survive, unknown fields are dropped, and the
 * version is stamped to the build's version. Future versions add explicit step-ups above this call.
 */
export function migrateSettings(input: unknown): SettingsRecord {
  return validateSettings(input);
}
