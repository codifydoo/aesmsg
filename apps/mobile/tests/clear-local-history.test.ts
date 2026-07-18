import { describe, expect, it, vi } from "vitest";

// clear-local-history.ts (productionDeps) imports expo-file-system/legacy and, transitively via
// clearSentLinks → getEncryptedStore → secure-store-impl, expo-secure-store. Both pull in
// react-native (which fails Rollup parse under the node runner), so they MUST be mocked. Tests use
// explicit DI deps so the mock implementations are never invoked; the mocks exist only to stop the
// module-resolution failure. This mirrors the pattern in sent-links-store.test.ts.
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

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///tmp/",
  cacheDirectory: "file:///cache/",
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
  readDirectoryAsync: vi.fn(async () => []),
  EncodingType: { UTF8: "utf8", Base64: "base64" },
}));

import { type ClearLocalHistoryDeps, clearLocalHistory } from "@/src/settings/clear-local-history";

function makeDeps(overrides?: Partial<ClearLocalHistoryDeps>): ClearLocalHistoryDeps {
  return {
    clearSentLinks: vi.fn().mockResolvedValue(undefined),
    clearAttachmentCache: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("clearLocalHistory", () => {
  it("calls BOTH clearSentLinks and clearAttachmentCache", async () => {
    const deps = makeDeps();
    await clearLocalHistory(deps);
    expect(deps.clearSentLinks).toHaveBeenCalledTimes(1);
    expect(deps.clearAttachmentCache).toHaveBeenCalledTimes(1);
  });

  it("still calls clearAttachmentCache even if clearSentLinks rejects", async () => {
    const deps = makeDeps({
      clearSentLinks: vi.fn().mockRejectedValue(new Error("store error")),
    });
    // Must resolve (not throw) — best-effort via Promise.allSettled.
    await expect(clearLocalHistory(deps)).resolves.toBeUndefined();
    expect(deps.clearAttachmentCache).toHaveBeenCalledTimes(1);
  });

  it("still calls clearSentLinks even if clearAttachmentCache rejects", async () => {
    const deps = makeDeps({
      clearAttachmentCache: vi.fn().mockRejectedValue(new Error("fs error")),
    });
    await expect(clearLocalHistory(deps)).resolves.toBeUndefined();
    expect(deps.clearSentLinks).toHaveBeenCalledTimes(1);
  });

  it("resolves even if BOTH sides reject", async () => {
    const deps = makeDeps({
      clearSentLinks: vi.fn().mockRejectedValue(new Error("store error")),
      clearAttachmentCache: vi.fn().mockRejectedValue(new Error("fs error")),
    });
    await expect(clearLocalHistory(deps)).resolves.toBeUndefined();
  });
});
