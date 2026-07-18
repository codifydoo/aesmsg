import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_DEFAULTS, type SettingsRecord } from "@/src/settings/settings-format";
import {
  deleteSettings,
  hasSavedSettings,
  loadSettings,
  SETTINGS_BLOB_KEY,
  saveSettings,
} from "@/src/settings/settings-store";

// The settings store layers persistence over the single EncryptedStore (Phase 1). It cannot load
// expo-file-system / expo-secure-store under Node, so we mock @/src/storage with a fake EncryptedStore
// backed by an in-memory map — same vi.hoisted pattern as secure-store.test.ts. The store under test
// only ever touches getJson/setJson/remove for the "settings" key, plus the DecryptionError type.

const { blob, FakeDecryptionError } = vi.hoisted(() => {
  class FakeDecryptionError extends Error {
    constructor(message = "decrypt failed") {
      super(message);
      this.name = "DecryptionError";
    }
  }
  return {
    // value held under the "settings" key. `undefined` => never written; a thrown sentinel => corrupt.
    blob: { current: undefined as unknown },
    FakeDecryptionError,
  };
});

const CORRUPT = Symbol("corrupt-blob");

vi.mock("@/src/storage", () => {
  class DecryptionError extends FakeDecryptionError {}
  const store = {
    getJson: vi.fn(async (key: string) => {
      if (key !== "settings") return null;
      if (blob.current === undefined) return null;
      if (blob.current === CORRUPT) throw new DecryptionError();
      return blob.current;
    }),
    setJson: vi.fn(async (key: string, value: unknown) => {
      if (key === "settings") blob.current = value;
    }),
    remove: vi.fn(async (key: string) => {
      if (key === "settings") blob.current = undefined;
    }),
    clear: vi.fn(async () => {
      blob.current = undefined;
    }),
  };
  return {
    DecryptionError,
    getEncryptedStore: vi.fn(async () => store),
    // setup.ts calls this on every beforeEach; our in-memory store is reset via blob.current in
    // the local beforeEach, so this is a no-op here.
    __resetEncryptedStoreForTests: vi.fn(() => {}),
  };
});

describe("settings-store", () => {
  beforeEach(() => {
    blob.current = undefined;
    vi.clearAllMocks();
  });

  it("uses the canonical 'settings' blob key", () => {
    expect(SETTINGS_BLOB_KEY).toBe("settings");
  });

  it("loadSettings returns SETTINGS_DEFAULTS when nothing has been saved", async () => {
    expect(await loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });

  it("hasSavedSettings is false before a save and true after", async () => {
    expect(await hasSavedSettings()).toBe(false);
    await saveSettings({ ...SETTINGS_DEFAULTS, biometric: false });
    expect(await hasSavedSettings()).toBe(true);
  });

  it("save -> load round-trips the record (stamping updatedAt/createdAt)", async () => {
    const before: SettingsRecord = {
      ...SETTINGS_DEFAULTS,
      biometric: false,
      clipboardClearSeconds: 30,
      appLockTimeout: "5m",
    };
    await saveSettings(before);
    const loaded = await loadSettings();
    expect(loaded.biometric).toBe(false);
    expect(loaded.clipboardClearSeconds).toBe(30);
    expect(loaded.appLockTimeout).toBe("5m");
    expect(loaded.schemaVersion).toBe(1);
  });

  it("saveSettings stamps updatedAt and preserves an existing createdAt", async () => {
    await saveSettings({ ...SETTINGS_DEFAULTS, createdAt: 1000, updatedAt: 1000 });
    const loaded = await loadSettings();
    expect(loaded.createdAt).toBe(1000); // preserved
    expect(loaded.updatedAt).toBeGreaterThanOrEqual(1000); // re-stamped to now
  });

  it("saveSettings sets createdAt on first write when it is 0", async () => {
    await saveSettings({ ...SETTINGS_DEFAULTS, createdAt: 0, updatedAt: 0 });
    const loaded = await loadSettings();
    expect(loaded.createdAt).toBeGreaterThan(0);
  });

  it("loadSettings falls back to defaults on a corrupt (undecryptable) blob — never throws", async () => {
    blob.current = CORRUPT;
    await expect(loadSettings()).resolves.toEqual(SETTINGS_DEFAULTS);
  });

  it("loadSettings migrates a stale/partial stored record to a complete one", async () => {
    blob.current = { biometric: false, clipboardClearSeconds: 999, appLockTimeout: "5m" };
    const loaded = await loadSettings();
    expect(loaded.biometric).toBe(false); // preserved
    expect(loaded.clipboardClearSeconds).toBe(SETTINGS_DEFAULTS.clipboardClearSeconds); // clamped out
    expect(loaded.appLockTimeout).toBe("5m"); // valid union value preserved
  });

  it("deleteSettings clears the blob (load returns defaults, hasSaved false)", async () => {
    await saveSettings({ ...SETTINGS_DEFAULTS, biometric: false });
    await deleteSettings();
    expect(await hasSavedSettings()).toBe(false);
    expect(await loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });
});
