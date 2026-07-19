import type { Fingerprint } from "@aesmsg/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { __deleteDbForTests, __resetDbForTests, IDENTITY_STORE } from "@/src/identity/db";
import {
  __deleteSentLinksStoreForTests,
  deleteSentLink,
  getSentLink,
  listSentLinks,
  recordSentLink,
  type SentLinkRecord,
} from "@/src/links/sent-links-store";

const FP = "AM-1111-2222-3333-4444-5555-6666-7777-8888" as Fingerprint;

function makeRecord(overrides: Partial<Omit<SentLinkRecord, "schemaVersion">> = {}) {
  return {
    id: "AAAAAAAAAAAAAAAA",
    recipientFingerprint: FP,
    createdAt: "2026-07-18T10:00:00.000Z",
    expiresAt: "2026-07-19T10:00:00.000Z",
    maxOpens: 1,
    label: null,
    revocationToken: "revtok",
    url: "https://aesmsg.com/l/AAAAAAAAAAAAAAAA",
    ...overrides,
  };
}

describe("sent-links store", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
  });

  it("round-trips a record through record/get", async () => {
    const record = makeRecord({ label: "Client credentials" });
    await recordSentLink(record);
    const loaded = await getSentLink(record.id);
    expect(loaded).toEqual({ ...record, schemaVersion: 1 });
  });

  it("lists records newest-first by createdAt", async () => {
    await recordSentLink(
      makeRecord({ id: "0000000000000001", createdAt: "2026-07-10T00:00:00.000Z" }),
    );
    await recordSentLink(
      makeRecord({ id: "0000000000000002", createdAt: "2026-07-12T00:00:00.000Z" }),
    );
    await recordSentLink(
      makeRecord({ id: "0000000000000003", createdAt: "2026-07-11T00:00:00.000Z" }),
    );
    const ids = (await listSentLinks()).map((r) => r.id);
    expect(ids).toEqual(["0000000000000002", "0000000000000003", "0000000000000001"]);
  });

  it("upserts by id (record replaces)", async () => {
    await recordSentLink(makeRecord({ label: "first" }));
    await recordSentLink(makeRecord({ label: "second" }));
    expect(await listSentLinks()).toHaveLength(1);
    expect((await getSentLink("AAAAAAAAAAAAAAAA"))?.label).toBe("second");
  });

  it("deletes a record and returns null for a missing one", async () => {
    await recordSentLink(makeRecord());
    await deleteSentLink("AAAAAAAAAAAAAAAA");
    expect(await getSentLink("AAAAAAAAAAAAAAAA")).toBeNull();
    expect(await getSentLink("does-not-exist")).toBeNull();
    // Deleting a missing id is a no-op.
    await expect(deleteSentLink("does-not-exist")).resolves.toBeUndefined();
  });

  it("persists no plaintext/ciphertext keys — only the D7 metadata fields", async () => {
    await recordSentLink(makeRecord({ label: "the label" }));
    const loaded = await getSentLink("AAAAAAAAAAAAAAAA");
    const str = JSON.stringify(loaded);
    expect(str).not.toContain('"text"');
    expect(str).not.toContain('"plaintext"');
    expect(str).not.toContain('"ciphertext"');
    expect(str).not.toContain('"message"');
    expect(str).not.toContain('"recipientPublicKey"');
    expect(Object.keys(loaded ?? {}).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "label",
      "maxOpens",
      "recipientFingerprint",
      "revocationToken",
      "schemaVersion",
      "url",
    ]);
  });

  it("migrates a v1 DB to v2: the identity row survives and sent-links round-trips", async () => {
    // Simulate the SP1 world: a v1 DB with only the identity store + one identity row.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("aesmsg-webapp", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(IDENTITY_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDENTITY_STORE, "readwrite");
        tx.objectStore(IDENTITY_STORE).put({ id: "primary", publicKeyString: "amk1:seed" });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    // Drop the cached handle so the app re-opens at v2, triggering the additive onupgradeneeded.
    __resetDbForTests();

    // The new sent-links store now exists and round-trips.
    await recordSentLink(makeRecord({ id: "0000000000000009" }));
    expect((await getSentLink("0000000000000009"))?.id).toBe("0000000000000009");

    // And the pre-existing identity row was preserved across the v1→v2 upgrade.
    const survived = await new Promise<{ id: string; publicKeyString: string } | undefined>(
      (resolve, reject) => {
        const req = indexedDB.open("aesmsg-webapp");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(IDENTITY_STORE, "readonly");
          const getReq = tx.objectStore(IDENTITY_STORE).get("primary");
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result);
          };
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      },
    );
    expect(survived?.publicKeyString).toBe("amk1:seed");

    await __deleteSentLinksStoreForTests();
  });
});
