import { beforeEach, describe, expect, it } from "vitest";
import {
  __deleteDbForTests,
  __resetDbForTests,
  CONTACTS_STORE,
  IDENTITY_STORE,
  RETIRED_STORE,
  SENT_LINKS_STORE,
  SETTINGS_STORE,
  withDB,
  withStore,
} from "@/src/identity/db";

interface Row {
  id: string;
  value: string;
}

// Open the DB at an explicit version through the raw API (bypassing the app's lazy handle) so a test
// can seed an older-version database, then re-open through the app path to exercise the additive
// upgrade. Only stores that existed AT `version` are created, so a seed stays faithful to that era
// (contacts arrived at v3; retired-keys + settings at v4, both created only via the app path).
function openRaw(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("aesmsg-webapp", version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SENT_LINKS_STORE)) {
        db.createObjectStore(SENT_LINKS_STORE, { keyPath: "id" });
      }
      if (version >= 3 && !db.objectStoreNames.contains(CONTACTS_STORE)) {
        db.createObjectStore(CONTACTS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putRaw(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getRaw<T>(storeName: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("aesmsg-webapp");
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(storeName, "readonly");
      const getReq = tx.objectStore(storeName).get(key);
      getReq.onsuccess = () => {
        db.close();
        resolve(getReq.result as T | undefined);
      };
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe("withDB (IndexedDB access)", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
  });

  it("opens the database, creating the identity object store on upgrade", async () => {
    const names = await withDB<string[]>("readonly", (store) => [store.name]);
    expect(names).toEqual([IDENTITY_STORE]);
  });

  it("round-trips a record through put/get", async () => {
    await withDB<IDBValidKey>("readwrite", (store) => store.put({ id: "primary", value: "hi" }));
    const row = await withDB<Row | undefined>("readonly", (store) => store.get("primary"));
    expect(row).toEqual({ id: "primary", value: "hi" });
  });

  it("reports absence then presence of a key via getKey", async () => {
    const before = await withDB<IDBValidKey | undefined>("readonly", (s) => s.getKey("primary"));
    expect(before).toBeUndefined();

    await withDB<IDBValidKey>("readwrite", (store) => store.put({ id: "primary", value: "x" }));

    const after = await withDB<IDBValidKey | undefined>("readonly", (s) => s.getKey("primary"));
    expect(after).toBe("primary");
  });

  it("deletes a record so a subsequent get returns undefined", async () => {
    await withDB<IDBValidKey>("readwrite", (store) => store.put({ id: "primary", value: "x" }));
    await withDB<undefined>("readwrite", (store) => store.delete("primary"));
    const row = await withDB<Row | undefined>("readonly", (store) => store.get("primary"));
    expect(row).toBeUndefined();
  });

  it("isolates cases — __deleteDbForTests clears prior data", async () => {
    const row = await withDB<Row | undefined>("readonly", (store) => store.get("primary"));
    expect(row).toBeUndefined();
  });

  it("migrates v2→v3: identity + sent-links rows survive and the contacts store is created", async () => {
    // Seed the SP2 world: a v2 DB with an identity row and a sent-links row.
    const v2 = await openRaw(2);
    await putRaw(v2, IDENTITY_STORE, { id: "primary", publicKeyString: "amk1:seed" });
    await putRaw(v2, SENT_LINKS_STORE, { id: "link-1", label: "Client credentials" });
    v2.close();

    // Drop the cached handle so the app re-opens at v3, triggering the additive onupgradeneeded.
    __resetDbForTests();

    // The new contacts store now exists and round-trips an { id }-keyed record.
    await withStore<IDBValidKey>(CONTACTS_STORE, "readwrite", (store) =>
      store.put({ id: "c-1", label: "Alice" }),
    );
    const contact = await withStore<{ id: string; label: string } | undefined>(
      CONTACTS_STORE,
      "readonly",
      (store) => store.get("c-1"),
    );
    expect(contact).toEqual({ id: "c-1", label: "Alice" });

    // Both pre-existing rows were preserved across the v2→v3 upgrade.
    const identity = await getRaw<{ id: string; publicKeyString: string }>(
      IDENTITY_STORE,
      "primary",
    );
    expect(identity?.publicKeyString).toBe("amk1:seed");
    const link = await getRaw<{ id: string; label: string }>(SENT_LINKS_STORE, "link-1");
    expect(link?.label).toBe("Client credentials");
  });

  it("migrates v3→v4: identity + sent-links + contacts survive; retired-keys + settings are created", async () => {
    // Seed the SP4 world: a v3 DB with an identity, a sent-link, and a contact.
    const v3 = await openRaw(3);
    await putRaw(v3, IDENTITY_STORE, { id: "primary", publicKeyString: "amk1:seed" });
    await putRaw(v3, SENT_LINKS_STORE, { id: "link-1", label: "Client credentials" });
    await putRaw(v3, CONTACTS_STORE, { id: "c-1", label: "Alice" });
    v3.close();

    // Drop the cached handle so the app re-opens at v4, triggering the additive onupgradeneeded.
    __resetDbForTests();

    // The new retired-keys store now exists and round-trips an { id }-keyed record.
    await withStore<IDBValidKey>(RETIRED_STORE, "readwrite", (store) =>
      store.put({ id: "primary", entries: [], schemaVersion: 1 }),
    );
    const retired = await withStore<{ id: string; entries: unknown[] } | undefined>(
      RETIRED_STORE,
      "readonly",
      (store) => store.get("primary"),
    );
    expect(retired).toEqual({ id: "primary", entries: [], schemaVersion: 1 });

    // The new settings store now exists and round-trips an { id }-keyed record.
    await withStore<IDBValidKey>(SETTINGS_STORE, "readwrite", (store) =>
      store.put({ id: "primary", clipboardClearSeconds: 45 }),
    );
    const settings = await withStore<{ id: string; clipboardClearSeconds: number } | undefined>(
      SETTINGS_STORE,
      "readonly",
      (store) => store.get("primary"),
    );
    expect(settings).toEqual({ id: "primary", clipboardClearSeconds: 45 });

    // All three pre-existing rows were preserved across the v3→v4 upgrade.
    const identity = await getRaw<{ id: string; publicKeyString: string }>(
      IDENTITY_STORE,
      "primary",
    );
    expect(identity?.publicKeyString).toBe("amk1:seed");
    const link = await getRaw<{ id: string; label: string }>(SENT_LINKS_STORE, "link-1");
    expect(link?.label).toBe("Client credentials");
    const contact = await getRaw<{ id: string; label: string }>(CONTACTS_STORE, "c-1");
    expect(contact?.label).toBe("Alice");
  });
});
