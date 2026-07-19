// Minimal typed IndexedDB access for the web identity store. A tiny in-app equivalent of the
// old `@aesmsg/key-store` `db.ts` (deleted with the browser MVP). It reads/writes an opaque
// wrapped-key envelope and public metadata only — it NEVER unwraps and never sees a raw private
// key. Memory lifetime of any unwrapped key is the identity context's concern (Task 7).

const DB_NAME = "aesmsg-webapp";
// v2 adds the sent-links store; v3 adds the contacts store (SP4); v4 adds the retired-keys store
// (the multi-key-identity backing for rotation) and the settings store (on-device prefs, no key
// material). Every store creation is additive + contains-guarded, so a v1→v2→v3→v4 bump preserves
// every existing row (identity + sent-links + contacts) and only creates the new store(s).
const DB_VERSION = 4;
export const IDENTITY_STORE = "identity";
export const SENT_LINKS_STORE = "sent-links";
export const CONTACTS_STORE = "contacts";
export const RETIRED_STORE = "retired-keys";
export const SETTINGS_STORE = "settings";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error(
        "IndexedDB is unavailable in this environment; identity storage requires a browser",
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Every creation is `contains`-guarded and additive, so this runs for a fresh install AND any
      // v1→v2→v3→v4 upgrade without touching (or dropping) an existing identity, sent-links, or
      // contacts row.
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SENT_LINKS_STORE)) {
        db.createObjectStore(SENT_LINKS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CONTACTS_STORE)) {
        db.createObjectStore(CONTACTS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(RETIRED_STORE)) {
        db.createObjectStore(RETIRED_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function getDB(): Promise<IDBDatabase> {
  if (dbPromise === null) {
    // Clear the cache if the open fails so a later call re-attempts rather than replaying a
    // permanently-rejected promise (e.g. a transient private-mode / quota error at first touch).
    dbPromise = openDB().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/**
 * Run `fn` against the named object store inside a single transaction and resolve with its return
 * value once the transaction commits. `mode` is the IndexedDB transaction mode
 * ("readonly" | "readwrite"). This is the general form; `withDB` binds it to the identity store.
 */
export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T> | T,
): Promise<T> {
  const db = await getDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result: T;
    let settled = false;

    Promise.resolve(fn(store))
      .then((value) => {
        if (value instanceof IDBRequest) {
          value.onsuccess = () => {
            result = value.result as T;
          };
          value.onerror = () => {
            settled = true;
            reject(value.error ?? new Error("IndexedDB request failed"));
          };
        } else {
          result = value;
        }
      })
      .catch((err) => {
        settled = true;
        reject(err);
        tx.abort();
      });

    tx.oncomplete = () => {
      if (!settled) resolve(result);
    };
    tx.onerror = () => {
      if (!settled) reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };
    tx.onabort = () => {
      if (!settled) reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    };
  });
}

/**
 * Run `fn` against SEVERAL object stores inside ONE transaction and resolve once it commits. Used by
 * key rotation (Task 4): a single `readwrite` transaction over `[IDENTITY_STORE, RETIRED_STORE]` that
 * `put`s the new active identity AND the prepended retired blob together. IndexedDB commits a
 * multi-store transaction all-or-nothing, so the rotation is "fully rotated OR unchanged, never
 * bricked" — subsuming mobile's two-phase retired-first write ordering by transaction atomicity.
 * `fn` issues its writes synchronously (fire-and-forget requests); the returned promise settles on
 * the transaction's commit/abort, not on the individual requests.
 */
export async function withStores<T>(
  storeNames: readonly string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>) => T,
): Promise<T> {
  const db = await getDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeNames as string[], mode);
    const stores: Record<string, IDBObjectStore> = {};
    for (const name of storeNames) stores[name] = tx.objectStore(name);
    let result: T;
    let settled = false;

    try {
      result = fn(stores);
    } catch (err) {
      settled = true;
      reject(err);
      tx.abort();
      return;
    }

    tx.oncomplete = () => {
      if (!settled) resolve(result);
    };
    tx.onerror = () => {
      if (!settled) reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };
    tx.onabort = () => {
      if (!settled) reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    };
  });
}

/**
 * Run `fn` against the `identity` object store. Thin wrapper over `withStore` so `identity-store.ts`
 * (and its tests) need no change after the v2 generalization.
 */
export function withDB<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T> | T,
): Promise<T> {
  return withStore(IDENTITY_STORE, mode, fn);
}

/** Test helper: close and delete the whole database, resetting the lazy handle. */
export function __deleteDbForTests(): Promise<void> {
  const finish = () => {
    dbPromise = null;
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("Failed to delete IndexedDB"));
      req.onblocked = () => resolve();
    });
  };
  if (dbPromise === null) return finish();
  return dbPromise.then((db) => {
    db.close();
    return finish();
  });
}

/** Test helper: drop the cached connection so the next call re-opens (simulates a fresh load). */
export function __resetDbForTests(): void {
  if (dbPromise !== null) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}
