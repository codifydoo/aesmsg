import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirror tests/secure-store.test.ts: expo-secure-store cannot load under node, so back it with a
// hoisted Map and a Symbol sentinel for the accessibility class (identity equality lets us assert
// the exact constant is re-exported and forwarded).
const { kv, WHEN_UNLOCKED_THIS_DEVICE_ONLY } = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  setItemAsync: vi.fn(async (key: string, value: string) => {
    kv.set(key, value);
  }),
  getItemAsync: vi.fn(async (key: string) => (kv.has(key) ? kv.get(key) : null)),
  deleteItemAsync: vi.fn(async (key: string) => {
    kv.delete(key);
  }),
}));

describe("secure-store-impl", () => {
  beforeEach(() => {
    kv.clear();
    vi.clearAllMocks();
  });

  it("re-exports the WHEN_UNLOCKED_THIS_DEVICE_ONLY accessibility constant", async () => {
    const mod = await import("@/src/storage/secure-store-impl");
    expect(mod.WHEN_UNLOCKED_THIS_DEVICE_ONLY).toBe(WHEN_UNLOCKED_THIS_DEVICE_ONLY);
  });

  it("forwards set/get/delete to expo-secure-store and round-trips a value", async () => {
    const SecureStore = await import("expo-secure-store");
    const { secureStore } = await import("@/src/storage/secure-store-impl");

    await secureStore.setItemAsync("aesmsg.data-key", "VALUE", {
      keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("aesmsg.data-key", "VALUE", {
      keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(await secureStore.getItemAsync("aesmsg.data-key")).toBe("VALUE");

    await secureStore.deleteItemAsync("aesmsg.data-key");
    expect(await secureStore.getItemAsync("aesmsg.data-key")).toBeNull();
  });
});
