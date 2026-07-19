import { exportPublicKey, generateIdentity, type PublicKeyString } from "@aesmsg/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { __deleteDbForTests, RETIRED_STORE, withStore } from "@/src/identity/db";
import type { RetiredKeyEntry } from "@/src/identity/identity-bundle";
import {
  clearRetiredEntries,
  loadRetiredEntries,
  saveRetiredEntries,
} from "@/src/identity/retired-keys-store";

function entry(pk: PublicKeyString, retiredAtMs: number): RetiredKeyEntry {
  return {
    wrapped: `{"v":1,"pub":"${pk}"}` as RetiredKeyEntry["wrapped"],
    publicKeyString: pk,
    fingerprint: `AM-${pk.slice(-6)}`,
    retiredAtMs,
  };
}

describe("retired-keys-store", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
  });

  it("returns [] when nothing has been saved", async () => {
    expect(await loadRetiredEntries()).toEqual([]);
  });

  it("round-trips a saved list newest-first", async () => {
    const pkA = exportPublicKey(await generateIdentity());
    const pkB = exportPublicKey(await generateIdentity());
    const list = [entry(pkA, 2), entry(pkB, 1)];
    await saveRetiredEntries(list);
    expect(await loadRetiredEntries()).toEqual(list);
  });

  it("fail-soft: a corrupt blob (entries not an array) loads as []", async () => {
    // Write a garbage record directly under the primary key.
    await withStore<IDBValidKey>(RETIRED_STORE, "readwrite", (store) =>
      store.put({ id: "primary", entries: "not-an-array", schemaVersion: 1 }),
    );
    expect(await loadRetiredEntries()).toEqual([]);
  });

  it("fail-soft: individual malformed entries are dropped on load", async () => {
    const pk = exportPublicKey(await generateIdentity());
    await withStore<IDBValidKey>(RETIRED_STORE, "readwrite", (store) =>
      store.put({ id: "primary", entries: [entry(pk, 1), { bogus: true }], schemaVersion: 1 }),
    );
    const loaded = await loadRetiredEntries();
    expect(loaded.map((e) => e.publicKeyString)).toEqual([pk]);
  });

  it("clearRetiredEntries empties the store", async () => {
    const pk = exportPublicKey(await generateIdentity());
    await saveRetiredEntries([entry(pk, 1)]);
    await clearRetiredEntries();
    expect(await loadRetiredEntries()).toEqual([]);
  });
});
