// Minimal typed IndexedDB access for the web identity store. A tiny in-app equivalent of the
// old `@aesmsg/key-store` `db.ts` (deleted with the browser MVP). It reads/writes an opaque
// wrapped-key envelope and public metadata only — it NEVER unwraps and never sees a raw private
// key. Memory lifetime of any unwrapped key is the identity context's concern (Task 7).

const DB_NAME = "aesmsg-webapp";
const DB_VERSION = 1;
export const IDENTITY_STORE = "identity";

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
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE, { keyPath: "id" });
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
 * Run `fn` against the `identity` object store inside a single transaction and resolve with its
 * return value once the transaction commits. `mode` is the IndexedDB transaction mode
 * ("readonly" | "readwrite").
 */
export async function withDB<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T> | T,
): Promise<T> {
  const db = await getDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(IDENTITY_STORE, mode);
    const store = tx.objectStore(IDENTITY_STORE);
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
