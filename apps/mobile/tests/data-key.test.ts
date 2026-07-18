import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDEK, getOrCreateDEK } from "@/src/storage/data-key";
import type { ISecureStore, ISecureStoreOptions } from "@/src/storage/encrypted-store.types";

// WHEN_UNLOCKED_THIS_DEVICE_ONLY is a Symbol sentinel (identity equality) so the test asserts the
// EXACT accessibility class was threaded through without depending on the native numeric value —
// mirroring tests/secure-store.test.ts.
const { kv, WHEN_UNLOCKED_THIS_DEVICE_ONLY } = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
}));

function makeKeychain(): ISecureStore & {
  setSpy: ReturnType<typeof vi.fn>;
  getSpy: ReturnType<typeof vi.fn>;
  deleteSpy: ReturnType<typeof vi.fn>;
} {
  const setSpy = vi.fn(async (key: string, value: string) => {
    kv.set(key, value);
  });
  const getSpy = vi.fn(async (key: string) => (kv.has(key) ? (kv.get(key) as string) : null));
  const deleteSpy = vi.fn(async (key: string) => {
    kv.delete(key);
  });
  return {
    setItemAsync: setSpy as unknown as ISecureStore["setItemAsync"],
    getItemAsync: getSpy as unknown as ISecureStore["getItemAsync"],
    deleteItemAsync: deleteSpy as unknown as ISecureStore["deleteItemAsync"],
    setSpy,
    getSpy,
    deleteSpy,
  };
}

// Deterministic 32-byte source so we can assert idempotency returns the SAME bytes and a
// regenerated key differs after delete.
function makeRandom(seed: number) {
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (seed + i) & 0xff;
    return out;
  };
}

describe("data-key (DEK)", () => {
  beforeEach(() => {
    kv.clear();
    vi.clearAllMocks();
  });

  it("getOrCreateDEK returns 32 bytes (256-bit key)", async () => {
    const kc = makeKeychain();
    const dek = await getOrCreateDEK({
      secureStore: kc,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      randomBytes: makeRandom(1),
    });
    expect(dek).toBeInstanceOf(Uint8Array);
    expect(dek.length).toBe(32);
  });

  it("is idempotent: a second call returns the same key bytes and does not regenerate", async () => {
    const kc = makeKeychain();
    const first = await getOrCreateDEK({
      secureStore: kc,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      randomBytes: makeRandom(1),
    });
    const second = await getOrCreateDEK({
      secureStore: kc,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      randomBytes: makeRandom(99),
    });
    expect([...second]).toEqual([...first]);
    // setItemAsync ran only on the first (generating) call.
    expect(kc.setSpy).toHaveBeenCalledTimes(1);
  });

  it("stores the DEK device-local: WHEN_UNLOCKED_THIS_DEVICE_ONLY and NOT requireAuthentication", async () => {
    const kc = makeKeychain();
    await getOrCreateDEK({
      secureStore: kc,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      randomBytes: makeRandom(1),
    });
    expect(kc.setSpy).toHaveBeenCalledWith(
      "aesmsg.data-key",
      expect.any(String),
      expect.objectContaining({ keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    );
    // Must NOT require auth — routine startup reads cannot prompt biometrics.
    const opts = kc.setSpy.mock.calls[0]?.[2] as ISecureStoreOptions;
    expect(opts.requireAuthentication).toBeFalsy();
  });

  it("reads back persist the same bytes across a fresh keychain handle (decode round-trip)", async () => {
    const kc1 = makeKeychain();
    const created = await getOrCreateDEK({
      secureStore: kc1,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      randomBytes: makeRandom(7),
    });
    // Same backing kv map, new keychain object: simulates a later app launch.
    const kc2 = makeKeychain();
    const reloaded = await getOrCreateDEK({
      secureStore: kc2,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      randomBytes: makeRandom(7),
    });
    expect([...reloaded]).toEqual([...created]);
    expect(kc2.setSpy).not.toHaveBeenCalled();
    expect(kc2.getSpy).toHaveBeenCalled();
  });

  it("deleteDEK removes the key so the next getOrCreateDEK regenerates a fresh one", async () => {
    const kc = makeKeychain();
    const first = await getOrCreateDEK({
      secureStore: kc,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      randomBytes: makeRandom(1),
    });
    await deleteDEK({
      secureStore: kc,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(kc.deleteSpy).toHaveBeenCalledWith(
      "aesmsg.data-key",
      expect.objectContaining({ keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    );
    const regenerated = await getOrCreateDEK({
      secureStore: kc,
      accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      randomBytes: makeRandom(200),
    });
    expect([...regenerated]).not.toEqual([...first]);
  });
});
