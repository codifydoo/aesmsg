import { beforeEach, describe, expect, it, vi } from "vitest";

// expo-secure-store and expo-file-system/legacy cannot load under Node vitest. Back them with in-memory
// maps so the EncryptedStore (file-blob backend + keychain DEK) round-trips exactly like on-device.
// The maps are declared via vi.hoisted so the hoisted mock factories can reference them with no TDZ.
const { fileStore, keychain, WHEN_UNLOCKED_THIS_DEVICE_ONLY } = vi.hoisted(() => ({
  fileStore: new Map<string, string>(),
  keychain: new Map<string, string>(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  setItemAsync: vi.fn(async (k: string, v: string) => {
    keychain.set(k, v);
  }),
  getItemAsync: vi.fn(async (k: string) => (keychain.has(k) ? keychain.get(k) : null)),
  deleteItemAsync: vi.fn(async (k: string) => {
    keychain.delete(k);
  }),
}));

vi.mock("expo-file-system/legacy", () => {
  return {
    documentDirectory: "file:///tmp/",
    getInfoAsync: vi.fn(async (uri: string) => ({
      exists: uri.endsWith("/") ? true : fileStore.has(uri),
    })),
    makeDirectoryAsync: vi.fn(async () => {}),
    readAsStringAsync: vi.fn(async (uri: string) => {
      if (!fileStore.has(uri)) throw new Error("ENOENT");
      return fileStore.get(uri) as string;
    }),
    writeAsStringAsync: vi.fn(async (uri: string, contents: string) => {
      fileStore.set(uri, contents);
    }),
    deleteAsync: vi.fn(async (uri: string) => {
      fileStore.delete(uri);
    }),
    EncodingType: { UTF8: "utf8" },
  };
});

import type { Fingerprint } from "@aesmsg/crypto";
import {
  __deleteSentLinksStoreForTests,
  clearSentLinks,
  deleteSentLink,
  getSentLink,
  listSentLinks,
  recordSentLink,
  setSentLinkReminderNotificationId,
} from "@/src/links/sent-links-store";

const FP_A = "AM-AAAA-1111" as Fingerprint;
const FP_B = "AM-BBBB-2222" as Fingerprint;

describe("sent-links-store", () => {
  beforeEach(async () => {
    await __deleteSentLinksStoreForTests();
    fileStore.clear();
    keychain.clear();
    vi.clearAllMocks();
  });

  it("records a link and reads it back with schemaVersion stamped", async () => {
    await recordSentLink({
      id: "aaaaaaaaaaaaaaaa",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T10:00:00.000Z",
      expiresAt: "2026-06-01T10:00:00.000Z",
      maxOpens: 3,
      label: "Q3 board deck",
    });

    const got = await getSentLink("aaaaaaaaaaaaaaaa");
    expect(got).toEqual({
      id: "aaaaaaaaaaaaaaaa",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T10:00:00.000Z",
      expiresAt: "2026-06-01T10:00:00.000Z",
      maxOpens: 3,
      label: "Q3 board deck",
      schemaVersion: 1,
    });
  });

  it("persists and reads back the secret revocation token (stored inside the encrypted blob)", async () => {
    // BE-1 / R2: the revocation token is a secret that must survive a round-trip through the
    // encrypted-at-rest store (file backend + device-only DEK — mocked here with in-memory maps).
    await recordSentLink({
      id: "tokrecord0000000",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T10:00:00.000Z",
      expiresAt: "2026-06-01T10:00:00.000Z",
      maxOpens: 1,
      label: null,
      revocationToken: "revtok-persisted-xyz",
    });

    const got = await getSentLink("tokrecord0000000");
    expect(got?.revocationToken).toBe("revtok-persisted-xyz");
    // The token lives ONLY inside the EncryptedStore blob — the raw plaintext token must never be
    // written to the underlying file backend in the clear.
    const rawFiles = [...fileStore.values()].join("");
    expect(rawFiles).not.toContain("revtok-persisted-xyz");
  });

  it("a legacy record with no revocationToken reads back with the field absent (un-tokened)", async () => {
    await recordSentLink({
      id: "legacyrecord0000",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T10:00:00.000Z",
      expiresAt: "2026-06-01T10:00:00.000Z",
      maxOpens: 1,
      label: null,
    });
    const got = await getSentLink("legacyrecord0000");
    expect(got?.revocationToken).toBeUndefined();
  });

  it("listSentLinks returns records newest-first by createdAt", async () => {
    await recordSentLink({
      id: "older00000000000",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-30T09:00:00.000Z",
      expiresAt: "2026-06-01T09:00:00.000Z",
      maxOpens: 1,
      label: "older",
    });
    await recordSentLink({
      id: "newer00000000000",
      recipientFingerprint: FP_B,
      createdAt: "2026-05-31T09:00:00.000Z",
      expiresAt: "2026-06-02T09:00:00.000Z",
      maxOpens: 1,
      label: "newer",
    });

    const list = await listSentLinks();
    expect(list.map((r) => r.id)).toEqual(["newer00000000000", "older00000000000"]);
  });

  it("getSentLink returns null for an unknown id and listSentLinks is [] when empty", async () => {
    expect(await getSentLink("missing000000000")).toBeNull();
    expect(await listSentLinks()).toEqual([]);
  });

  it("recordSentLink upserts by id (re-recording the same id replaces, never duplicates)", async () => {
    await recordSentLink({
      id: "dupe000000000000",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T10:00:00.000Z",
      expiresAt: "2026-06-01T10:00:00.000Z",
      maxOpens: 1,
      label: "first",
    });
    await recordSentLink({
      id: "dupe000000000000",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T11:00:00.000Z",
      expiresAt: "2026-06-01T11:00:00.000Z",
      maxOpens: 5,
      label: "second",
    });

    const list = await listSentLinks();
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe("second");
    expect(list[0]?.maxOpens).toBe(5);
  });

  it("setSentLinkReminderNotificationId attaches the reminder id, preserving other fields (incl. the token)", async () => {
    // The record is written by createAndSeal first (with its secret revocation token); the scheduled
    // reminder's id is attached a moment later. The patch must leave every other field untouched so
    // the revocation token still round-trips (BE-1 / R2) and a later revoke can both authenticate AND
    // cancel the reminder.
    await recordSentLink({
      id: "reminderrec00000",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T10:00:00.000Z",
      expiresAt: "2026-06-01T10:00:00.000Z",
      maxOpens: 1,
      label: "with reminder",
      revocationToken: "revtok-keepme",
    });

    await setSentLinkReminderNotificationId("reminderrec00000", "notif-scheduled-123");

    const got = await getSentLink("reminderrec00000");
    expect(got?.reminderNotificationId).toBe("notif-scheduled-123");
    // Untouched fields survive the partial update.
    expect(got?.revocationToken).toBe("revtok-keepme");
    expect(got?.label).toBe("with reminder");
    expect(got?.maxOpens).toBe(1);
  });

  it("setSentLinkReminderNotificationId is a no-op for a missing record (never resurrects one)", async () => {
    // If the create-time record write failed (or the link was already deleted) there is nothing to
    // attach to — the patch must silently do nothing rather than create a partial ghost record.
    await setSentLinkReminderNotificationId("neverrecorded000", "notif-orphan-999");

    expect(await getSentLink("neverrecorded000")).toBeNull();
    expect(await listSentLinks()).toEqual([]);
  });

  it("clearSentLinks empties the store — listSentLinks returns [] after clear", async () => {
    await recordSentLink({
      id: "link000000000001",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T10:00:00.000Z",
      expiresAt: "2026-06-01T10:00:00.000Z",
      maxOpens: 1,
      label: "to be cleared",
    });
    await recordSentLink({
      id: "link000000000002",
      recipientFingerprint: FP_B,
      createdAt: "2026-05-31T11:00:00.000Z",
      expiresAt: "2026-06-01T11:00:00.000Z",
      maxOpens: 3,
      label: "also cleared",
    });

    // Verify there are records before clearing.
    expect(await listSentLinks()).toHaveLength(2);

    await clearSentLinks();

    expect(await listSentLinks()).toEqual([]);
  });

  it("deleteSentLink removes one record; deleting a missing id is a no-op", async () => {
    await recordSentLink({
      id: "keep000000000000",
      recipientFingerprint: FP_A,
      createdAt: "2026-05-31T10:00:00.000Z",
      expiresAt: "2026-06-01T10:00:00.000Z",
      maxOpens: 1,
      label: "keep",
    });
    await recordSentLink({
      id: "drop000000000000",
      recipientFingerprint: FP_B,
      createdAt: "2026-05-31T11:00:00.000Z",
      expiresAt: "2026-06-01T11:00:00.000Z",
      maxOpens: 1,
      label: "drop",
    });

    await deleteSentLink("drop000000000000");
    await deleteSentLink("never-existed000"); // no-op, must not throw

    const list = await listSentLinks();
    expect(list.map((r) => r.id)).toEqual(["keep000000000000"]);
  });
});
