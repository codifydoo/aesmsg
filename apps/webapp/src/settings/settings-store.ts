import { SETTINGS_STORE, withStore } from "@/src/identity/db";
import { migrateSettings, SETTINGS_DEFAULTS, type SettingsRecord } from "./settings-format";

// Persistence for the on-device preferences blob, over the `settings` IndexedDB object store (DB v4).
// A SINGLE record keyed `id:"primary"` holds the whole SettingsRecord — NO key material (asserted in
// the test). Every read is FAIL-SOFT: a missing OR malformed blob resolves to SETTINGS_DEFAULTS (never
// throws, never silently wipes), so a single corrupt byte cannot brick app startup (spec §4).
//
// Mirrors apps/mobile/src/settings/settings-store.ts, swapping the mobile EncryptedStore blob for the
// unencrypted IndexedDB store. AT-REST NOTE (like the sent-links + contacts stores): a settings record
// is prefs-only, carries no secret, and never reaches the server — so an unencrypted blob here is not
// a confidentiality concern.

const PRIMARY = "primary" as const;

interface StoredSettings extends SettingsRecord {
  readonly id: typeof PRIMARY;
}

/**
 * Load the persisted settings, normalised to the current schema. Returns SETTINGS_DEFAULTS when
 * nothing is stored, the blob is malformed, or IndexedDB is unreachable. Never throws.
 */
export async function loadSettings(): Promise<SettingsRecord> {
  try {
    const record = await withStore<StoredSettings | undefined>(
      SETTINGS_STORE,
      "readonly",
      (store) => store.get(PRIMARY),
    );
    if (record === undefined) return { ...SETTINGS_DEFAULTS };
    return migrateSettings(record);
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

/**
 * Persist a settings record. Stamps updatedAt to now and sets createdAt on first write (when 0). The
 * value is validated/migrated before write so a caller can never persist a malformed record.
 */
export async function saveSettings(next: SettingsRecord): Promise<void> {
  const now = Date.now();
  const normalised = migrateSettings(next);
  const toStore: StoredSettings = {
    ...normalised,
    createdAt: normalised.createdAt > 0 ? normalised.createdAt : now,
    updatedAt: now,
    id: PRIMARY,
  };
  await withStore<IDBValidKey>(SETTINGS_STORE, "readwrite", (store) => store.put(toStore));
}

/** Remove the persisted settings blob (part of the local wipe alongside the identity + other stores). */
export async function clearSettings(): Promise<void> {
  await withStore<undefined>(SETTINGS_STORE, "readwrite", (store) => store.clear());
}
