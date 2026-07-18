import {
  migrateSettings,
  SETTINGS_DEFAULTS,
  type SettingsRecord,
} from "@/src/settings/settings-format";
import { DecryptionError, getEncryptedStore } from "@/src/storage";

// Persistence for the on-device preferences blob, layered over the single shared EncryptedStore
// (Phase 1). Domains are separated by key only — settings live under "settings". Every read is
// fail-soft: a missing OR undecryptable blob resolves to SETTINGS_DEFAULTS (never throws, never
// silently wipes), so a single corrupt byte cannot brick app startup (spec §4 + Corruption policy).

/** The canonical blob key for the settings domain inside the shared EncryptedStore. */
export const SETTINGS_BLOB_KEY = "settings" as const;

/**
 * Load the persisted settings, normalised to the current schema. Returns SETTINGS_DEFAULTS when
 * nothing is stored, the blob is undecryptable (GCM auth failure / malformed framing -> a logged,
 * non-fatal fallback), or any unexpected error occurs. Never throws.
 */
export async function loadSettings(): Promise<SettingsRecord> {
  try {
    const store = await getEncryptedStore();
    const raw = await store.getJson<unknown>(SETTINGS_BLOB_KEY);
    if (raw === null) return { ...SETTINGS_DEFAULTS };
    return migrateSettings(raw);
  } catch (err) {
    if (err instanceof DecryptionError) {
      console.warn("[settings] undecryptable settings blob; falling back to defaults");
    } else {
      console.warn("[settings] failed to load settings; falling back to defaults", err);
    }
    return { ...SETTINGS_DEFAULTS };
  }
}

/**
 * Persist a settings record. Stamps updatedAt to now and sets createdAt on first write (when 0).
 * The value is validated/migrated before write so a caller can never persist a malformed record.
 */
export async function saveSettings(next: SettingsRecord): Promise<void> {
  const now = Date.now();
  const normalised = migrateSettings(next);
  const toStore: SettingsRecord = {
    ...normalised,
    createdAt: normalised.createdAt > 0 ? normalised.createdAt : now,
    updatedAt: now,
  };
  const store = await getEncryptedStore();
  await store.setJson(SETTINGS_BLOB_KEY, toStore);
}

/** Remove the persisted settings blob (used by the wipe flow alongside the DEK + other blobs). */
export async function deleteSettings(): Promise<void> {
  const store = await getEncryptedStore();
  await store.remove(SETTINGS_BLOB_KEY);
}

/** True when a settings blob has been written (distinguishes first-run defaults from a saved record). */
export async function hasSavedSettings(): Promise<boolean> {
  try {
    const store = await getEncryptedStore();
    const raw = await store.getJson<unknown>(SETTINGS_BLOB_KEY);
    return raw !== null;
  } catch {
    // An undecryptable blob still means something was written — but it's unusable; treat as unsaved
    // so the provider seeds defaults rather than reporting a phantom saved state.
    return false;
  }
}
