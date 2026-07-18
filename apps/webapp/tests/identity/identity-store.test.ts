import { exportPublicKey, generateIdentity, wrapPrivateKey } from "@aesmsg/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { __deleteDbForTests, IDENTITY_STORE } from "@/src/identity/db";
import {
  deleteIdentity,
  hasIdentity,
  loadIdentity,
  type StoredIdentity,
  saveIdentity,
} from "@/src/identity/identity-store";

const PASSPHRASE = "correct horse battery staple";
const DB_NAME = "aesmsg-webapp";

function storageKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/** Sweep every client-side storage surface reachable from this origin (see identity-context test). */
async function sweepStorage() {
  const dbs = await indexedDB.databases();
  const dbNames = dbs
    .map((d) => d.name)
    .filter((n): n is string => typeof n === "string")
    .sort();

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const storeNames = Array.from(db.objectStoreNames).sort();
  const records = await new Promise<unknown[]>((resolve, reject) => {
    const req = db.transaction(IDENTITY_STORE, "readonly").objectStore(IDENTITY_STORE).getAll();
    req.onsuccess = () => resolve(req.result as unknown[]);
    req.onerror = () => reject(req.error);
  });
  db.close();

  return {
    dbNames,
    storeNames,
    records,
    localStorageKeys: storageKeys(localStorage),
    sessionStorageKeys: storageKeys(sessionStorage),
  };
}

async function makeStored(): Promise<StoredIdentity> {
  const id = await generateIdentity();
  const wrapped = await wrapPrivateKey(id, PASSPHRASE);
  return {
    id: "primary",
    publicKeyString: exportPublicKey(id),
    wrapped,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  };
}

describe("identity-store", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
  });

  it("saves then loads an equal record", async () => {
    const record = await makeStored();
    await saveIdentity(record);
    const loaded = await loadIdentity("primary");
    expect(loaded).toEqual(record);
  });

  it("returns null when no identity is stored", async () => {
    expect(await loadIdentity("primary")).toBeNull();
  });

  it("hasIdentity flips false → true after a save", async () => {
    expect(await hasIdentity("primary")).toBe(false);
    await saveIdentity(await makeStored());
    expect(await hasIdentity("primary")).toBe(true);
  });

  it("save-twice replaces (single primary identity)", async () => {
    const first = await makeStored();
    await saveIdentity(first);
    const second = await makeStored();
    await saveIdentity(second);
    const loaded = await loadIdentity("primary");
    expect(loaded?.wrapped).toBe(second.wrapped);
    expect(loaded?.wrapped).not.toBe(first.wrapped);
  });

  it("delete removes the record", async () => {
    await saveIdentity(await makeStored());
    await deleteIdentity("primary");
    expect(await hasIdentity("primary")).toBe(false);
    expect(await loadIdentity("primary")).toBeNull();
  });

  it("persists ONLY the wrapped envelope — never the raw private key", async () => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, PASSPHRASE);
    await saveIdentity({
      id: "primary",
      publicKeyString: exportPublicKey(id),
      wrapped,
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    });

    // Sweep ALL storage — the only persisted state anywhere is the single identity record in our
    // one IndexedDB store; Web Storage must be untouched.
    const sweep = await sweepStorage();
    expect(sweep.dbNames).toEqual([DB_NAME]);
    expect(sweep.storeNames).toEqual([IDENTITY_STORE]);
    expect(sweep.records).toHaveLength(1);
    expect(sweep.localStorageKeys).toEqual([]);
    expect(sweep.sessionStorageKeys).toEqual([]);

    // The record's only fields are the declared metadata + the wrapped envelope — an exact key
    // set, which is an assertion that can actually fail if a key-bearing field ever creeps in.
    const raw = sweep.records[0] as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(
      ["createdAt", "id", "publicKeyString", "schemaVersion", "wrapped"].sort(),
    );

    // The only key-bearing field is `wrapped`, and it is the versioned Argon2id/AES-256-GCM
    // envelope; the raw private key lives solely inside its ciphertext.
    const env = JSON.parse(raw.wrapped as string);
    expect(env.v).toBe(1);
    expect(env.kdf).toBe("argon2id-aes256gcm");
  });
});
