import { beforeEach, describe, expect, it, vi } from "vitest";

// index.ts pulls in the native adapters (expo-secure-store via secure-store-impl, and
// expo-file-system/legacy), neither of which loads under node — so mock both. We only exercise the
// pure singleton-memoization + reset behavior here; the real backend wiring is verified on device.
const { kv, files } = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  files: new Map<string, string>(),
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    kv.set(k, v);
  }),
  getItemAsync: vi.fn(async (k: string) => (kv.has(k) ? kv.get(k) : null)),
  deleteItemAsync: vi.fn(async (k: string) => {
    kv.delete(k);
  }),
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: files.has(uri) || uri.endsWith("aesmsg/"),
  })),
  makeDirectoryAsync: vi.fn(async () => {}),
  readAsStringAsync: vi.fn(async (uri: string) => {
    if (!files.has(uri)) throw new Error("ENOENT");
    return files.get(uri) as string;
  }),
  writeAsStringAsync: vi.fn(async (uri: string, contents: string) => {
    files.set(uri, contents);
  }),
  deleteAsync: vi.fn(async (uri: string) => {
    files.delete(uri);
  }),
  readDirectoryAsync: vi.fn(async () => []),
}));

describe("getEncryptedStore singleton", () => {
  beforeEach(async () => {
    kv.clear();
    files.clear();
    vi.clearAllMocks();
    const { __resetEncryptedStoreForTests } = await import("@/src/storage");
    __resetEncryptedStoreForTests();
  });

  it("returns the same EncryptedStore instance across calls (memoized)", async () => {
    const { getEncryptedStore } = await import("@/src/storage");
    const a = await getEncryptedStore();
    const b = await getEncryptedStore();
    expect(a).toBe(b);
  });

  it("the wired store can round-trip a JSON value end-to-end through the mocked backends", async () => {
    const { getEncryptedStore } = await import("@/src/storage");
    const store = await getEncryptedStore();
    await store.setJson("contacts", { wired: true });
    expect(await store.getJson("contacts")).toEqual({ wired: true });
  });

  it("__resetEncryptedStoreForTests forces a fresh instance on the next call", async () => {
    const { getEncryptedStore, __resetEncryptedStoreForTests } = await import("@/src/storage");
    const a = await getEncryptedStore();
    __resetEncryptedStoreForTests();
    const b = await getEncryptedStore();
    expect(a).not.toBe(b);
  });

  it("re-exports the building blocks from the barrel", async () => {
    const mod = await import("@/src/storage");
    expect(typeof mod.EncryptedStore).toBe("function");
    expect(typeof mod.DecryptionError).toBe("function");
    expect(typeof mod.getOrCreateDEK).toBe("function");
    expect(typeof mod.deleteDEK).toBe("function");
  });
});
