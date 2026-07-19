import { RETIRED_STORE, withStore } from "./db";
import { type RetiredKeyEntry, sanitizeRetiredEntries } from "./identity-bundle";

// Persistence for the retired-keys blob (the multi-key-identity backing for rotation, DB v4). A
// SINGLE record keyed `id:"primary"` holds the whole ordered list, so a rotation can write it as one
// atomic `put` alongside the active-identity `put` (see identity-context.rotate + db.withStores). The
// record carries only PUBLIC metadata + each retired private key WRAPPED under the login passphrase —
// never a raw private key. Reads are fail-soft: a missing or corrupt blob yields `[]` (mirroring
// `parseRetiredKeys`), because a broken retired blob must never be able to brick unlock.

const PRIMARY = "primary" as const;
const RETIRED_SCHEMA_VERSION = 1;

interface RetiredKeysRecord {
  readonly id: typeof PRIMARY;
  readonly entries: RetiredKeyEntry[];
  readonly schemaVersion: typeof RETIRED_SCHEMA_VERSION;
}

/** Load the retained retired keys (newest→oldest). Returns [] on none / a corrupt blob (never throws). */
export async function loadRetiredEntries(): Promise<RetiredKeyEntry[]> {
  try {
    const record = await withStore<RetiredKeysRecord | undefined>(
      RETIRED_STORE,
      "readonly",
      (store) => store.get(PRIMARY),
    );
    return sanitizeRetiredEntries(record?.entries);
  } catch {
    // IndexedDB unreachable (private mode / quota) — degrade to "no retired keys" rather than
    // failing the unlock. The active key still opens all post-rotation links.
    return [];
  }
}

/** Persist the retired-keys list as the single `id:"primary"` blob (deduped, newest-first). */
export async function saveRetiredEntries(entries: readonly RetiredKeyEntry[]): Promise<void> {
  const record: RetiredKeysRecord = {
    id: PRIMARY,
    entries: [...entries],
    schemaVersion: RETIRED_SCHEMA_VERSION,
  };
  await withStore<IDBValidKey>(RETIRED_STORE, "readwrite", (store) => store.put(record));
}

/** Purge the retired-keys blob (part of identity wipe — required for irreversibility). */
export async function clearRetiredEntries(): Promise<void> {
  await withStore<undefined>(RETIRED_STORE, "readwrite", (store) => store.clear());
}
