import {
  exportPublicKey,
  type Fingerprint,
  generateIdentity,
  type PublicKeyString,
  type WrappedKey,
} from "@aesmsg/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addContact, clearContacts, listContacts } from "@/src/contacts/contacts-store";
import { __deleteDbForTests, IDENTITY_STORE, withStore } from "@/src/identity/db";
import { hasIdentity } from "@/src/identity/identity-store";
import { loadRetiredEntries, saveRetiredEntries } from "@/src/identity/retired-keys-store";
import { clearSentLinks, listSentLinks, recordSentLink } from "@/src/links/sent-links-store";
import { SETTINGS_DEFAULTS } from "@/src/settings/settings-format";
import { loadSettings, saveSettings } from "@/src/settings/settings-store";
import {
  isAlreadyGoneRevokeError,
  revokeAllThenWipe,
  selectLiveTrackedLinks,
  wipeAllLocalStores,
} from "@/src/settings/wipe-local";

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("selectLiveTrackedLinks", () => {
  it("keeps only links whose expiry is strictly in the future", () => {
    const live = selectLiveTrackedLinks(
      [
        { id: "a", label: "alive", expiresAt: FUTURE },
        { id: "b", label: "dead", expiresAt: PAST },
      ],
      Date.now(),
    );
    expect(live.map((l) => l.id)).toEqual(["a"]);
  });
});

describe("isAlreadyGoneRevokeError", () => {
  it("treats 404/410 as already-gone (success)", () => {
    expect(isAlreadyGoneRevokeError({ status: 404 })).toBe(true);
    expect(isAlreadyGoneRevokeError({ status: 410 })).toBe(true);
    expect(isAlreadyGoneRevokeError({ status: 500 })).toBe(false);
    expect(isAlreadyGoneRevokeError(new Error("offline"))).toBe(false);
  });
});

describe("revokeAllThenWipe (pure orchestration)", () => {
  it("empty link list → wipes without asking for acknowledgement", async () => {
    const wipe = vi.fn(async () => {});
    const confirm = vi.fn(async () => true);
    const result = await revokeAllThenWipe({
      listLinksToRevoke: async () => [],
      revoke: vi.fn(async () => {}),
      confirmProceedDespiteFailures: confirm,
      wipe,
    });
    expect(result.wiped).toBe(true);
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("all revokes succeed (incl. 404 already-gone) → wipe proceeds, no acknowledgement", async () => {
    const wipe = vi.fn(async () => {});
    const confirm = vi.fn(async () => true);
    const revoke = vi.fn(async (id: string) => {
      if (id === "gone") throw { status: 404 };
    });
    const result = await revokeAllThenWipe({
      listLinksToRevoke: async () => [
        { id: "ok", label: null },
        { id: "gone", label: null },
      ],
      revoke,
      confirmProceedDespiteFailures: confirm,
      wipe,
    });
    expect(result.revokedCount).toBe(2);
    expect(result.failures).toHaveLength(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it("a genuine failure → asks acknowledgement; declining ABORTS the wipe (identity intact)", async () => {
    const wipe = vi.fn(async () => {});
    const confirm = vi.fn(async () => false); // user declines
    const result = await revokeAllThenWipe({
      listLinksToRevoke: async () => [{ id: "x", label: "Prod key" }],
      revoke: async () => {
        throw { status: 500 };
      },
      confirmProceedDespiteFailures: confirm,
      wipe,
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(result.wiped).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(wipe).not.toHaveBeenCalled();
  });

  it("a genuine failure → acknowledging wipes anyway", async () => {
    const wipe = vi.fn(async () => {});
    const result = await revokeAllThenWipe({
      listLinksToRevoke: async () => [{ id: "x", label: "Prod key" }],
      revoke: async () => {
        throw new Error("offline");
      },
      confirmProceedDespiteFailures: async () => true,
      wipe,
    });
    expect(result.wiped).toBe(true);
    expect(wipe).toHaveBeenCalledTimes(1);
  });
});

describe("wipeAllLocalStores + full integration", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
  });
  afterEach(async () => {
    await __deleteDbForTests();
  });

  async function seedEverything() {
    // Identity row (a minimal record — wipeAllLocalStores deletes it by key).
    await withStore<IDBValidKey>(IDENTITY_STORE, "readwrite", (store) =>
      store.put({
        id: "primary",
        publicKeyString: "amk1:seed",
        wrapped: "{}" as WrappedKey,
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
      }),
    );
    await saveRetiredEntries([
      {
        wrapped: "{}" as WrappedKey,
        publicKeyString: "amk1:old" as PublicKeyString,
        fingerprint: "AM-1",
        retiredAtMs: 1,
      },
    ]);
    await saveSettings({ ...SETTINGS_DEFAULTS, clipboardClearSeconds: 30 });
    await recordSentLink({
      id: "L1",
      recipientFingerprint: "AM-x" as Fingerprint,
      createdAt: new Date().toISOString(),
      expiresAt: FUTURE,
      maxOpens: 1,
      label: "one",
      revocationToken: "tok-1",
      url: "https://aesmsg.com/l/L1",
    });
    await addContact({ label: "Ada", publicKey: exportPublicKey(await generateIdentity()) });
  }

  it("clears EVERY local store", async () => {
    await seedEverything();
    // Precondition: everything seeded.
    expect(await hasIdentity("primary")).toBe(true);
    expect((await loadRetiredEntries()).length).toBe(1);
    expect((await listSentLinks()).length).toBe(1);
    expect((await listContacts()).length).toBe(1);

    await wipeAllLocalStores();

    expect(await hasIdentity("primary")).toBe(false);
    expect(await loadRetiredEntries()).toEqual([]);
    expect(await loadSettings()).toEqual(SETTINGS_DEFAULTS);
    expect(await listSentLinks()).toEqual([]);
    expect(await listContacts()).toEqual([]);
  });

  it("revoke-before-wipe: all live links revoked, then every store cleared", async () => {
    await seedEverything();
    const revoke = vi.fn(async () => {});
    const result = await revokeAllThenWipe({
      listLinksToRevoke: async () => selectLiveTrackedLinks(await listSentLinks(), Date.now()),
      revoke,
      confirmProceedDespiteFailures: async () => true,
      wipe: wipeAllLocalStores,
    });
    expect(result.wiped).toBe(true);
    expect(revoke).toHaveBeenCalledWith("L1");
    expect(await hasIdentity("primary")).toBe(false);
    expect(await loadRetiredEntries()).toEqual([]);
    expect(await listSentLinks()).toEqual([]);
    expect(await listContacts()).toEqual([]);

    // Cleanup the contacts store handle explicitly (belt-and-braces for the shared DB).
    await clearContacts();
    await clearSentLinks();
  });
});
