import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __deleteDbForTests, SETTINGS_STORE, withStore } from "@/src/identity/db";
import { SETTINGS_DEFAULTS } from "@/src/settings/settings-format";
import { clearSettings, loadSettings, saveSettings } from "@/src/settings/settings-store";

describe("settings-store", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
  });
  afterEach(async () => {
    await __deleteDbForTests();
  });

  it("returns SETTINGS_DEFAULTS when nothing is stored", async () => {
    expect(await loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });

  it("round-trips a saved record and stamps createdAt/updatedAt", async () => {
    const before = Date.now();
    await saveSettings({
      ...SETTINGS_DEFAULTS,
      clipboardClearSeconds: 30,
      appLockTimeout: "5m",
    });
    const loaded = await loadSettings();
    expect(loaded.clipboardClearSeconds).toBe(30);
    expect(loaded.appLockTimeout).toBe("5m");
    expect(loaded.createdAt).toBeGreaterThanOrEqual(before);
    expect(loaded.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("preserves createdAt across a second write, advances updatedAt", async () => {
    await saveSettings({ ...SETTINGS_DEFAULTS, clipboardClearSeconds: 20 });
    const first = await loadSettings();
    await new Promise((r) => setTimeout(r, 2));
    await saveSettings({ ...first, clipboardClearSeconds: 80 });
    const second = await loadSettings();
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    expect(second.clipboardClearSeconds).toBe(80);
  });

  it("falls back to defaults on a corrupt stored blob (never throws)", async () => {
    // Write a garbage record directly under the primary key.
    await withStore<IDBValidKey>(SETTINGS_STORE, "readwrite", (store) =>
      store.put({ id: "primary", clipboardClearSeconds: "not-a-number", appLockTimeout: 5 }),
    );
    const loaded = await loadSettings();
    expect(loaded.clipboardClearSeconds).toBe(SETTINGS_DEFAULTS.clipboardClearSeconds);
    expect(loaded.appLockTimeout).toBe("never");
  });

  it("clearSettings empties the store", async () => {
    await saveSettings({ ...SETTINGS_DEFAULTS, clipboardClearSeconds: 60 });
    await clearSettings();
    expect(await loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });

  it("INVARIANT: the persisted blob holds NO key material", async () => {
    await saveSettings({ ...SETTINGS_DEFAULTS, clipboardClearSeconds: 55, appLockTimeout: "1h" });
    const raw = await withStore<Record<string, unknown> | undefined>(
      SETTINGS_STORE,
      "readonly",
      (store) => store.get("primary"),
    );
    if (!raw) throw new Error("no settings record");
    const keys = Object.keys(raw).sort();
    expect(keys).toEqual([
      "appLockTimeout",
      "clipboardClearSeconds",
      "createdAt",
      "id",
      "schemaVersion",
      "updatedAt",
    ]);
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain("wrapped");
    expect(serialized).not.toContain("privateKey");
    expect(serialized).not.toMatch(/"ct"/);
  });
});
