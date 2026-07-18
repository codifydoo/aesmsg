import {
  compareFingerprint,
  exportPublicKey,
  fingerprint,
  generateIdentity,
  type IdentityKeypair,
  importPublicKey,
  type MessageBindingContext,
  open,
  type PublicKeyString,
  seal,
  unwrapPrivateKey,
  type WrappedKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allPrivateKeysForDecrypt, decryptWithKeyFallback } from "@/src/identity/decrypt-keys";
import type { RetiredKeyEntry } from "@/src/identity/identity-bundle";
import { createIdentityMachine, type IdentityMachineDeps } from "@/src/identity/identity-machine";
import { MOBILE_KDF_PARAMS, needsRewrap } from "@/src/identity/kdf-policy";

// Behavioral tests for REAL key rotation (roadmap 2.4 / PG-1). REAL crypto (HPKE keygen + argon2id
// wrap + seal/open), fake storage + secret seams — the machine takes them via DI, so this exercises
// the true legacy-link round trip in Node without any expo-* native. argon2id is slow → 30s timeouts.

const FIXED_SECRET = "fixed-device-secret-entropy";
const CRYPTO_TIMEOUT = 30_000;

function makeFakeStore() {
  const map = new Map<string, WrappedKey>();
  const KEY = "wrapped";
  let retired: RetiredKeyEntry[] = [];
  const store = {
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
    wipeStorage: vi.fn(async () => {}),
  };
  return store;
}

function makeFakeSecret() {
  return {
    createDeviceSecret: vi.fn(async () => FIXED_SECRET),
    unlockDeviceSecret: vi.fn(async () => FIXED_SECRET),
    deleteDeviceSecret: vi.fn(async () => {}),
  };
}

const realCrypto: IdentityMachineDeps["crypto"] = {
  generateIdentity,
  wrapPrivateKey: (id, secret) => wrapPrivateKey(id, secret, MOBILE_KDF_PARAMS),
  unwrapPrivateKey,
  exportPublicKey,
  fingerprint,
  needsRewrap,
};

// Seal a plaintext to `recipientPk` exactly like a sender would, producing an opaque ciphertext.
async function sealTo(recipientPk: PublicKeyString, plaintext: Uint8Array) {
  const recipient = await importPublicKey(recipientPk);
  const ctx: MessageBindingContext = {
    linkId: "AAAAAAAAAAAAAAAA", // 16 ASCII bytes, per the AAD wire invariant
    recipientPublicKey: recipientPk,
    expiresAtMs: 1_900_000_000_000,
    maxOpens: 1,
  };
  return seal(plaintext, recipient, ctx);
}

// Decrypt exactly like the reader's fetch-and-open: rebuild the AAD context from EACH tried key's OWN
// public key, so a retired key reconstructs the exact legacy binding it was sealed under.
async function openWithKey(ciphertext: Awaited<ReturnType<typeof seal>>, key: IdentityKeypair) {
  const ownPk = exportPublicKey(key);
  const ctx: MessageBindingContext = {
    linkId: "AAAAAAAAAAAAAAAA",
    recipientPublicKey: ownPk,
    expiresAtMs: 1_900_000_000_000,
    maxOpens: 1,
  };
  return open(ciphertext, key, ctx);
}

async function newUnlockedMachine(now?: () => number) {
  const store = makeFakeStore();
  const secret = makeFakeSecret();
  const machine = createIdentityMachine({
    crypto: realCrypto,
    secret,
    store,
    ...(now ? { now } : {}),
  });
  await machine.init();
  await machine.setupNew();
  return { machine, store, secret };
}

describe("real key rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "makes a NEW active key and RETAINS the old one as retired (different fingerprint, surfaced)",
    async () => {
      const { machine } = await newUnlockedMachine(() => 12_345);
      const before = machine.getState();
      if (before.status !== "unlocked") throw new Error("expected unlocked");
      const oldPk = before.publicKeyString;
      const oldFp = await fingerprint(oldPk);

      const returnedPk = await machine.rotate();

      const after = machine.getState();
      if (after.status !== "unlocked") throw new Error("expected unlocked after rotate");
      const newPk = after.publicKeyString;
      const newFp = await fingerprint(newPk);

      // New active key, surfaced via the return value for re-verification.
      expect(newPk).not.toBe(oldPk);
      expect(returnedPk).toBe(newPk);
      expect(compareFingerprint(newFp, oldFp)).toBe(false);

      // The old key is retained as the (only) retired keypair, newest-first.
      expect(after.retiredKeypairs).toHaveLength(1);
      expect(exportPublicKey(after.retiredKeypairs[0] as IdentityKeypair)).toBe(oldPk);
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "getAllPrivateKeysForDecrypt returns [active, ...retired] newest→oldest across two rotations",
    async () => {
      const { machine } = await newUnlockedMachine();
      const s0 = machine.getState();
      if (s0.status !== "unlocked") throw new Error("unreachable");
      const pk0 = s0.publicKeyString;

      await machine.rotate();
      const pk1 = (machine.getState() as { publicKeyString: PublicKeyString }).publicKeyString;

      await machine.rotate();
      const s2 = machine.getState();
      if (s2.status !== "unlocked") throw new Error("unreachable");
      const pk2 = s2.publicKeyString;

      const keys = allPrivateKeysForDecrypt(s2);
      expect(keys.map((k) => exportPublicKey(k))).toEqual([pk2, pk1, pk0]);
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "a message sealed to the OLD key still decrypts after rotation (via the retained retired key)",
    async () => {
      const { machine } = await newUnlockedMachine();
      const before = machine.getState();
      if (before.status !== "unlocked") throw new Error("unreachable");
      const oldPk = before.publicKeyString;

      // Sender seals to the CURRENT (soon-to-be-old) key.
      const plaintext = new TextEncoder().encode("api-key: sk-legacy-123");
      const ciphertext = await sealTo(oldPk, plaintext);

      await machine.rotate();
      const after = machine.getState();
      if (after.status !== "unlocked") throw new Error("unreachable");

      // The new active key must NOT be able to open it, but the fallback (which reaches the retired
      // key) must — proving in-flight legacy links keep working after rotation.
      const activeKey = after.identity;
      await expect(openWithKey(ciphertext, activeKey)).rejects.toBeTruthy();

      const recovered = await decryptWithKeyFallback(allPrivateKeysForDecrypt(after), (key) =>
        openWithKey(ciphertext, key),
      );
      expect(new TextDecoder().decode(recovered)).toBe("api-key: sk-legacy-123");
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "the retired key is stored device-secret-WRAPPED (never raw) and round-trips to the old key",
    async () => {
      const { machine, store } = await newUnlockedMachine(() => 777);
      const oldPk = (machine.getState() as { publicKeyString: PublicKeyString }).publicKeyString;

      await machine.rotate();

      const saved = store.saveRetiredKeys.mock.calls.at(-1)?.[0] as RetiredKeyEntry[];
      expect(saved).toHaveLength(1);
      const entry = saved[0] as RetiredKeyEntry;
      expect(entry.publicKeyString).toBe(oldPk);
      expect(entry.retiredAtMs).toBe(777);
      // `wrapped` is an opaque envelope STRING, not a raw keypair, and unwraps to the old key.
      expect(typeof entry.wrapped).toBe("string");
      const recovered = await unwrapPrivateKey(entry.wrapped, FIXED_SECRET);
      expect(exportPublicKey(recovered)).toBe(oldPk);
    },
    CRYPTO_TIMEOUT,
  );

  it("refuses to rotate unless unlocked", async () => {
    const store = makeFakeStore();
    const secret = makeFakeSecret();
    const machine = createIdentityMachine({ crypto: realCrypto, secret, store });
    await machine.init(); // no_identity
    await expect(machine.rotate()).rejects.toThrow(/Cannot rotate identity/);
  });

  describe("crash-safety (all-or-nothing; retired retained BEFORE the active pointer flips)", () => {
    it(
      "persists the retired blob before overwriting the active key",
      async () => {
        const { machine, store } = await newUnlockedMachine();
        await machine.rotate();
        const retiredOrder = store.saveRetiredKeys.mock.invocationCallOrder.at(-1) ?? 0;
        const activeOrder = store.saveWrappedIdentity.mock.invocationCallOrder.at(-1) ?? 0;
        // saveRetiredKeys (retains the old key) ran BEFORE saveWrappedIdentity (flips to the new key).
        expect(retiredOrder).toBeLessThan(activeOrder);
      },
      CRYPTO_TIMEOUT,
    );

    it(
      "a crash while flipping the active pointer leaves the identity fully usable (old key intact, not bricked)",
      async () => {
        // Simulate a crash: the active-pointer write throws AFTER the retired blob was persisted.
        const store = makeFakeStore();
        const secret = makeFakeSecret();
        const machine = createIdentityMachine({ crypto: realCrypto, secret, store });
        await machine.init();
        await machine.setupNew();
        const oldPk = (machine.getState() as { publicKeyString: PublicKeyString }).publicKeyString;

        // Seal a message to the old key up front — it must still open after the failed rotation.
        const ciphertext = await sealTo(oldPk, new TextEncoder().encode("still-openable"));

        // setupNew's initial active write already landed via the original fake; from here the
        // active-pointer write crashes (rotate only calls saveWrappedIdentity once, for the flip).
        store.saveWrappedIdentity.mockImplementation(async () => {
          throw new Error("crash: power lost writing the active pointer");
        });

        await expect(machine.rotate()).rejects.toThrow(/crash/);

        // The retired blob DID retain the old key (write ordering), and the on-disk active pointer was
        // never overwritten → both still reference the old key. Reload from a fresh machine + unlock.
        const machine2 = createIdentityMachine({ crypto: realCrypto, secret, store });
        await machine2.init();
        expect(machine2.getState()).toEqual({ status: "locked" });
        await machine2.unlock();

        const reloaded = machine2.getState();
        if (reloaded.status !== "unlocked") throw new Error("expected unlocked after reload");
        // Back to exactly the pre-rotation state: active === old key, no duplicate retired entry.
        expect(reloaded.publicKeyString).toBe(oldPk);
        expect(reloaded.retiredKeypairs).toHaveLength(0);

        // And the legacy message still opens with the (still-active) old key — nothing was lost.
        const recovered = await decryptWithKeyFallback(allPrivateKeysForDecrypt(reloaded), (key) =>
          openWithKey(ciphertext, key),
        );
        expect(new TextDecoder().decode(recovered)).toBe("still-openable");
      },
      CRYPTO_TIMEOUT,
    );
  });

  it(
    "wipe purges the retired keys as well as the active identity",
    async () => {
      const { machine, store } = await newUnlockedMachine();
      await machine.rotate();
      expect((await store.loadRetiredKeys()).length).toBe(1);

      await machine.wipe();

      expect(store.deleteRetiredKeys).toHaveBeenCalledTimes(1);
      expect(await store.loadRetiredKeys()).toEqual([]);
      expect(machine.getState()).toEqual({ status: "no_identity" });
    },
    CRYPTO_TIMEOUT,
  );

  it(
    "unlock reloads and unwraps retained retired keys so legacy links open in a fresh session",
    async () => {
      const store = makeFakeStore();
      const secret = makeFakeSecret();
      const machine = createIdentityMachine({ crypto: realCrypto, secret, store });
      await machine.init();
      await machine.setupNew();
      const oldPk = (machine.getState() as { publicKeyString: PublicKeyString }).publicKeyString;
      const ciphertext = await sealTo(oldPk, new TextEncoder().encode("legacy-after-relock"));
      await machine.rotate();

      // Simulate app relaunch: brand-new machine over the SAME store/secret, then unlock.
      const machine2 = createIdentityMachine({ crypto: realCrypto, secret, store });
      await machine2.init();
      await machine2.unlock();
      const state = machine2.getState();
      if (state.status !== "unlocked") throw new Error("expected unlocked");

      // Active is the NEW key; retired holds the OLD key, unwrapped and ready.
      expect(state.publicKeyString).not.toBe(oldPk);
      expect(state.retiredKeypairs).toHaveLength(1);
      const recovered = await decryptWithKeyFallback(allPrivateKeysForDecrypt(state), (key) =>
        openWithKey(ciphertext, key),
      );
      expect(new TextDecoder().decode(recovered)).toBe("legacy-after-relock");
    },
    CRYPTO_TIMEOUT,
  );
});
