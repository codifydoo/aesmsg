import {
  DEFAULT_WRAP_KDF_PARAMS,
  exportPublicKey,
  fingerprint,
  generateIdentity,
  readWrapKdfParams,
  unwrapPrivateKey,
  type WrappedKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetiredKeyEntry } from "@/src/identity/identity-bundle";
import { createIdentityMachine, type IdentityMachineDeps } from "@/src/identity/identity-machine";
import { MOBILE_KDF_PARAMS, needsRewrap } from "@/src/identity/kdf-policy";

// REAL crypto, fake storage + secret seams. Node vitest cannot load expo-secure-store /
// expo-local-authentication, but the machine never imports them — it takes them via DI — so this
// test exercises the true crypto round-trip (wrap/unwrap) against in-memory fakes.
//
// Crypto operations (generateIdentity, wrapPrivateKey, unwrapPrivateKey) run argon2id and HPKE
// key generation; the per-test timeout is widened to 30s.

const FIXED_SECRET = "fixed-device-secret-entropy";

// An in-memory wrapped-identity store. Spies wrap the real Map so we can both assert call
// shape (memory-confinement) and exercise real load/save/delete semantics.
function makeFakeStore() {
  const map = new Map<string, WrappedKey>();
  const KEY = "wrapped";
  // Retired-keys blob (rotation) — an in-memory list mirroring the retired keychain item.
  let retired: RetiredKeyEntry[] = [];
  // Tracks whether wipeStorage() was invoked, and lets tests control its outcome.
  let _wipeShouldThrow: Error | null = null;
  const store = {
    map,
    saveWrappedIdentity: vi.fn(async (wrapped: WrappedKey) => {
      map.set(KEY, wrapped);
    }),
    loadWrappedIdentity: vi.fn(async () => map.get(KEY) ?? null),
    hasStoredIdentity: vi.fn(async () => map.has(KEY)),
    deleteWrappedIdentity: vi.fn(async () => {
      map.delete(KEY);
    }),
    loadRetiredKeys: vi.fn(async () => [...retired]),
    saveRetiredKeys: vi.fn(async (entries: RetiredKeyEntry[]) => {
      retired = [...entries];
    }),
    deleteRetiredKeys: vi.fn(async () => {
      retired = [];
    }),
    wipeStorage: vi.fn(async () => {
      if (_wipeShouldThrow) throw _wipeShouldThrow;
    }),
    /** Test helper: make the next wipeStorage() call throw. */
    __setWipeStorageThrows(err: Error | null): void {
      _wipeShouldThrow = err;
    },
  };
  return store;
}

function makeFakeSecret(overrides?: {
  createDeviceSecret?: () => Promise<string>;
  unlockDeviceSecret?: () => Promise<string>;
}) {
  return {
    createDeviceSecret: vi.fn(overrides?.createDeviceSecret ?? (async () => FIXED_SECRET)),
    unlockDeviceSecret: vi.fn(overrides?.unlockDeviceSecret ?? (async () => FIXED_SECRET)),
    deleteDeviceSecret: vi.fn(async () => {}),
  };
}

// Real crypto deps, wired exactly like createProductionMachine() — same light params and the REAL
// needsRewrap policy (imported from kdf-policy, not re-implemented), so these tests pin production
// behavior rather than a mirror that could drift. exportPublicKey is synchronous; the rest async.
const realCrypto: IdentityMachineDeps["crypto"] = {
  generateIdentity,
  wrapPrivateKey: (id, secret) => wrapPrivateKey(id, secret, MOBILE_KDF_PARAMS),
  unwrapPrivateKey,
  exportPublicKey,
  fingerprint,
  needsRewrap,
};

describe("createIdentityMachine", () => {
  let store: ReturnType<typeof makeFakeStore>;
  let secret: ReturnType<typeof makeFakeSecret>;

  beforeEach(() => {
    store = makeFakeStore();
    secret = makeFakeSecret();
  });

  it("starts in loading before init runs", () => {
    const m = createIdentityMachine({ crypto: realCrypto, secret, store });
    expect(m.getState()).toEqual({ status: "loading" });
  });

  describe("init", () => {
    it("resolves to no_identity when no wrapped identity is stored", async () => {
      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "no_identity" });
    });

    it("resolves to locked when a wrapped identity exists", async () => {
      // Seed a wrapped identity directly into the fake store.
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "locked" });
    }, 30000);
  });

  describe("setupNew", () => {
    it("from no_identity transitions to unlocked exposing the public key of the generated identity", async () => {
      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.setupNew();

      const state = m.getState();
      expect(state.status).toBe("unlocked");
      if (state.status !== "unlocked") throw new Error("unreachable");
      // The exposed public key must be the one derived from the unlocked identity.
      expect(state.publicKeyString).toBe(exportPublicKey(state.identity));
      expect(secret.createDeviceSecret).toHaveBeenCalledTimes(1);
      // A wrapped envelope was persisted.
      expect(store.saveWrappedIdentity).toHaveBeenCalledTimes(1);
    }, 30000);

    it("refuses (guard) when an identity already exists — no silent overwrite", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);
      store.saveWrappedIdentity.mockClear();

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "locked" });

      await expect(m.setupNew()).rejects.toThrow(/Cannot setup a new identity/);
      // The existing wrapped identity must NOT have been overwritten.
      expect(store.saveWrappedIdentity).not.toHaveBeenCalled();
      expect(secret.createDeviceSecret).not.toHaveBeenCalled();
      expect(m.getState()).toEqual({ status: "locked" });
    }, 30000);

    it("refuses when called from loading (before init)", async () => {
      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await expect(m.setupNew()).rejects.toThrow(/Cannot setup a new identity/);
      expect(store.saveWrappedIdentity).not.toHaveBeenCalled();
    });
  });

  describe("importIdentity", () => {
    it("from no_identity persists a wrapped envelope and transitions to unlocked with the imported public key", async () => {
      // The identity to import is produced externally (e.g. unwrapped from a backup file).
      const imported = await generateIdentity();
      const expectedPk = exportPublicKey(imported);

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "no_identity" });

      await m.importIdentity(imported);

      const state = m.getState();
      expect(state.status).toBe("unlocked");
      if (state.status !== "unlocked") throw new Error("unreachable");
      // The exposed public key is the one derived from the imported identity.
      expect(state.publicKeyString).toBe(expectedPk);
      // A device secret was created and exactly one wrapped envelope was persisted.
      expect(secret.createDeviceSecret).toHaveBeenCalledTimes(1);
      expect(store.saveWrappedIdentity).toHaveBeenCalledTimes(1);

      // What landed in the store is the opaque wrapped envelope STRING — never the raw keypair.
      const persisted = store.saveWrappedIdentity.mock.calls[0]?.[0];
      expect(typeof persisted).toBe("string");
      expect(persisted).not.toBe(expectedPk);
      // And it really is the wrapped private key: it round-trips back to the same identity.
      const recovered = await unwrapPrivateKey(persisted as WrappedKey, FIXED_SECRET);
      expect(exportPublicKey(recovered)).toBe(expectedPk);
    }, 30000);

    it("refuses (guard) when called from locked — no overwrite of an existing identity", async () => {
      const existing = await generateIdentity();
      const wrapped = await wrapPrivateKey(existing, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);
      store.saveWrappedIdentity.mockClear();

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "locked" });

      const incoming = await generateIdentity();
      await expect(m.importIdentity(incoming)).rejects.toThrow(/Cannot import an identity/);
      // The existing wrapped identity must NOT have been overwritten.
      expect(store.saveWrappedIdentity).not.toHaveBeenCalled();
      expect(secret.createDeviceSecret).not.toHaveBeenCalled();
      expect(m.getState()).toEqual({ status: "locked" });
    }, 30000);

    it("refuses (guard) when called from unlocked", async () => {
      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.setupNew();
      expect(m.getState().status).toBe("unlocked");
      store.saveWrappedIdentity.mockClear();
      secret.createDeviceSecret.mockClear();

      const incoming = await generateIdentity();
      await expect(m.importIdentity(incoming)).rejects.toThrow(/Cannot import an identity/);
      expect(store.saveWrappedIdentity).not.toHaveBeenCalled();
      expect(secret.createDeviceSecret).not.toHaveBeenCalled();
      // State is unchanged — still the originally-set-up identity.
      expect(m.getState().status).toBe("unlocked");
    }, 30000);

    it("round-trips an exported-then-imported identity (wrap → unwrap → importIdentity)", async () => {
      // Simulate an export-file flow: wrap under the heavy passphrase params, then unwrap with the
      // passphrase to recover the identity, then import it as this device's active identity.
      const original = await generateIdentity();
      const expectedPk = exportPublicKey(original);
      const PASSPHRASE = "correct horse battery staple";

      const backup = await wrapPrivateKey(original, PASSPHRASE, DEFAULT_WRAP_KDF_PARAMS);
      const restored = await unwrapPrivateKey(backup, PASSPHRASE);

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.importIdentity(restored);

      const state = m.getState();
      expect(state.status).toBe("unlocked");
      if (state.status !== "unlocked") throw new Error("unreachable");
      // The recovered identity carries the ORIGINAL public key.
      expect(state.publicKeyString).toBe(expectedPk);
    }, 30000);
  });

  describe("unlock", () => {
    it("from locked transitions to unlocked via a real wrap/unwrap round-trip", async () => {
      // Real setup: generate, wrap under FIXED_SECRET, persist, then start fresh and unlock.
      const id = await generateIdentity();
      const expectedPk = exportPublicKey(id);
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "locked" });

      await m.unlock();
      const state = m.getState();
      expect(state.status).toBe("unlocked");
      if (state.status !== "unlocked") throw new Error("unreachable");
      // Round-tripped identity decrypts to the same public key.
      expect(state.publicKeyString).toBe(expectedPk);
      expect(secret.unlockDeviceSecret).toHaveBeenCalledTimes(1);
    }, 30000);

    it("stays locked with no key when unlockDeviceSecret rejects (biometric reject)", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      const rejectingSecret = makeFakeSecret({
        unlockDeviceSecret: async () => {
          throw new Error("biometric rejected");
        },
      });
      const m = createIdentityMachine({ crypto: realCrypto, secret: rejectingSecret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "locked" });

      await expect(m.unlock()).rejects.toThrow(/biometric rejected/);
      // No fallback, no recovery: still locked, no keypair anywhere in state.
      expect(m.getState()).toEqual({ status: "locked" });
    }, 30000);

    it("stays locked when unwrapPrivateKey throws (wrong key)", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      // Device secret returns the WRONG entropy → unwrap fails.
      const wrongSecret = makeFakeSecret({
        unlockDeviceSecret: async () => "the-wrong-secret",
      });
      const m = createIdentityMachine({ crypto: realCrypto, secret: wrongSecret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "locked" });

      await expect(m.unlock()).rejects.toBeInstanceOf(Error);
      expect(m.getState()).toEqual({ status: "locked" });
    }, 30000);

    it("goes to no_identity when there is nothing to unlock", async () => {
      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "no_identity" });

      await m.unlock();
      // loadWrappedIdentity returns null → no_identity; biometric gate never invoked.
      expect(m.getState()).toEqual({ status: "no_identity" });
      expect(secret.unlockDeviceSecret).not.toHaveBeenCalled();
    });
  });

  describe("lazy KDF migration on unlock", () => {
    it("re-wraps a heavy (legacy/web) envelope under lighter params after a successful unlock", async () => {
      const id = await generateIdentity();
      const expectedPk = exportPublicKey(id);
      // Seed a HEAVY envelope (default OWASP params), as a pre-fix or web-created identity would be.
      const heavy = await wrapPrivateKey(id, FIXED_SECRET);
      expect(readWrapKdfParams(heavy).mKib).toBe(65536);
      await store.saveWrappedIdentity(heavy);
      store.saveWrappedIdentity.mockClear();

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.unlock();
      expect(m.getState().status).toBe("unlocked");

      // Migration fired exactly once, persisting a LIGHT envelope that still recovers the identity.
      expect(store.saveWrappedIdentity).toHaveBeenCalledTimes(1);
      const migrated = store.saveWrappedIdentity.mock.calls[0]?.[0] as WrappedKey;
      expect(readWrapKdfParams(migrated)).toEqual(MOBILE_KDF_PARAMS);
      const recovered = await unwrapPrivateKey(migrated, FIXED_SECRET);
      expect(exportPublicKey(recovered)).toBe(expectedPk);
      // The biometric gate ran once — migration reuses the already-unlocked device secret.
      expect(secret.unlockDeviceSecret).toHaveBeenCalledTimes(1);
    }, 30000);

    it("does not re-wrap an already-light envelope (idempotent)", async () => {
      const id = await generateIdentity();
      // Seed a LIGHT envelope (already migrated / created post-fix).
      const light = await wrapPrivateKey(id, FIXED_SECRET, MOBILE_KDF_PARAMS);
      await store.saveWrappedIdentity(light);
      store.saveWrappedIdentity.mockClear();

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.unlock();
      expect(m.getState().status).toBe("unlocked");
      expect(store.saveWrappedIdentity).not.toHaveBeenCalled();
    }, 30000);

    it("keeps the unlock successful even if the re-wrap migration fails", async () => {
      const id = await generateIdentity();
      const expectedPk = exportPublicKey(id);
      const heavy = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(heavy);

      // The migration save throws — the unlock must still end unlocked, key in memory.
      const failingStore = {
        ...store,
        saveWrappedIdentity: vi.fn(async () => {
          throw new Error("disk full");
        }),
      };
      const m = createIdentityMachine({ crypto: realCrypto, secret, store: failingStore });
      await m.init();
      await m.unlock();

      const state = m.getState();
      expect(state.status).toBe("unlocked");
      if (state.status !== "unlocked") throw new Error("unreachable");
      expect(state.publicKeyString).toBe(expectedPk);
    }, 30000);

    it("does not resurrect a wiped identity when wipe() races the in-flight migration", async () => {
      const id = await generateIdentity();
      const heavy = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(heavy);
      store.saveWrappedIdentity.mockClear();

      // A crypto whose migration re-wrap blocks on a gate we control, so we can run wipe() while the
      // migration is suspended between the re-wrap and the save.
      let resolveStarted: () => void = () => {};
      let releaseRewrap: () => void = () => {};
      const rewrapStarted = new Promise<void>((r) => {
        resolveStarted = r;
      });
      const gate = new Promise<void>((r) => {
        releaseRewrap = r;
      });
      const racyCrypto: IdentityMachineDeps["crypto"] = {
        ...realCrypto,
        wrapPrivateKey: vi.fn(async (identity, secret) => {
          resolveStarted();
          await gate;
          return wrapPrivateKey(identity, secret, MOBILE_KDF_PARAMS);
        }),
      };

      const m = createIdentityMachine({ crypto: racyCrypto, secret, store });
      await m.init();
      const unlocking = m.unlock();
      await rewrapStarted; // migration is now suspended mid re-wrap

      await m.wipe(); // deletes the stored envelope + device secret; state -> no_identity
      expect(m.getState()).toEqual({ status: "no_identity" });

      releaseRewrap(); // let the migration continue; the state guard must skip the save
      await unlocking;

      // The wipe stays effective: no envelope was resurrected by the late migration save.
      expect(store.saveWrappedIdentity).not.toHaveBeenCalled();
      expect(await store.loadWrappedIdentity()).toBeNull();
      expect(m.getState()).toEqual({ status: "no_identity" });
    }, 30000);
  });

  describe("lock", () => {
    it("from unlocked drops the keypair back to locked", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.unlock();
      expect(m.getState().status).toBe("unlocked");

      m.lock();
      // The state no longer carries an identity — only { status: "locked" }.
      expect(m.getState()).toEqual({ status: "locked" });
    }, 30000);

    it("is a no-op when not unlocked", async () => {
      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "no_identity" });
      m.lock();
      expect(m.getState()).toEqual({ status: "no_identity" });
    });
  });

  describe("wipe", () => {
    it("deletes BOTH wrapped identity and device secret, and a later unlock cannot recover", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.unlock();
      expect(m.getState().status).toBe("unlocked");

      await m.wipe();
      expect(secret.deleteDeviceSecret).toHaveBeenCalledTimes(1);
      expect(store.deleteWrappedIdentity).toHaveBeenCalledTimes(1);
      expect(m.getState()).toEqual({ status: "no_identity" });
      // The store is empty.
      expect(await store.loadWrappedIdentity()).toBeNull();

      // Irreversible: a later unlock finds nothing → no_identity, never unlocked.
      await m.unlock();
      expect(m.getState()).toEqual({ status: "no_identity" });
    }, 30000);

    // REGRESSION: encrypted blobs + DEK must also be purged on wipe.
    // Without the fix (wipeStorage not called in wipe()), this test fails because
    // wipeStorage is never invoked.
    it("invokes wipeStorage() to purge encrypted blobs + DEK alongside the identity wipe", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.unlock();

      await m.wipe();

      // All three deletion paths must be exercised in a single wipe.
      expect(store.deleteWrappedIdentity).toHaveBeenCalledTimes(1);
      expect(secret.deleteDeviceSecret).toHaveBeenCalledTimes(1);
      expect(store.wipeStorage).toHaveBeenCalledTimes(1);
      expect(m.getState()).toEqual({ status: "no_identity" });
    }, 30000);

    it("wipeStorage() is called even when wiping from the locked state (no prior unlock needed)", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      expect(m.getState()).toEqual({ status: "locked" });

      await m.wipe();

      expect(store.wipeStorage).toHaveBeenCalledTimes(1);
      expect(m.getState()).toEqual({ status: "no_identity" });
    }, 30000);

    it("propagates a wipeStorage() failure so the caller knows the purge was incomplete", async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, FIXED_SECRET);
      await store.saveWrappedIdentity(wrapped);

      // Make the storage wipe fail to simulate a partially-failed purge.
      store.__setWipeStorageThrows(new Error("storage purge failed"));

      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();

      await expect(m.wipe()).rejects.toThrow("storage purge failed");
      // The identity + device secret were still deleted before the storage error.
      expect(store.deleteWrappedIdentity).toHaveBeenCalledTimes(1);
      expect(secret.deleteDeviceSecret).toHaveBeenCalledTimes(1);
    }, 30000);
  });

  describe("memory confinement", () => {
    it("saveWrappedIdentity only ever receives a WrappedKey string, never the raw IdentityKeypair", async () => {
      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      await m.init();
      await m.setupNew();

      const state = m.getState();
      if (state.status !== "unlocked") throw new Error("expected unlocked");
      const inMemoryPk = state.publicKeyString;

      expect(store.saveWrappedIdentity).toHaveBeenCalledTimes(1);
      const persisted = store.saveWrappedIdentity.mock.calls[0]?.[0];
      // Persisted value is the opaque wrapped envelope string, NOT an identity object.
      expect(typeof persisted).toBe("string");
      // It must NOT be the raw public key string the app exposes in memory.
      expect(persisted).not.toBe(inMemoryPk);
      // And it round-trips back via unwrap with the same secret the machine used to wrap,
      // recovering the SAME identity (so the persisted blob really is the wrapped private key,
      // not a leaked keypair object serialized some other way).
      const recovered = await unwrapPrivateKey(persisted as WrappedKey, FIXED_SECRET);
      expect(exportPublicKey(recovered)).toBe(inMemoryPk);
    }, 30000);
  });

  describe("subscribe", () => {
    it("notifies subscribers on each transition and stops after unsubscribe", async () => {
      const m = createIdentityMachine({ crypto: realCrypto, secret, store });
      const seen: string[] = [];
      const unsub = m.subscribe((s) => seen.push(s.status));
      await m.init();
      expect(seen).toEqual(["no_identity"]);
      unsub();
      await m.setupNew();
      // No further notifications after unsubscribe.
      expect(seen).toEqual(["no_identity"]);
      // But the machine still advanced internally.
      expect(m.getState().status).toBe("unlocked");
    }, 30000);
  });
});
