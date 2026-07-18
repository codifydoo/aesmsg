import { beforeEach, describe, expect, it } from "vitest";
import { __deleteDbForTests, IDENTITY_STORE, withDB } from "@/src/identity/db";

interface Row {
  id: string;
  value: string;
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
});
