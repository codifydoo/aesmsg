import {
  BadPassphraseError,
  exportPublicKey,
  generateIdentity,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import * as SecureStore from "expo-secure-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteWrappedIdentity,
  hasStoredIdentity,
  loadWrappedIdentity,
  saveWrappedIdentity,
} from "@/src/identity/secure-store";

// expo-secure-store cannot load under Node vitest. Back it with an in-memory Map so
// save/load/delete round-trip exactly like the device Keychain would. The map is declared via
// vi.hoisted so the (hoisted) mock factory can reference it without a TDZ error.
//
// WHEN_UNLOCKED_THIS_DEVICE_ONLY is exported as a Symbol sentinel because secure-store.ts
// references it at module load (inside WRAPPED_OPTIONS); a Symbol gives identity equality so we
// can assert the exact accessibility class was passed without depending on the native value.
const { store, WHEN_UNLOCKED_THIS_DEVICE_ONLY } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  getItemAsync: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

// argon2id (the KDF inside wrapPrivateKey/unwrapPrivateKey) is deliberately slow; give the
// crypto-backed cases a generous timeout.
const CRYPTO_TIMEOUT = 30_000;

describe("secure-store (wrapped identity)", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it(
    "round-trips a wrapped identity: save -> load -> unwrap recovers the same public key",
    async () => {
      const secret = "device-secret-entropy-base64";
      const id = await generateIdentity();
      const pkBefore = exportPublicKey(id);
      const wrapped = await wrapPrivateKey(id, secret);

      await saveWrappedIdentity(wrapped);
      const loaded = await loadWrappedIdentity();
      expect(loaded).not.toBeNull();
      if (loaded === null) throw new Error("expected a stored wrapped identity");

      const recovered = await unwrapPrivateKey(loaded, secret);
      expect(exportPublicKey(recovered)).toBe(pkBefore);
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "the wrong device secret cannot unwrap the loaded identity (BadPassphraseError)",
    async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, "correct-device-secret");
      await saveWrappedIdentity(wrapped);

      const loaded = await loadWrappedIdentity();
      if (loaded === null) throw new Error("expected a stored wrapped identity");

      await expect(unwrapPrivateKey(loaded, "wrong-device-secret")).rejects.toBeInstanceOf(
        BadPassphraseError,
      );
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "saveWrappedIdentity persists a string value into storage",
    async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, "device-secret");

      await saveWrappedIdentity(wrapped);

      const stored = store.get("aesmsg.wrapped-identity");
      expect(typeof stored).toBe("string");
      expect(stored).toBe(wrapped);
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "saveWrappedIdentity pins the envelope device-local (keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY)",
    async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, "device-secret");

      await saveWrappedIdentity(wrapped);

      // The accessibility class must be the THIS_DEVICE_ONLY sentinel so the Keychain item is not
      // synced to iCloud Keychain or carried into encrypted device backups — keeping the wrapped
      // identity from migrating to another device, per the file's device-local contract.
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "aesmsg.wrapped-identity",
        wrapped,
        expect.objectContaining({
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      );
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "hasStoredIdentity reports false before a save and true afterwards",
    async () => {
      expect(await hasStoredIdentity()).toBe(false);

      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, "device-secret");
      await saveWrappedIdentity(wrapped);

      expect(await hasStoredIdentity()).toBe(true);
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "deleteWrappedIdentity clears storage: load returns null and hasStoredIdentity is false",
    async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, "device-secret");
      await saveWrappedIdentity(wrapped);
      expect(await hasStoredIdentity()).toBe(true);

      await deleteWrappedIdentity();

      expect(await loadWrappedIdentity()).toBeNull();
      expect(await hasStoredIdentity()).toBe(false);
    },
    CRYPTO_TIMEOUT,
  );
});
