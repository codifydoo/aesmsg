# Mobile On-Device Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory mocks in `apps/mobile` (contacts, sent-links, settings) with real, encrypted, on-device persistence and make those features genuinely functional; wire the biometric onboarding screen as a one-time post-setup education + persisted-preference step.

**Architecture:** A generic `EncryptedStore` (AES-256-GCM JSON blobs via `crypto.subtle`, backed by `expo-file-system`, keyed by domain) sits over one shared device-only DEK held in `expo-secure-store`. Per-domain stores (contacts, sent-links, settings) mirror the existing web stores and feed thin React screens/providers; settings values drive real behaviors (auto-lock, privacy shield, clipboard auto-clear, screenshot block).

**Tech Stack:** Expo SDK 56 / React Native 0.85 / React 19; `expo-file-system`, `expo-secure-store`, `expo-screen-capture`, `expo-clipboard`, `expo-local-authentication`, `crypto.subtle` (react-native-quick-crypto + expo-standard-web-crypto); Vitest (node-env, native modules mocked); `@aesmsg/crypto`.

**Spec:** `docs/superpowers/specs/2026-05-31-mobile-persistence-design.md`

---

## Execution order & shared files

Run phases **in order 1 → 5**. Phase 1 (storage foundation) is a hard dependency for
Phases 2–4; Phase 5 depends on Phase 4's `SettingsRecord`/`useSettings`.

A few files accrete edits across phases — apply them additively in phase order:
- `apps/mobile/App.tsx` — Phase 4 wraps the tree in `SettingsProvider` (above
  `IdentityProvider`); Phase 5 adds the one-time post-setup biometric routing.
- `apps/mobile/src/create/create-and-seal.ts` — Phase 2 leaves it unchanged
  (contact recipients now carry a real public key); Phase 3 adds the
  `recordSentLink(...)` call after a successful post.
- `apps/mobile/tests/setup.ts` — Phase 1 creates the storage reset; Phases 2/3/4
  append their per-store cleanup hooks.
- `apps/mobile/src/settings/settings-format.ts` — already exists; Phase 4 **appends**
  the settings model + validators (keeps `formatFingerprintGroups` /
  `clampClipboardSeconds`).

---

## Phase 1: Storage foundation — encrypted on-device blob store

> Creates the generic `EncryptedStore` (AES-256-GCM JSON blobs via `crypto.subtle`,
> backed by `expo-file-system`) over one shared device-only DEK in `expo-secure-store`,
> plus `getEncryptedStore()` and a test reset. Fully node-testable in isolation with a
> Map-backed blob store and real crypto — no dependency on other phases.

### Task 1.1: Storage types + `DecryptionError` (`encrypted-store.types.ts`)

**Files:**
- Create: `apps/mobile/src/storage/encrypted-store.types.ts`
- Test: `apps/mobile/tests/encrypted-store-types.test.ts`

This is the contract module: the DI seam interfaces (`IBlobStore`, `ISecureStore`), the options bag, and the typed `DecryptionError` that the rest of the phase imports. It has no runtime dependencies, so a tiny test pins the error's identity contract.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { DecryptionError } from "@/src/storage/encrypted-store.types";

describe("DecryptionError", () => {
  it("is an Error subclass with a stable name and the given message", () => {
    const err = new DecryptionError("blob for key \"contacts\" failed to decrypt");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DecryptionError);
    expect(err.name).toBe("DecryptionError");
    expect(err.message).toBe('blob for key "contacts" failed to decrypt');
  });

  it("is catchable as a DecryptionError after being thrown", () => {
    try {
      throw new DecryptionError("tampered");
    } catch (e) {
      expect(e instanceof DecryptionError).toBe(true);
    }
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/encrypted-store-types.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/storage/encrypted-store.types\"" (the module does not exist yet).
- [ ] **Step 3: Write the implementation**
```ts
// Contract module for the encrypted storage layer. No runtime dependencies, no React, no
// native modules — only types and the typed error, so every other storage file (and the
// domain stores in later phases) can import these without pulling in expo-* surfaces.

// Minimal key/value blob backend. Production is backed by expo-file-system (one .enc file per
// key); node tests inject an in-memory Map. Values are opaque base64 strings — the EncryptedStore
// owns all crypto, the blob store only persists bytes-as-string.
export interface IBlobStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  // Remove every key this store owns (used by EncryptedStore.clear() and identity wipe).
  clear(): Promise<void>;
  // Enumerate currently-stored keys so clear() can delete every namespace blob.
  keys(): Promise<string[]>;
}

// Minimal keychain surface used to hold the DEK. Production is expo-secure-store; node tests
// inject an in-memory implementation. The accessibility class is passed through verbatim so the
// DEK is pinned device-local (see data-key.ts).
export interface ISecureStoreOptions {
  keychainAccessible?: unknown;
  requireAuthentication?: boolean;
}

export interface ISecureStore {
  getItemAsync(key: string, options?: ISecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: ISecureStoreOptions): Promise<void>;
  deleteItemAsync(key: string, options?: ISecureStoreOptions): Promise<void>;
}

// Source of cryptographically-strong random bytes. Production wires crypto.getRandomValues
// (installed on Hermes by the Web Crypto polyfill at app entry, mirroring device-secret.ts and
// link-id.ts); node tests can pass the real ambient implementation. Returns a fresh Uint8Array.
export type RandomBytes = (length: number) => Uint8Array;

export interface EncryptedStoreOptions {
  // The blob backend (file-system in prod, Map in tests).
  blobStore: IBlobStore;
  // The raw 256-bit AES-GCM key material. The EncryptedStore never derives or stores it; the
  // caller (getEncryptedStore) obtains it from getOrCreateDEK().
  dek: Uint8Array;
  // Random nonce source. Defaults to crypto.getRandomValues when omitted.
  randomBytes?: RandomBytes;
}

// Thrown when a stored blob cannot be authenticated/decrypted: GCM auth-tag mismatch (tamper),
// malformed framing, or a wrong/rotated DEK. Distinct from @aesmsg/crypto's DecryptionError —
// this is the storage-layer domain error, surfaced as a non-fatal "couldn't load" UI state, never
// a silent wipe and never a startup crash.
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/encrypted-store-types.test.ts`
Expected: PASS (2 tests).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/storage/encrypted-store.types.ts apps/mobile/tests/encrypted-store-types.test.ts && git commit -m "feat(mobile): storage contract types + DecryptionError"
```

---

### Task 1.2: `EncryptedStore` — AES-256-GCM JSON blobs (`encrypted-store.ts`)

**Files:**
- Create: `apps/mobile/src/storage/encrypted-store.ts`
- Test: `apps/mobile/tests/encrypted-store.test.ts`

The heart of the phase: `getJson` / `setJson` / `remove` / `clear`. JSON-serialize → AES-256-GCM seal with a fresh random 12-byte nonce → frame as `base64(nonce ‖ ciphertext+tag)`. Tamper → `DecryptionError`; missing key → `null`. DI'd `IBlobStore` + raw DEK + `randomBytes`, so the test runs REAL `crypto.subtle` against an in-memory `Map`.

- [ ] **Step 1: Write the failing test**
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { EncryptedStore } from "@/src/storage/encrypted-store";
import { DecryptionError, type IBlobStore } from "@/src/storage/encrypted-store.types";

// In-memory blob backend, swapped for expo-file-system in production. One Map per test (cleared in
// beforeEach) gives byte-for-byte the same get/set/remove/clear/keys contract the device backend has.
function makeMapBlobStore(): IBlobStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async get(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

// A fixed, valid 256-bit key — REAL crypto.subtle AES-GCM runs against it (Node 22 supplies
// globalThis.crypto.subtle natively, so no polyfill is needed in node-env tests).
function makeDek(): Uint8Array {
  const dek = new Uint8Array(32);
  for (let i = 0; i < 32; i++) dek[i] = (i * 7 + 3) & 0xff;
  return dek;
}

describe("EncryptedStore", () => {
  let blob: ReturnType<typeof makeMapBlobStore>;
  let store: EncryptedStore;

  beforeEach(() => {
    blob = makeMapBlobStore();
    store = new EncryptedStore({ blobStore: blob, dek: makeDek() });
  });

  it("round-trips a JSON value through encrypt -> decrypt", async () => {
    const value = { label: "Acme prod key", verified: true, n: 42, list: ["a", "b"] };
    await store.setJson("contacts", value);
    const loaded = await store.getJson<typeof value>("contacts");
    expect(loaded).toEqual(value);
  });

  it("returns null for a key that was never written", async () => {
    expect(await store.getJson("settings")).toBeNull();
  });

  it("persists ciphertext, not plaintext (no recognizable substring leaks)", async () => {
    await store.setJson("contacts", { secretLabel: "TOP-SECRET-RECIPIENT" });
    const raw = blob.map.get("contacts");
    expect(typeof raw).toBe("string");
    expect(raw).not.toContain("TOP-SECRET-RECIPIENT");
    expect(raw).not.toContain("secretLabel");
  });

  it("uses a fresh nonce per write: same value encrypts to different blobs", async () => {
    const value = { x: 1 };
    await store.setJson("a", value);
    const first = blob.map.get("a");
    await store.setJson("a", value);
    const second = blob.map.get("a");
    expect(first).not.toBe(second);
    // ...and the latest still decrypts back to the same plaintext.
    expect(await store.getJson("a")).toEqual(value);
  });

  it("throws DecryptionError when the stored blob is tampered", async () => {
    await store.setJson("contacts", { label: "x" });
    const raw = blob.map.get("contacts") as string;
    // Flip a character in the body (past the nonce) to break the GCM auth tag.
    const tampered = raw.slice(0, -2) + (raw.endsWith("A") ? "B" : "A") + raw.slice(-1);
    blob.map.set("contacts", tampered);
    await expect(store.getJson("contacts")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError when the framing is malformed (too short to hold a nonce)", async () => {
    blob.map.set("contacts", "QUJD"); // base64 "ABC" — 3 bytes, shorter than the 12-byte nonce
    await expect(store.getJson("contacts")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError when decrypted with a different DEK", async () => {
    await store.setJson("contacts", { label: "x" });
    const otherDek = new Uint8Array(32).fill(9);
    const otherStore = new EncryptedStore({ blobStore: blob, dek: otherDek });
    await expect(otherStore.getJson("contacts")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("isolates namespaces: writing one key does not affect another", async () => {
    await store.setJson("contacts", { kind: "contacts" });
    await store.setJson("sent-links", { kind: "links" });
    await store.setJson("settings", { kind: "settings" });
    expect(await store.getJson("contacts")).toEqual({ kind: "contacts" });
    expect(await store.getJson("sent-links")).toEqual({ kind: "links" });
    expect(await store.getJson("settings")).toEqual({ kind: "settings" });
  });

  it("remove deletes a single key, leaving others intact", async () => {
    await store.setJson("contacts", { a: 1 });
    await store.setJson("settings", { b: 2 });
    await store.remove("contacts");
    expect(await store.getJson("contacts")).toBeNull();
    expect(await store.getJson("settings")).toEqual({ b: 2 });
  });

  it("clear removes every key", async () => {
    await store.setJson("contacts", { a: 1 });
    await store.setJson("sent-links", { b: 2 });
    await store.clear();
    expect(await store.getJson("contacts")).toBeNull();
    expect(await store.getJson("sent-links")).toBeNull();
    expect(blob.map.size).toBe(0);
  });

  it("uses the injected randomBytes for the nonce (12 bytes per write)", async () => {
    const calls: number[] = [];
    const fixed = new Uint8Array(12).fill(1);
    const injected = new EncryptedStore({
      blobStore: blob,
      dek: makeDek(),
      randomBytes: (n) => {
        calls.push(n);
        return fixed.slice(0, n);
      },
    });
    await injected.setJson("a", { ok: true });
    expect(calls).toEqual([12]);
    expect(await injected.getJson("a")).toEqual({ ok: true });
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/encrypted-store.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/storage/encrypted-store\"" (the module does not exist yet).
- [ ] **Step 3: Write the implementation**
```ts
// AES-256-GCM JSON blob store. No React, no domain knowledge, no native modules — the blob
// backend, the raw DEK, and the random source are all injected (see EncryptedStoreOptions). Wire
// framing is base64( nonce[12] ‖ ciphertext+tag ), one frame per stored key.
import { base64ToBytes, bytesToBase64 } from "@/src/lib/base64";
import {
  DecryptionError,
  type EncryptedStoreOptions,
  type IBlobStore,
  type RandomBytes,
} from "@/src/storage/encrypted-store.types";

// AES-GCM standard nonce length. 12 bytes is the GCM-recommended IV size; we generate a fresh one
// per write (nonce reuse under a fixed key is catastrophic for GCM, so this is non-negotiable).
const NONCE_LEN = 12;

// Default random source: the Web Crypto getRandomValues installed on Hermes at app entry, and
// present natively under Node 22 test runs. Mirrors device-secret.ts / link-id.ts.
const defaultRandomBytes: RandomBytes = (length) => {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
};

export class EncryptedStore {
  private readonly blobStore: IBlobStore;
  private readonly dek: Uint8Array;
  private readonly randomBytes: RandomBytes;
  // Cached CryptoKey so subtle.importKey runs once, not on every read/write.
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(options: EncryptedStoreOptions) {
    this.blobStore = options.blobStore;
    this.dek = options.dek;
    this.randomBytes = options.randomBytes ?? defaultRandomBytes;
  }

  private async cryptoKey(): Promise<CryptoKey> {
    if (this.keyPromise === null) {
      // Copy into a fresh ArrayBuffer-backed view so importKey gets a clean BufferSource.
      const raw = new Uint8Array(this.dek);
      this.keyPromise = crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt",
      ]);
    }
    return this.keyPromise;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const framed = await this.blobStore.get(key);
    if (framed === null) return null;

    let frame: Uint8Array;
    try {
      frame = base64ToBytes(framed);
    } catch {
      throw new DecryptionError(`blob for key "${key}" has invalid base64 framing`);
    }
    if (frame.length <= NONCE_LEN) {
      throw new DecryptionError(`blob for key "${key}" is too short to contain a nonce`);
    }

    const nonce = frame.subarray(0, NONCE_LEN);
    const body = frame.subarray(NONCE_LEN);
    const cryptoKey = await this.cryptoKey();

    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, body);
    } catch {
      // GCM auth-tag mismatch (tamper), wrong DEK, or truncated body all land here.
      throw new DecryptionError(`blob for key "${key}" failed to decrypt`);
    }

    try {
      const json = new TextDecoder().decode(plaintext);
      return JSON.parse(json) as T;
    } catch {
      // Authenticated bytes that are nevertheless not valid JSON: treat as corruption, not a crash.
      throw new DecryptionError(`blob for key "${key}" decrypted to invalid JSON`);
    }
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const nonce = this.randomBytes(NONCE_LEN);
    const cryptoKey = await this.cryptoKey();
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, plaintext),
    );
    const frame = new Uint8Array(nonce.length + cipher.length);
    frame.set(nonce, 0);
    frame.set(cipher, nonce.length);
    await this.blobStore.set(key, bytesToBase64(frame));
  }

  async remove(key: string): Promise<void> {
    await this.blobStore.remove(key);
  }

  async clear(): Promise<void> {
    await this.blobStore.clear();
  }
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/encrypted-store.test.ts`
Expected: PASS (all cases: round-trip, null, ciphertext-only, nonce uniqueness, tamper, malformed framing, wrong DEK, namespace isolation, remove, clear, injected randomBytes).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/storage/encrypted-store.ts apps/mobile/tests/encrypted-store.test.ts && git commit -m "feat(mobile): EncryptedStore AES-256-GCM JSON blobs (DI blob store + DEK)"
```

---

### Task 1.3: Data-encryption key — `getOrCreateDEK` / `deleteDEK` (`data-key.ts`)

**Files:**
- Create: `apps/mobile/src/storage/data-key.ts`
- Test: `apps/mobile/tests/data-key.test.ts`

The 256-bit shared DEK lives in the keychain under `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and explicitly NOT `requireAuthentication` (routine startup metadata reads must never trigger a biometric prompt). `getOrCreateDEK` is idempotent (returns the same bytes across calls); `deleteDEK` removes it so the next call regenerates a fresh one. The keychain and random source are DI'd, so the test asserts the accessibility flags and idempotency against an in-memory keychain.

- [ ] **Step 1: Write the failing test**
```ts
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
    const dek = await getOrCreateDEK({ secureStore: kc, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY, randomBytes: makeRandom(1) });
    expect(dek).toBeInstanceOf(Uint8Array);
    expect(dek.length).toBe(32);
  });

  it("is idempotent: a second call returns the same key bytes and does not regenerate", async () => {
    const kc = makeKeychain();
    const first = await getOrCreateDEK({ secureStore: kc, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY, randomBytes: makeRandom(1) });
    const second = await getOrCreateDEK({ secureStore: kc, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY, randomBytes: makeRandom(99) });
    expect([...second]).toEqual([...first]);
    // setItemAsync ran only on the first (generating) call.
    expect(kc.setSpy).toHaveBeenCalledTimes(1);
  });

  it("stores the DEK device-local: WHEN_UNLOCKED_THIS_DEVICE_ONLY and NOT requireAuthentication", async () => {
    const kc = makeKeychain();
    await getOrCreateDEK({ secureStore: kc, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY, randomBytes: makeRandom(1) });
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
    const created = await getOrCreateDEK({ secureStore: kc1, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY, randomBytes: makeRandom(7) });
    // Same backing kv map, new keychain object: simulates a later app launch.
    const kc2 = makeKeychain();
    const reloaded = await getOrCreateDEK({ secureStore: kc2, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY, randomBytes: makeRandom(7) });
    expect([...reloaded]).toEqual([...created]);
    expect(kc2.setSpy).not.toHaveBeenCalled();
    expect(kc2.getSpy).toHaveBeenCalled();
  });

  it("deleteDEK removes the key so the next getOrCreateDEK regenerates a fresh one", async () => {
    const kc = makeKeychain();
    const first = await getOrCreateDEK({ secureStore: kc, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY, randomBytes: makeRandom(1) });
    await deleteDEK({ secureStore: kc, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    expect(kc.deleteSpy).toHaveBeenCalledWith(
      "aesmsg.data-key",
      expect.objectContaining({ keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    );
    const regenerated = await getOrCreateDEK({ secureStore: kc, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY, randomBytes: makeRandom(200) });
    expect([...regenerated]).not.toEqual([...first]);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/data-key.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/storage/data-key\"" (the module does not exist yet).
- [ ] **Step 3: Write the implementation**
```ts
// The single app-level data-encryption key (DEK): 256 bits, generated once, held in the hardware
// keychain. Domains (contacts / sent-links / settings) share THIS one key and are separated only
// by the EncryptedStore's key namespace — see the design's "generated once" decision.
//
// Accessibility: WHEN_UNLOCKED_THIS_DEVICE_ONLY (no iCloud-Keychain sync, not carried into device
// backups) and explicitly NOT requireAuthentication — the DEK is deliberately NOT biometric-gated
// so routine metadata reads at app startup never trigger a Face ID prompt. It is a SEPARATE key
// from the biometric-gated device secret (device-secret.ts) that wraps the private key.
import { base64ToBytes, bytesToBase64 } from "@/src/lib/base64";
import type { ISecureStore, RandomBytes } from "@/src/storage/encrypted-store.types";

const DATA_KEY_STORE_KEY = "aesmsg.data-key";
const DEK_BYTES = 32; // 256-bit AES key

const defaultRandomBytes: RandomBytes = (length) => {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
};

export interface DataKeyDeps {
  secureStore: ISecureStore;
  // The native WHEN_UNLOCKED_THIS_DEVICE_ONLY constant, injected so node tests can pass a Symbol
  // sentinel and assert it was threaded through (mirrors device-secret.ts SECURE_OPTIONS).
  accessibleWhenUnlockedThisDeviceOnly: unknown;
  randomBytes?: RandomBytes;
}

// Idempotent: returns the existing DEK if one is stored, otherwise generates, persists, and
// returns a fresh 256-bit key. Never prompts biometrics.
export async function getOrCreateDEK(deps: DataKeyDeps): Promise<Uint8Array> {
  const options = {
    keychainAccessible: deps.accessibleWhenUnlockedThisDeviceOnly,
    requireAuthentication: false,
  };
  const existing = await deps.secureStore.getItemAsync(DATA_KEY_STORE_KEY, options);
  if (existing !== null) {
    return base64ToBytes(existing);
  }
  const random = deps.randomBytes ?? defaultRandomBytes;
  const dek = random(DEK_BYTES);
  await deps.secureStore.setItemAsync(DATA_KEY_STORE_KEY, bytesToBase64(dek), options);
  return dek;
}

// Removes the DEK from the keychain. After this, getOrCreateDEK regenerates a new one — which
// makes any already-stored encrypted blobs permanently unreadable. Called by the identity wipe so
// a wipe leaves no decryptable metadata residue.
export async function deleteDEK(
  deps: Pick<DataKeyDeps, "secureStore" | "accessibleWhenUnlockedThisDeviceOnly">,
): Promise<void> {
  await deps.secureStore.deleteItemAsync(DATA_KEY_STORE_KEY, {
    keychainAccessible: deps.accessibleWhenUnlockedThisDeviceOnly,
    requireAuthentication: false,
  });
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/data-key.test.ts`
Expected: PASS (32-byte length, idempotency, accessibility flags, reload round-trip, delete→regenerate).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/storage/data-key.ts apps/mobile/tests/data-key.test.ts && git commit -m "feat(mobile): shared device-only DEK (getOrCreateDEK idempotent + deleteDEK)"
```

---

### Task 1.4: File-system blob backend (`file-blob-store.ts`)

**Files:**
- Create: `apps/mobile/src/storage/file-blob-store.ts`
- Test: `apps/mobile/tests/file-blob-store.test.ts`

The production `IBlobStore` over `expo-file-system`: one `.enc` file per key under `${documentDirectory}aesmsg/`. The expo-file-system surface (SDK 56 `/legacy` string-URI helpers: `documentDirectory`, `getInfoAsync`, `makeDirectoryAsync`, `readAsStringAsync`, `writeAsStringAsync`, `deleteAsync`, `readDirectoryAsync`, `EncodingType.UTF8`) is DI'd via a `FileSystemLike` interface, exactly as `attachment-cache.ts` does — so the test injects an in-memory fake. Missing file → `null`; `keys()` lists the `.enc` files (stripping the extension); filenames are URI-encoded so a namespace can never escape the directory.

- [ ] **Step 1: Write the failing test**
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore, type FileSystemLike } from "@/src/storage/file-blob-store";

// In-memory fake of the minimal expo-file-system/legacy surface FileBlobStore needs. Mirrors how
// reader-cache-cleanup.test.ts fakes FileSystemLike — no native module loads under node.
function makeFakeFs(documentDirectory = "file:///docs/"): FileSystemLike & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    documentDirectory,
    EncodingType: { UTF8: "utf8", Base64: "base64" },
    async getInfoAsync(uri) {
      const exists = files.has(uri) || dirs.has(uri.replace(/\/$/, "")) || dirs.has(uri);
      return { exists };
    },
    async makeDirectoryAsync(uri) {
      dirs.add(uri.replace(/\/$/, ""));
    },
    async readAsStringAsync(uri) {
      if (!files.has(uri)) throw new Error(`ENOENT ${uri}`);
      return files.get(uri) as string;
    },
    async writeAsStringAsync(uri, contents) {
      files.set(uri, contents);
    },
    async deleteAsync(uri) {
      files.delete(uri);
    },
    async readDirectoryAsync(uri) {
      const prefix = uri.endsWith("/") ? uri : `${uri}/`;
      return [...files.keys()]
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length));
    },
  };
}

describe("FileBlobStore", () => {
  let fs: ReturnType<typeof makeFakeFs>;
  let store: FileBlobStore;

  beforeEach(() => {
    fs = makeFakeFs();
    store = new FileBlobStore(fs);
  });

  it("set then get round-trips the string under aesmsg/<key>.enc", async () => {
    await store.set("contacts", "BLOB-DATA");
    expect(fs.files.get("file:///docs/aesmsg/contacts.enc")).toBe("BLOB-DATA");
    expect(await store.get("contacts")).toBe("BLOB-DATA");
  });

  it("get returns null for a key that was never written", async () => {
    expect(await store.get("settings")).toBeNull();
  });

  it("ensures the aesmsg directory exists before writing", async () => {
    await store.set("contacts", "x");
    expect(fs.dirs.has("file:///docs/aesmsg")).toBe(true);
  });

  it("remove deletes one key's file, leaving others", async () => {
    await store.set("contacts", "a");
    await store.set("settings", "b");
    await store.remove("contacts");
    expect(await store.get("contacts")).toBeNull();
    expect(await store.get("settings")).toBe("b");
  });

  it("remove of a missing key is a no-op (does not throw)", async () => {
    await expect(store.remove("never-written")).resolves.toBeUndefined();
  });

  it("keys lists stored namespaces with the .enc extension stripped", async () => {
    await store.set("contacts", "a");
    await store.set("sent-links", "b");
    await store.set("settings", "c");
    expect((await store.keys()).sort()).toEqual(["contacts", "sent-links", "settings"]);
  });

  it("keys returns an empty list when the directory does not exist yet", async () => {
    expect(await store.keys()).toEqual([]);
  });

  it("clear removes every stored blob", async () => {
    await store.set("contacts", "a");
    await store.set("sent-links", "b");
    await store.clear();
    expect(await store.get("contacts")).toBeNull();
    expect(await store.get("sent-links")).toBeNull();
    expect(await store.keys()).toEqual([]);
  });

  it("URI-encodes the key so it cannot escape the aesmsg directory", async () => {
    await store.set("../evil", "x");
    // The slash is percent-encoded, so the file stays inside aesmsg/.
    const written = [...fs.files.keys()][0] as string;
    expect(written.startsWith("file:///docs/aesmsg/")).toBe(true);
    expect(written.includes("/../")).toBe(false);
    expect(await store.get("../evil")).toBe("x");
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/file-blob-store.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/storage/file-blob-store\"" (the module does not exist yet).
- [ ] **Step 3: Write the implementation**
```ts
// IBlobStore over expo-file-system: one encrypted blob per key as a UTF-8 file under
// ${documentDirectory}aesmsg/<key>.enc. The file contents are already base64( nonce ‖ ct+tag )
// produced by EncryptedStore, so they are written as plain UTF-8 strings — this module never
// touches crypto. The native module is injected (FileSystemLike) so node tests use an in-memory
// fake, exactly as attachment-cache.ts does. We use the SDK 56 `/legacy` string-URI helpers.
import type { IBlobStore } from "@/src/storage/encrypted-store.types";

// Minimal surface of expo-file-system/legacy this store needs. SDK 56 moved the string-URI helpers
// (documentDirectory, *AsStringAsync, getInfoAsync, makeDirectoryAsync, readDirectoryAsync,
// EncodingType) onto the `/legacy` subpath; the new default export is the File/Paths API.
export interface FileSystemLike {
  readonly documentDirectory: string | null;
  readonly EncodingType: { readonly UTF8: string };
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  readDirectoryAsync(uri: string): Promise<string[]>;
}

const SUBDIR = "aesmsg";
const EXT = ".enc";

export class FileBlobStore implements IBlobStore {
  constructor(private readonly fs: FileSystemLike) {}

  private dirUri(): string {
    const base = this.fs.documentDirectory;
    if (base === null) {
      throw new Error("expo-file-system documentDirectory is unavailable");
    }
    return `${base}${SUBDIR}/`;
  }

  // Percent-encode the key so a namespace containing "/" or ".." can never escape aesmsg/.
  private fileUri(key: string): string {
    return `${this.dirUri()}${encodeURIComponent(key)}${EXT}`;
  }

  private async ensureDir(): Promise<void> {
    const dir = this.dirUri();
    const info = await this.fs.getInfoAsync(dir);
    if (!info.exists) {
      await this.fs.makeDirectoryAsync(dir, { intermediates: true });
    }
  }

  async get(key: string): Promise<string | null> {
    const uri = this.fileUri(key);
    const info = await this.fs.getInfoAsync(uri);
    if (!info.exists) return null;
    return this.fs.readAsStringAsync(uri, { encoding: this.fs.EncodingType.UTF8 });
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureDir();
    await this.fs.writeAsStringAsync(this.fileUri(key), value, {
      encoding: this.fs.EncodingType.UTF8,
    });
  }

  async remove(key: string): Promise<void> {
    await this.fs.deleteAsync(this.fileUri(key), { idempotent: true });
  }

  async keys(): Promise<string[]> {
    const dir = this.dirUri();
    const info = await this.fs.getInfoAsync(dir);
    if (!info.exists) return [];
    const entries = await this.fs.readDirectoryAsync(dir);
    return entries
      .filter((name) => name.endsWith(EXT))
      .map((name) => decodeURIComponent(name.slice(0, -EXT.length)));
  }

  async clear(): Promise<void> {
    for (const key of await this.keys()) {
      await this.remove(key);
    }
  }
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/file-blob-store.test.ts`
Expected: PASS (round-trip, missing→null, dir creation, single remove, no-op remove, keys list, empty keys, clear, path-escape encoding).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/storage/file-blob-store.ts apps/mobile/tests/file-blob-store.test.ts && git commit -m "feat(mobile): expo-file-system IBlobStore backend (aesmsg/<key>.enc)"
```

---

### Task 1.5: Keychain `ISecureStore` adapter (`secure-store-impl.ts`)

**Files:**
- Create: `apps/mobile/src/storage/secure-store-impl.ts`
- Test: `apps/mobile/tests/secure-store-impl.test.ts`

A thin adapter exposing `expo-secure-store` as the DI'd `ISecureStore` and exporting `WHEN_UNLOCKED_THIS_DEVICE_ONLY` for `getOrCreateDEK` to thread through. Mirrors the existing `secure-store.test.ts` mocking pattern: `vi.hoisted` Map + a Symbol sentinel for the accessibility class. The test confirms the adapter forwards calls and accessibility constant faithfully.

- [ ] **Step 1: Write the failing test**
```ts
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

    await secureStore.setItemAsync("aesmsg.data-key", "VALUE", { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "aesmsg.data-key",
      "VALUE",
      { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY },
    );
    expect(await secureStore.getItemAsync("aesmsg.data-key")).toBe("VALUE");

    await secureStore.deleteItemAsync("aesmsg.data-key");
    expect(await secureStore.getItemAsync("aesmsg.data-key")).toBeNull();
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/secure-store-impl.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/storage/secure-store-impl\"" (the module does not exist yet).
- [ ] **Step 3: Write the implementation**
```ts
// Production ISecureStore adapter over expo-secure-store. Kept as a paper-thin pass-through so the
// rest of the storage layer depends only on the ISecureStore interface (and node tests inject a
// Map). WHEN_UNLOCKED_THIS_DEVICE_ONLY is re-exported so getEncryptedStore can hand it to the DEK
// module without every caller importing expo-secure-store directly.
import * as SecureStore from "expo-secure-store";
import type { ISecureStore, ISecureStoreOptions } from "@/src/storage/encrypted-store.types";

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

export const secureStore: ISecureStore = {
  getItemAsync(key: string, options?: ISecureStoreOptions) {
    return SecureStore.getItemAsync(key, options as SecureStore.SecureStoreOptions);
  },
  setItemAsync(key: string, value: string, options?: ISecureStoreOptions) {
    return SecureStore.setItemAsync(key, value, options as SecureStore.SecureStoreOptions);
  },
  deleteItemAsync(key: string, options?: ISecureStoreOptions) {
    return SecureStore.deleteItemAsync(key, options as SecureStore.SecureStoreOptions);
  },
};
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/secure-store-impl.test.ts`
Expected: PASS (constant re-export + set/get/delete forwarding round-trip).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/storage/secure-store-impl.ts apps/mobile/tests/secure-store-impl.test.ts && git commit -m "feat(mobile): expo-secure-store ISecureStore adapter"
```

---

### Task 1.6: Singleton wiring + barrel (`index.ts`) and test reset hook

**Files:**
- Create: `apps/mobile/src/storage/index.ts`
- Create: `apps/mobile/tests/setup.ts`
- Modify: `apps/mobile/vitest.config.ts:6-12`

`getEncryptedStore()` lazily wires the production backends (`FileBlobStore` over `expo-file-system/legacy` + the DEK from the keychain) into a single shared `EncryptedStore` and memoizes it. It also exposes `__resetEncryptedStoreForTests()` so the (new) `tests/setup.ts` clears the singleton between cases (per the design's "tests/setup.ts clears every store between cases"). Because this module imports the native `expo-secure-store` adapter and `expo-file-system/legacy`, the singleton wiring itself is verified on the iOS simulator; only the reset hook and barrel re-exports are node-tested. `vitest.config.ts` gains a `setupFiles` entry pointing at the new setup file.

`vitest.config.ts` currently reads (lines 6-12):
```ts
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 1: Write the failing test**
```ts
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
  getInfoAsync: vi.fn(async (uri: string) => ({ exists: files.has(uri) || uri.endsWith("aesmsg/") })),
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
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/storage-index.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/storage\"" (the barrel does not exist yet). (Save this test as `apps/mobile/tests/storage-index.test.ts`.)
- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/storage/index.ts`:
```ts
// Barrel + production singleton wiring for the encrypted storage layer.
//
// getEncryptedStore() composes the real backends — FileBlobStore over expo-file-system/legacy and
// the shared DEK obtained from the hardware keychain via getOrCreateDEK — into ONE shared
// EncryptedStore, memoized for the app's lifetime. Domain stores (contacts / sent-links / settings)
// call getEncryptedStore() and separate themselves by key namespace; they never construct an
// EncryptedStore directly.
import * as LegacyFileSystem from "expo-file-system/legacy";
import { deleteDEK, getOrCreateDEK } from "@/src/storage/data-key";
import { EncryptedStore } from "@/src/storage/encrypted-store";
import { DecryptionError } from "@/src/storage/encrypted-store.types";
import { FileBlobStore, type FileSystemLike } from "@/src/storage/file-blob-store";
import { secureStore, WHEN_UNLOCKED_THIS_DEVICE_ONLY } from "@/src/storage/secure-store-impl";

export { EncryptedStore } from "@/src/storage/encrypted-store";
export { DecryptionError } from "@/src/storage/encrypted-store.types";
export type {
  EncryptedStoreOptions,
  IBlobStore,
  ISecureStore,
  RandomBytes,
} from "@/src/storage/encrypted-store.types";
export { deleteDEK, getOrCreateDEK } from "@/src/storage/data-key";
export { FileBlobStore } from "@/src/storage/file-blob-store";

let instance: Promise<EncryptedStore> | null = null;

async function buildEncryptedStore(): Promise<EncryptedStore> {
  const blobStore = new FileBlobStore(LegacyFileSystem as unknown as FileSystemLike);
  const dek = await getOrCreateDEK({
    secureStore,
    accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return new EncryptedStore({ blobStore, dek });
}

// Singleton accessor: builds the wired store once and reuses it. Concurrent callers during the
// initial build share the same in-flight promise (no double DEK fetch).
export async function getEncryptedStore(): Promise<EncryptedStore> {
  if (instance === null) {
    instance = buildEncryptedStore();
  }
  return instance;
}

// Wipe every encrypted blob AND the DEK so leftover metadata cannot be decrypted after an identity
// wipe. Resets the singleton so the next getEncryptedStore() regenerates a fresh DEK + store.
export async function wipeEncryptedStorage(): Promise<void> {
  const store = await getEncryptedStore();
  await store.clear();
  await deleteDEK({ secureStore, accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  instance = null;
}

// Test-only: drop the memoized singleton so each test (via tests/setup.ts) starts fresh.
export function __resetEncryptedStoreForTests(): void {
  instance = null;
}
```

Create `apps/mobile/tests/setup.ts`:
```ts
import { beforeEach } from "vitest";
import { __resetEncryptedStoreForTests } from "@/src/storage";

// Global per-test reset: drop the memoized EncryptedStore singleton so domain-store tests (contacts,
// sent-links, settings — added in later phases) never leak state across cases. Domain stores obtain
// their store via getEncryptedStore(); clearing the singleton here is the single shared reset point.
beforeEach(() => {
  __resetEncryptedStoreForTests();
});
```

Modify `apps/mobile/vitest.config.ts` lines 6-12 — add `setupFiles`:
```ts
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/storage-index.test.ts`
Expected: PASS (memoization, end-to-end round-trip through mocked backends, reset forces a fresh instance, barrel re-exports).
- [ ] **Step 5: Verify the whole mobile suite still passes (setupFiles wiring did not break existing tests)**
Run: `pnpm --filter @aesmsg/mobile test`
Expected: PASS — all pre-existing tests plus the six new storage tests. (`tests/setup.ts` only imports `@/src/storage`, whose native deps are mocked in the storage tests and never loaded by other tests because `__resetEncryptedStoreForTests` touches no native module.)
- [ ] **Step 6: Verify the wired singleton on the iOS simulator**

Manual checklist (the singleton imports native `expo-secure-store` + `expo-file-system/legacy`, which cannot run under node):
- [ ] Boot the dev build on the iOS simulator with the mobile crypto polyfill installed (per the existing iOS build recipe).
- [ ] In a temporary debug entry point, call `const s = await getEncryptedStore(); await s.setJson("contacts", {ping: 1}); console.log(await s.getJson("contacts"));` and confirm it logs `{ ping: 1 }`.
- [ ] Confirm a file `aesmsg/contacts.enc` exists under the app document directory and its contents are opaque base64 (no plaintext `ping`).
- [ ] Relaunch the app and confirm `getJson("contacts")` still returns `{ ping: 1 }` (DEK persisted, not regenerated).
- [ ] Confirm `getEncryptedStore()` does NOT trigger a Face ID / biometric prompt at startup (DEK is `requireAuthentication: false`).
- [ ] Call `wipeEncryptedStorage()` and confirm `getJson("contacts")` returns `null` afterward.
- [ ] **Step 7: Commit**
```bash
git add apps/mobile/src/storage/index.ts apps/mobile/tests/setup.ts apps/mobile/tests/storage-index.test.ts apps/mobile/vitest.config.ts && git commit -m "feat(mobile): getEncryptedStore singleton + wipeEncryptedStorage + tests/setup reset"
```

---

## Phase 2: Contacts (functional)

> Replaces the presentational in-memory contacts mock with a real, encrypted-at-rest contact directory. Ships `src/contacts/contacts-store.ts` (mirroring web's `apps/web/src/lib/contacts-store.ts` API + 5 error types verbatim, backed by Phase 1's `getEncryptedStore()` under blob key `"contacts"`) and the pure `src/contacts/contacts-display.ts` derivation module, both unit-tested under node-env Vitest with real `@aesmsg/crypto` fingerprints and a mocked keychain/blob store. Then wires the create flow (contacts now carry a real `publicKey`, so the seal path is identical to the paste path), the recipient picker, the contacts tab screens (read/write through the store + empty state), and a "Save as contact" CTA on `ResultScreen` — each non-testable screen edit ending in a manual iOS-simulator verification step.

## Phase 2 — Contacts (functional)

> **Dependency note:** Every store task consumes Phase 1's canonical API
> `getEncryptedStore(): Promise<EncryptedStore>` from `@/src/storage` (and `EncryptedStore`'s
> `getJson<T>` / `setJson<T>` / `remove` methods, plus the exported `DecryptionError` class). Do
> **not** re-implement encryption here — the contacts store is a thin domain layer over the single
> shared `EncryptedStore` keyed by the blob key `"contacts"`.
>
> **Test runner:** the mobile package is `@aesmsg/mobile` (see `apps/mobile/package.json`).
> Its `test` script is `vitest run`; the config (`apps/mobile/vitest.config.ts`) sets
> `environment: "node"` and aliases `@` → the app root. Run a single file with:
> `pnpm --filter @aesmsg/mobile test tests/<file>.test.ts`
>
> **create-and-seal.ts:** the spec assigns the `recordSentLink(...)` edit to **Phase 3 (Sent
> links)**. Phase 2 does **not** edit `create-and-seal.ts`; it only consumes the existing
> `CreateAndSealOutput.recipientFingerprint` field (already returned) for the Save-as-contact CTA.

---

### Task 2.1: `tests/setup.ts` — clear the contacts blob between cases

**Files:**
- Create: `apps/mobile/tests/setup.ts`
- Modify: `apps/mobile/vitest.config.ts:8-11`

`apps/mobile` has no `tests/setup.ts` yet (confirmed: the directory contains only `*.test.ts`
files). Phase 1 is expected to introduce a shared in-memory blob/keychain test harness. This task
adds the global setup file that resets the contacts store between cases and registers it in the
Vitest config. The reset is delegated to a store-exported `__resetContactsForTests()` (added in
Task 2.2) so the setup file never reaches into Phase 1 internals.

- [ ] **Step 1: Write the failing test**

No standalone test — this is the harness. Its correctness is proven by Task 2.2's store test, which
relies on a clean store per case. Treat Task 2.2's run as the verification of this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test tests/contacts-store.test.ts`
Expected: FAIL with "Failed to resolve import \"@/tests/setup\"" / "Cannot find module" until the
setup file + config wiring exist (and the store module from 2.2 exists).

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/tests/setup.ts`:

```ts
import { beforeEach } from "vitest";
import { __resetContactsForTests } from "@/src/contacts/contacts-store";

// Global Vitest setup. Per the no-React-renderer / node-env convention, every store is reset
// between cases so persisted blobs from one test never leak into the next. Phase 1 owns the
// in-memory blob-store + keychain mock (vi.mock for expo-file-system / expo-secure-store); this
// file only drains the domain stores layered on top. Additional domain resets (sent-links,
// settings) are appended here by their phases.
beforeEach(async () => {
  await __resetContactsForTests();
});
```

Modify `apps/mobile/vitest.config.ts` — add `setupFiles` to the `test` block (current lines 8-11):

```ts
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
```

- [ ] **Step 4: Run test to verify it passes**

Deferred — verified by Task 2.2's run (the store test depends on this clean-slate setup).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/tests/setup.ts apps/mobile/vitest.config.ts && git commit -m "test(mobile): add global vitest setup that resets the contacts store between cases"
```

---

### Task 2.2: `contacts-store.ts` — encrypted, persisted contact directory (mirrors web)

**Files:**
- Create: `apps/mobile/src/contacts/contacts-store.ts`
- Test: `apps/mobile/tests/contacts-store.test.ts`

Mirrors `apps/web/src/lib/contacts-store.ts` API + error types **verbatim**, swapping its IndexedDB
backend for Phase 1's single shared `EncryptedStore` (obtained via `getEncryptedStore()`), reading
and writing the whole contact array under the blob key `"contacts"`. Fingerprints come from
`@aesmsg/crypto`'s `fingerprint()`. `listContacts` sorts by `label` via `Intl.Collator`. UUIDs
via `crypto.randomUUID()` (present through the WebCrypto polyfill that the rest of the app — and
web's store — already relies on).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/contacts-store.test.ts` (mirrors the web cases in
`apps/web/tests/lib/contacts-store.test.ts`; the per-case reset comes from `tests/setup.ts`):

```ts
import {
  exportPublicKey,
  type Fingerprint,
  fingerprint,
  generateIdentity,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addContact,
  ContactsStoreError,
  DuplicateFingerprintError,
  deleteContact,
  getContact,
  InvalidLabelError,
  listContacts,
  NotFoundError,
  RotatedAwayError,
  renameContact,
  SameKeyError,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";

let pkA: PublicKeyString;
let fpA: Fingerprint;
let pkB: PublicKeyString;
let fpB: Fingerprint;
let pkC: PublicKeyString;

beforeAll(async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const c = await generateIdentity();
  pkA = exportPublicKey(a);
  fpA = await fingerprint(pkA);
  pkB = exportPublicKey(b);
  fpB = await fingerprint(pkB);
  pkC = exportPublicKey(c);
});

describe("contacts-store (mobile)", () => {
  describe("addContact", () => {
    it("creates a record with verified=false, no previousFingerprints, schemaVersion=1", async () => {
      const c = await addContact({ label: "Alice", publicKey: pkA });
      expect(c.label).toBe("Alice");
      expect(c.publicKey).toBe(pkA);
      expect(c.fingerprint).toBe(fpA);
      expect(c.verified).toBe(false);
      expect(c.previousFingerprints).toEqual([]);
      expect(c.schemaVersion).toBe(1);
      expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof c.createdAt).toBe("string");
      expect(c.createdAt).toBe(c.updatedAt);
    });

    it("trims label whitespace", async () => {
      const c = await addContact({ label: "  Alice  ", publicKey: pkA });
      expect(c.label).toBe("Alice");
    });

    it("throws InvalidLabelError on empty label", async () => {
      await expect(addContact({ label: "   ", publicKey: pkA })).rejects.toBeInstanceOf(
        InvalidLabelError,
      );
    });

    it("throws InvalidLabelError on label > 80 chars", async () => {
      await expect(addContact({ label: "x".repeat(81), publicKey: pkA })).rejects.toBeInstanceOf(
        InvalidLabelError,
      );
    });

    it("accepts label of exactly 80 chars", async () => {
      const c = await addContact({ label: "x".repeat(80), publicKey: pkA });
      expect(c.label.length).toBe(80);
    });

    it("throws DuplicateFingerprintError on same current fingerprint", async () => {
      await addContact({ label: "Alice", publicKey: pkA });
      try {
        await addContact({ label: "Alice2", publicKey: pkA });
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateFingerprintError);
        const e = err as DuplicateFingerprintError;
        expect(e.existingLabel).toBe("Alice");
        expect(e.reason).toBe("current");
        expect(e.existingId).toBeDefined();
      }
    });

    it("throws DuplicateFingerprintError when fingerprint matches another contact's previous", async () => {
      const alice = await addContact({ label: "Alice", publicKey: pkA });
      await updateContactKey(alice.id, pkB);
      try {
        await addContact({ label: "Bob", publicKey: pkA });
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateFingerprintError);
        const e = err as DuplicateFingerprintError;
        expect(e.existingLabel).toBe("Alice");
        expect(e.reason).toBe("previous");
      }
    });
  });

  describe("listContacts", () => {
    it("returns [] for empty store", async () => {
      expect(await listContacts()).toEqual([]);
    });

    it("returns all contacts sorted by label asc, locale-aware", async () => {
      await addContact({ label: "charlie", publicKey: pkA });
      await addContact({ label: "Alice", publicKey: pkB });
      await addContact({ label: "Bob", publicKey: pkC });
      const list = await listContacts();
      expect(list.map((c) => c.label)).toEqual(["Alice", "Bob", "charlie"]);
    });
  });

  describe("getContact", () => {
    it("returns the record for an existing id", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      const fetched = await getContact(a.id);
      expect(fetched?.id).toBe(a.id);
      expect(fetched?.label).toBe("Alice");
    });

    it("returns null for an unknown id", async () => {
      expect(await getContact("00000000-0000-0000-0000-000000000000")).toBeNull();
    });
  });

  describe("updateContactKey", () => {
    it("pushes current fingerprint onto previousFingerprints, sets new key, flips verified=false, bumps updatedAt", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await setContactVerified(a.id, true);
      const before = await getContact(a.id);
      expect(before).not.toBeNull();
      if (!before) throw new Error("unreachable");
      expect(before.verified).toBe(true);
      await new Promise((r) => setTimeout(r, 5));
      const after = await updateContactKey(a.id, pkB);
      expect(after.publicKey).toBe(pkB);
      expect(after.fingerprint).toBe(fpB);
      expect(after.verified).toBe(false);
      expect(after.previousFingerprints).toEqual([fpA]);
      expect(after.updatedAt > before.updatedAt).toBe(true);
    });

    it("appends to previousFingerprints in chronological (oldest-first) order", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await updateContactKey(a.id, pkB);
      const final = await updateContactKey(a.id, pkC);
      expect(final.previousFingerprints).toEqual([fpA, fpB]);
    });

    it("throws NotFoundError on unknown id", async () => {
      await expect(
        updateContactKey("00000000-0000-0000-0000-000000000000", pkA),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws SameKeyError when new key equals current key", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await expect(updateContactKey(a.id, pkA)).rejects.toBeInstanceOf(SameKeyError);
    });

    it("throws RotatedAwayError when new key matches one of THIS contact's previous fingerprints", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await updateContactKey(a.id, pkB);
      await expect(updateContactKey(a.id, pkA)).rejects.toBeInstanceOf(RotatedAwayError);
    });
  });

  describe("setContactVerified", () => {
    it("toggles verified true -> false and back", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      const v1 = await setContactVerified(a.id, true);
      expect(v1.verified).toBe(true);
      const v2 = await setContactVerified(a.id, false);
      expect(v2.verified).toBe(false);
    });

    it("bumps updatedAt", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await new Promise((r) => setTimeout(r, 5));
      const v = await setContactVerified(a.id, true);
      expect(v.updatedAt > a.updatedAt).toBe(true);
    });

    it("throws NotFoundError on unknown id", async () => {
      await expect(
        setContactVerified("00000000-0000-0000-0000-000000000000", true),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("renameContact", () => {
    it("trims and updates label", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      const r = await renameContact(a.id, "  Alicia  ");
      expect(r.label).toBe("Alicia");
    });

    it("throws InvalidLabelError on empty trimmed label", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await expect(renameContact(a.id, "   ")).rejects.toBeInstanceOf(InvalidLabelError);
    });

    it("throws InvalidLabelError on label > 80 chars", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      await expect(renameContact(a.id, "y".repeat(81))).rejects.toBeInstanceOf(InvalidLabelError);
    });

    it("throws NotFoundError on unknown id", async () => {
      await expect(
        renameContact("00000000-0000-0000-0000-000000000000", "Bob"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("deleteContact", () => {
    it("removes one contact and leaves siblings", async () => {
      const a = await addContact({ label: "Alice", publicKey: pkA });
      const b = await addContact({ label: "Bob", publicKey: pkB });
      await deleteContact(a.id);
      const remaining = await listContacts();
      expect(remaining.map((c) => c.id)).toEqual([b.id]);
    });

    it("is idempotent on unknown id (no throw)", async () => {
      await expect(deleteContact("00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
    });
  });

  describe("error class identity", () => {
    it("all error types extend ContactsStoreError", () => {
      expect(new InvalidLabelError("bad")).toBeInstanceOf(ContactsStoreError);
      expect(new NotFoundError("bad")).toBeInstanceOf(ContactsStoreError);
      expect(new SameKeyError("bad")).toBeInstanceOf(ContactsStoreError);
      expect(new RotatedAwayError("bad")).toBeInstanceOf(ContactsStoreError);
      expect(
        new DuplicateFingerprintError("bad", {
          existingId: "x",
          existingLabel: "y",
          reason: "current",
        }),
      ).toBeInstanceOf(ContactsStoreError);
    });

    it("DuplicateFingerprintError exposes existingId, existingLabel, reason", () => {
      const err = new DuplicateFingerprintError("dup", {
        existingId: "id-1",
        existingLabel: "Alice",
        reason: "previous",
      });
      expect(err.existingId).toBe("id-1");
      expect(err.existingLabel).toBe("Alice");
      expect(err.reason).toBe("previous");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test tests/contacts-store.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/contacts/contacts-store\"" (module does not
exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/contacts/contacts-store.ts`:

```ts
import {
  fingerprint as computeFingerprint,
  type Fingerprint,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { getEncryptedStore } from "@/src/storage";

// Real, encrypted-at-rest contact directory. Mirrors apps/web/src/lib/contacts-store.ts API +
// error types VERBATIM, swapping web's IndexedDB backend for the single shared on-device
// EncryptedStore (one DEK in the keychain; domains separated by blob key). The whole contact array
// lives under the "contacts" blob key — small, read+rewrite on every mutation, which is fine for an
// address book and keeps the store dead simple (no per-record indexing on top of a JSON blob).
//
// A "contact" now carries a REAL publicKey (no longer a presentational short fingerprint), so the
// compose seal path treats a picked contact exactly like a pasted key.

export const CONTACTS_BLOB_KEY = "contacts";
const MAX_LABEL_LEN = 80;

export interface ContactRecord {
  id: string; // stable uuid; survives key rotation
  label: string; // 1-80 chars, trimmed
  publicKey: PublicKeyString;
  fingerprint: Fingerprint; // computed via @aesmsg/crypto
  verified: boolean; // manual; reset to false on key rotation
  previousFingerprints: Fingerprint[]; // oldest-first
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  schemaVersion: 1;
}

export interface AddContactInput {
  label: string;
  publicKey: PublicKeyString;
}

export class ContactsStoreError extends Error {
  override name = "ContactsStoreError";
}
export class InvalidLabelError extends ContactsStoreError {
  override name = "InvalidLabelError";
}
export class NotFoundError extends ContactsStoreError {
  override name = "NotFoundError";
}
export class SameKeyError extends ContactsStoreError {
  override name = "SameKeyError";
}
export class RotatedAwayError extends ContactsStoreError {
  override name = "RotatedAwayError";
}
export class DuplicateFingerprintError extends ContactsStoreError {
  override name = "DuplicateFingerprintError";
  existingId: string;
  existingLabel: string;
  reason: "current" | "previous";
  constructor(
    message: string,
    info: { existingId: string; existingLabel: string; reason: "current" | "previous" },
  ) {
    super(message);
    this.existingId = info.existingId;
    this.existingLabel = info.existingLabel;
    this.reason = info.reason;
  }
}

function validateLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new InvalidLabelError("Label is required");
  if (trimmed.length > MAX_LABEL_LEN) {
    throw new InvalidLabelError(`Label must be ${MAX_LABEL_LEN} characters or fewer`);
  }
  return trimmed;
}

async function readAll(): Promise<ContactRecord[]> {
  const store = await getEncryptedStore();
  return (await store.getJson<ContactRecord[]>(CONTACTS_BLOB_KEY)) ?? [];
}

async function writeAll(records: ContactRecord[]): Promise<void> {
  const store = await getEncryptedStore();
  await store.setJson(CONTACTS_BLOB_KEY, records);
}

export async function addContact(input: AddContactInput): Promise<ContactRecord> {
  const label = validateLabel(input.label);
  const fp = await computeFingerprint(input.publicKey);
  const all = await readAll();
  for (const c of all) {
    if (c.fingerprint === fp) {
      throw new DuplicateFingerprintError("This public key is already saved", {
        existingId: c.id,
        existingLabel: c.label,
        reason: "current",
      });
    }
    if (c.previousFingerprints.includes(fp)) {
      throw new DuplicateFingerprintError("This public key was rotated away by another contact", {
        existingId: c.id,
        existingLabel: c.label,
        reason: "previous",
      });
    }
  }
  const now = new Date().toISOString();
  const record: ContactRecord = {
    id: crypto.randomUUID(),
    label,
    publicKey: input.publicKey,
    fingerprint: fp,
    verified: false,
    previousFingerprints: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
  await writeAll([...all, record]);
  return record;
}

export async function listContacts(): Promise<ContactRecord[]> {
  const all = await readAll();
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return all.slice().sort((a, b) => collator.compare(a.label, b.label));
}

export async function getContact(id: string): Promise<ContactRecord | null> {
  const all = await readAll();
  return all.find((c) => c.id === id) ?? null;
}

export async function updateContactKey(
  id: string,
  newPublicKey: PublicKeyString,
): Promise<ContactRecord> {
  const all = await readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new NotFoundError(`Contact ${id} not found`);
  const existing = all[idx] as ContactRecord;
  const newFp = await computeFingerprint(newPublicKey);
  if (newFp === existing.fingerprint) {
    throw new SameKeyError("New key equals current key");
  }
  if (existing.previousFingerprints.includes(newFp)) {
    throw new RotatedAwayError("This key was previously rotated away by this contact");
  }
  const updated: ContactRecord = {
    ...existing,
    publicKey: newPublicKey,
    fingerprint: newFp,
    verified: false,
    previousFingerprints: [...existing.previousFingerprints, existing.fingerprint],
    updatedAt: new Date().toISOString(),
  };
  const next = all.slice();
  next[idx] = updated;
  await writeAll(next);
  return updated;
}

export async function setContactVerified(id: string, verified: boolean): Promise<ContactRecord> {
  const all = await readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new NotFoundError(`Contact ${id} not found`);
  const updated: ContactRecord = {
    ...(all[idx] as ContactRecord),
    verified,
    updatedAt: new Date().toISOString(),
  };
  const next = all.slice();
  next[idx] = updated;
  await writeAll(next);
  return updated;
}

export async function renameContact(id: string, label: string): Promise<ContactRecord> {
  const trimmed = validateLabel(label);
  const all = await readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new NotFoundError(`Contact ${id} not found`);
  const updated: ContactRecord = {
    ...(all[idx] as ContactRecord),
    label: trimmed,
    updatedAt: new Date().toISOString(),
  };
  const next = all.slice();
  next[idx] = updated;
  await writeAll(next);
  return updated;
}

export async function deleteContact(id: string): Promise<void> {
  const all = await readAll();
  const next = all.filter((c) => c.id !== id);
  if (next.length === all.length) return; // idempotent: nothing to delete
  await writeAll(next);
}

/** Test-only: wipe the contacts blob so each case starts from an empty directory. */
export async function __resetContactsForTests(): Promise<void> {
  const store = await getEncryptedStore();
  await store.remove(CONTACTS_BLOB_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test tests/contacts-store.test.ts`
Expected: PASS (all addContact / listContacts / getContact / updateContactKey / setContactVerified /
renameContact / deleteContact / error-identity cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/contacts/contacts-store.ts apps/mobile/tests/contacts-store.test.ts && git commit -m "feat(mobile): encrypted on-device contacts store mirroring web's API + errors"
```

---

### Task 2.3: `contacts-display.ts` — pure derived-display helpers (never stored)

**Files:**
- Create: `apps/mobile/src/contacts/contacts-display.ts`
- Test: `apps/mobile/tests/contacts-display.test.ts`

Pure, node-testable derivation from a `ContactRecord` (and a `now`) to the labels the screens render:
trust status, relative "last used", absolute "key created", short fingerprint, and the multi-line
full-fingerprint block. Reuses the existing relative-time helper `relativeTime` from
`@/src/system/activity-data` (spec: "via the existing relative-time helper" — NO `date-fns`),
`truncateFingerprint` from `@aesmsg/crypto`, and `formatFingerprintLines` from
`@/src/keys/fingerprint-lines` for the verify-screen block. Also provides `contactRecordToContact`,
the adapter that maps a persisted `ContactRecord` onto the existing presentational `Contact` shape
(`@/src/contacts/contacts-data`) that the list/detail/verify screens already consume — so the
screens need only minimal prop changes.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/contacts-display.test.ts`:

```ts
import { exportPublicKey, type Fingerprint, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { ContactRecord } from "@/src/contacts/contacts-store";
import {
  contactRecordToContact,
  deriveKeyCreatedLabel,
  deriveLastUsedLabel,
  deriveTrustStatus,
  fullFingerprintLines,
  shortFingerprint,
} from "@/src/contacts/contacts-display";

let fp: Fingerprint;
let record: ContactRecord;

beforeAll(async () => {
  const id = await generateIdentity();
  const pk = exportPublicKey(id);
  fp = await fingerprint(pk);
  record = {
    id: "rec-1",
    label: "Alice",
    publicKey: pk,
    fingerprint: fp,
    verified: false,
    previousFingerprints: [],
    createdAt: "2025-09-12T10:00:00.000Z",
    updatedAt: "2025-09-12T10:00:00.000Z",
    schemaVersion: 1,
  };
});

describe("deriveTrustStatus", () => {
  it("verified record -> 'verified'", () => {
    expect(deriveTrustStatus({ ...record, verified: true })).toBe("verified");
  });

  it("unverified, no rotation history -> 'unverified'", () => {
    expect(deriveTrustStatus({ ...record, verified: false, previousFingerprints: [] })).toBe(
      "unverified",
    );
  });

  it("unverified WITH rotation history -> 'changed' (key changed, re-verify)", () => {
    expect(
      deriveTrustStatus({
        ...record,
        verified: false,
        previousFingerprints: ["SM-0000-0000-0000-0000-0000-0000-0000-0000" as Fingerprint],
      }),
    ).toBe("changed");
  });

  it("verified takes precedence even with rotation history", () => {
    expect(
      deriveTrustStatus({
        ...record,
        verified: true,
        previousFingerprints: ["SM-0000-0000-0000-0000-0000-0000-0000-0000" as Fingerprint],
      }),
    ).toBe("verified");
  });
});

describe("deriveLastUsedLabel", () => {
  const now = new Date("2026-05-31T12:00:00.000Z").getTime();

  it("returns a placeholder when no updatedAt activity is recent (null lastUsed)", () => {
    expect(deriveLastUsedLabel(null, now)).toBe("Never used");
  });

  it("formats a recent ISO timestamp via relativeTime", () => {
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(deriveLastUsedLabel(threeDaysAgo, now)).toBe("3d");
  });

  it("clamps a future timestamp to 'Now'", () => {
    const future = new Date(now + 60_000).toISOString();
    expect(deriveLastUsedLabel(future, now)).toBe("Now");
  });
});

describe("deriveKeyCreatedLabel", () => {
  it("formats an ISO createdAt as an absolute date", () => {
    // toLocaleDateString in node defaults to en-US; assert the shape rather than an exact string.
    const label = deriveKeyCreatedLabel("2025-09-12T10:00:00.000Z");
    expect(label).toMatch(/2025/);
    expect(label).toMatch(/Sep|September|09|9/);
  });
});

describe("shortFingerprint", () => {
  it("returns the first two 4-char groups (8 hex) space-separated", () => {
    const short = shortFingerprint(fp);
    expect(short).toMatch(/^[0-9A-F]{4} [0-9A-F]{4}$/);
  });
});

describe("fullFingerprintLines", () => {
  it("lays the full fingerprint out as stacked 4-char groups (2 lines of 4 groups)", () => {
    const lines = fullFingerprintLines(fp);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/);
    }
  });
});

describe("contactRecordToContact", () => {
  const now = new Date("2026-05-31T12:00:00.000Z").getTime();

  it("maps a record onto the presentational Contact shape with derived display fields", () => {
    const c = contactRecordToContact(record, now);
    expect(c.id).toBe("rec-1");
    expect(c.name).toBe("Alice");
    expect(c.status).toBe("unverified");
    expect(c.fingerprint).toBe(shortFingerprint(fp));
    expect(c.fullFingerprint).toBe(fullFingerprintLines(fp).join(" "));
    expect(c.keyCreated).toBe(deriveKeyCreatedLabel(record.createdAt));
    expect(c.email).toBeUndefined(); // mobile mirrors web's label + publicKey model only (no email)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test tests/contacts-display.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/contacts/contacts-display\"".

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/contacts/contacts-display.ts`:

```ts
import { type Fingerprint, truncateFingerprint } from "@aesmsg/crypto";
import type { Contact, TrustStatus } from "@/src/contacts/contacts-data";
import type { ContactRecord } from "@/src/contacts/contacts-store";
import { formatFingerprintLines } from "@/src/keys/fingerprint-lines";
import { relativeTime } from "@/src/system/activity-data";

// Pure derived display for a persisted ContactRecord. NONE of this is stored — it is computed at
// render time so the on-disk blob stays the minimal label + key + trust state. No date-fns: the
// relative-time label reuses the kit's existing, unit-tested relativeTime helper.

/**
 * Trust status the row / detail / verify screens render. `verified` always wins; otherwise a
 * non-empty rotation history means the key CHANGED (amber "re-verify"), and a fresh-but-unverified
 * key is plain "unverified". Mirrors web's amber-banner semantics (previousFingerprints non-empty).
 */
export function deriveTrustStatus(record: ContactRecord): TrustStatus {
  if (record.verified) return "verified";
  if (record.previousFingerprints.length > 0) return "changed";
  return "unverified";
}

/**
 * Relative "last used" label. `lastUsedIso` is null when we have no usage signal yet (this slice has
 * no per-contact send history — Phase 3's sent-links is keyed by fingerprint, not contact id — so
 * callers pass null and we show "Never used"). When a timestamp IS available it is rendered via the
 * shared relativeTime helper (e.g. "3d", "Now").
 */
export function deriveLastUsedLabel(lastUsedIso: string | null, now: number): string {
  if (lastUsedIso === null) return "Never used";
  return relativeTime(new Date(lastUsedIso).getTime(), now);
}

/** Absolute "key created" date (e.g. "Sep 12, 2025"). Locale-aware, no date-fns. */
export function deriveKeyCreatedLabel(createdAtIso: string): string {
  return new Date(createdAtIso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Short list/row fingerprint: the first two 4-char groups (e.g. "A1B2 C3D4"). */
export function shortFingerprint(fp: Fingerprint): string {
  return truncateFingerprint(fp, 2);
}

/** Full fingerprint laid out as the verify-screen's stacked block: 4 groups per line, 2 lines. */
export function fullFingerprintLines(fp: Fingerprint): string[] {
  // The crypto fingerprint is "SM-XXXX-XXXX-...": strip the prefix + dashes, then group via the
  // existing fingerprint-lines helper so the verify card matches design screen 38's layout.
  return formatFingerprintLines(truncateFingerprint(fp, 8), 4, 4);
}

/**
 * Adapt a persisted ContactRecord onto the existing presentational `Contact` shape that the
 * list / detail / verify screens already consume — so those screens need only swap their data
 * source, not their JSX. `email` is intentionally omitted (mobile mirrors web's label + publicKey
 * model only). `lastUsed` is the "Never used" placeholder this slice (see deriveLastUsedLabel).
 */
export function contactRecordToContact(record: ContactRecord, now: number = Date.now()): Contact {
  return {
    id: record.id,
    name: record.label,
    fingerprint: shortFingerprint(record.fingerprint),
    fullFingerprint: fullFingerprintLines(record.fingerprint).join(" "),
    status: deriveTrustStatus(record),
    lastUsed: deriveLastUsedLabel(null, now),
    keyCreated: deriveKeyCreatedLabel(record.createdAt),
  };
}

export type { Contact, TrustStatus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test tests/contacts-display.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/contacts/contacts-display.ts apps/mobile/tests/contacts-display.test.ts && git commit -m "feat(mobile): pure contacts-display derivation (trust/last-used/key-created/fingerprint)"
```

---

### Task 2.4: `contacts-data.ts` — drop the sample seed, keep `Contact`/`TrustStatus` types

**Files:**
- Modify: `apps/mobile/src/contacts/contacts-data.ts:35-86` (replace `SAMPLE_CONTACTS` + `findContact` body)
- Modify: `apps/mobile/tests/contacts-data.test.ts` (replace seed assertions with type-shape assertions)

The screens stop reading a hard-coded sample; they now read the real store. Keep the `Contact` /
`TrustStatus` type exports (still the presentational view-model the screens render) but remove the 5
seeded contacts and the `findContact` lookup (the store's `getContact` replaces it). The existing
`contacts-data.test.ts` asserts the exact seed — rewrite it to assert the surviving type contract.

- [ ] **Step 1: Write the failing test**

Replace the entire body of `apps/mobile/tests/contacts-data.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { Contact, TrustStatus } from "@/src/contacts/contacts-data";

// contacts-data is now type-only (the runtime sample seed was removed when the real encrypted
// contacts store landed). These assertions pin the presentational view-model the screens render
// against, so a drift in the Contact shape is caught without a renderer.

describe("Contact view-model", () => {
  it("accepts a minimal contact (id + name + fingerprint + status)", () => {
    const c: Contact = {
      id: "x",
      name: "Alice",
      fingerprint: "A1B2 C3D4",
      status: "verified",
    };
    expect(c.name).toBe("Alice");
  });

  it("accepts the optional detail/verify fields", () => {
    const c: Contact = {
      id: "x",
      name: "Alice",
      fingerprint: "A1B2 C3D4",
      fullFingerprint: "A1B2 C3D4 E5F6 7890",
      status: "changed",
      lastUsed: "3d",
      keyCreated: "Sep 12, 2025",
    };
    expect(c.fullFingerprint).toContain("E5F6");
  });

  it("TrustStatus is the three design states", () => {
    const all: TrustStatus[] = ["verified", "unverified", "changed"];
    expect(all).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test tests/contacts-data.test.ts`
Expected: FAIL — the old assertions still import `SAMPLE_CONTACTS` / `findContact`, which we are
about to remove; after replacing the test file, the run fails on the still-present runtime seed
references in other modules until Step 3 removes them. (At minimum it fails compiling because the new
test no longer matches the old export surface the file still ships.)

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/contacts/contacts-data.ts`, replace the seed block (current lines 35-86 — the
`SAMPLE_CONTACTS` array through the end of `findContact`) with:

```ts
// NOTE: the presentational `SAMPLE_CONTACTS` seed + `findContact` lookup were removed when the real
// encrypted contacts store (src/contacts/contacts-store.ts) landed. The screens now read the store
// and adapt ContactRecord -> Contact via src/contacts/contacts-display.ts (contactRecordToContact).
// This module is intentionally type-only now: `Contact` + `TrustStatus` remain the presentational
// view-model the list / detail / verify screens render.
```

Also update the file's top doc comment (current lines 1-7) so it no longer claims to be a seeded
in-memory mock — change the leading block to:

```ts
// Contacts presentational view-model — the `Contact` shape + `TrustStatus` enum the contacts
// screens render. The data itself now comes from the encrypted on-device store
// (src/contacts/contacts-store.ts), adapted via contacts-display.ts's contactRecordToContact.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test tests/contacts-data.test.ts`
Expected: PASS.

Also fix the barrel export — see Task 2.5 (do that before typecheck), then:

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: typecheck still has unresolved `SAMPLE_CONTACTS` / `findContact` references in screens
(fixed in Tasks 2.5-2.8). Defer the green typecheck to Task 2.8's run.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/contacts/contacts-data.ts apps/mobile/tests/contacts-data.test.ts && git commit -m "refactor(mobile): drop contacts sample seed; contacts-data is now the type-only view-model"
```

---

### Task 2.5: `contacts/index.ts` — re-export the store + display helpers, drop seed exports

**Files:**
- Modify: `apps/mobile/src/contacts/index.ts:34-45`

The barrel currently re-exports `SAMPLE_CONTACTS` / `findContact` (now gone) and does not export the
new store/display modules. Update it so callers importing `@/src/contacts` get the real store + the
display adapter, and stop referencing the deleted seed.

- [ ] **Step 1: Write the failing test**

No dedicated test (barrel-only). Verified by the typecheck in Task 2.8 and the existing imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: FAIL — `index.ts` re-exports `SAMPLE_CONTACTS` / `findContact`, which no longer exist in
`contacts-data.ts` after Task 2.4.

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/contacts/index.ts`, replace the "Mock store + pure logic" export block (current
lines 34-45) with:

```ts
// View-model + pure logic
export { type Contact, type TrustStatus } from "@/src/contacts/contacts-data";
export {
  type ContactDisplay,
  contactRecordToContact,
  deriveKeyCreatedLabel,
  deriveLastUsedLabel,
  deriveTrustStatus,
  fullFingerprintLines,
  shortFingerprint,
} from "@/src/contacts/contacts-display";
export {
  type AddContactInput,
  addContact,
  type ContactRecord,
  ContactsStoreError,
  CONTACTS_BLOB_KEY,
  DuplicateFingerprintError,
  deleteContact,
  getContact,
  InvalidLabelError,
  listContacts,
  NotFoundError,
  RotatedAwayError,
  renameContact,
  SameKeyError,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";
export {
  type TrustIndicator,
  type TrustIndicatorKind,
  trustIndicator,
} from "@/src/contacts/trust-status";
```

> Note: `ContactDisplay` is exported for symmetry but is an alias — if `contacts-display.ts` does
> not export a `ContactDisplay` type, drop that line. (The module exports `Contact`/`TrustStatus`
> re-exports; add `export type ContactDisplay = Contact;` to `contacts-display.ts` if a distinct
> name is preferred by the assembler. Keep one source of truth.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: still FAIL on the screen modules (fixed in 2.6-2.8); the barrel itself no longer errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/contacts/index.ts && git commit -m "refactor(mobile): export contacts store + display from the contacts barrel"
```

---

### Task 2.6: `recipient.ts` + `recipient.test.ts` — contacts now carry a real public key

**Files:**
- Modify: `apps/mobile/src/create/recipient.ts:23-49`
- Modify: `apps/mobile/tests/recipient.test.ts:33-36` (the "no key material" case)

The "contact" recipient variant now carries a real `publicKeyString` (resolved from the stored
`ContactRecord` by the picker), so `recipientPublicKeyString` returns it — removing the documented
"seeded contact carries no key material" limitation. The seal path for a picked contact becomes
identical to the paste path.

- [ ] **Step 1: Write the failing test**

In `apps/mobile/tests/recipient.test.ts`, replace the contact-recipient block. The `Contact` fixture
gains nothing; instead the `"contact"` variant now carries a key. Replace the case at current lines
34-36:

```ts
  it("returns the contact's stored public key (contacts now carry real key material)", () => {
    const r: Recipient = {
      kind: "contact",
      contact,
      publicKeyString: "  MCowBQYDK2VuAyEA1234567890abcdef  ",
    };
    expect(recipientPublicKeyString(r)).toBe("MCowBQYDK2VuAyEA1234567890abcdef");
  });

  it("is null for a contact recipient with only whitespace key (defensive)", () => {
    const r: Recipient = { kind: "contact", contact, publicKeyString: "   " };
    expect(recipientPublicKeyString(r)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test tests/recipient.test.ts`
Expected: FAIL — the `Recipient` `"contact"` variant has no `publicKeyString` field yet
(type error), and `recipientPublicKeyString` returns `null` for contacts.

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/create/recipient.ts`, replace the `Recipient` union + the doc comment + the
`recipientPublicKeyString` body (current lines 13-49) with:

```ts
/**
 * The recipient a compose draft is sealing to. A discriminated union over the two design sources:
 *   - "contact" → a saved contact picked from the recipient sheet. It now carries the contact's
 *     REAL public-key string (resolved from the encrypted contacts store), plus its trust state for
 *     the MitM check — so sealing to a contact is identical to sealing to a pasted key.
 *   - "pasted"  → a public key pasted (or scanned) directly.
 *
 * Scan resolves to a "pasted" recipient (the QR payload is a public key string), so the picker's
 * tabs collapse to these two shapes downstream.
 */
export type Recipient =
  | { kind: "contact"; contact: Contact; publicKeyString: string }
  | { kind: "pasted"; publicKeyString: string };

/** Human label for the chosen recipient (contact name, or a short "Pasted key" marker). */
export function recipientLabel(recipient: Recipient | null): string {
  if (recipient === null) return "Select recipient";
  if (recipient.kind === "contact") return recipient.contact.name;
  return "Pasted public key";
}

/**
 * The public-key string to seal against, or null when the recipient cannot supply one yet.
 *
 * Both sources now carry a real key string (a contact resolves its stored publicKey; a pasted key
 * supplies it directly), so the seal path is uniform. The trimmed value is the single source of
 * truth for the seal input. The authoritative parse still happens in importPublicKey
 * (create-and-seal.ts) + ComposeScreen's fingerprint effect; this only shapes what the user picked.
 */
export function recipientPublicKeyString(recipient: Recipient | null): string | null {
  if (recipient === null) return null;
  const trimmed = recipient.publicKeyString.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

(The `looksLikePublicKey` function and the `import type { Contact }` line are unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test tests/recipient.test.ts`
Expected: PASS (including the existing `recipientLabel` + `looksLikePublicKey` cases).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/recipient.ts apps/mobile/tests/recipient.test.ts && git commit -m "feat(mobile): contact recipients carry a real public key (seal path == paste path)"
```

---

### Task 2.7: `RecipientPickerSheet.tsx` + `ComposeScreen.tsx` — load real contacts, drop the no-key limitation

**Files:**
- Modify: `apps/mobile/src/create/RecipientPickerSheet.tsx` (replace seed import + list rendering + onSelect payload)
- Modify: `apps/mobile/src/create/ComposeScreen.tsx:71-88` (key-changed stash + recipientKey effect comment)

The picker now loads the real saved contacts via `listContacts()` and adapts each to a `Contact`
view-model with `contactRecordToContact`. Picking a contact yields a `{ kind: "contact", contact,
publicKeyString }` recipient carrying the stored key. ComposeScreen's `recipientKey` effect comment
is updated (contacts now supply a key); the key-changed stash type still narrows to the contact
variant. Screen wiring is verified manually on the iOS simulator (no node-env render).

- [ ] **Step 1: Write the failing test**

Screen wiring is native/stateful — no automated node-env test (per the convention; the pure pieces
are covered by Tasks 2.2/2.3/2.6). Add a manual verification step (Step 4).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: FAIL — `RecipientPickerSheet.tsx` imports the removed `SAMPLE_CONTACTS`, and its
`onSelect({ kind: "contact", contact: c })` payload now misses the required `publicKeyString`.

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/create/RecipientPickerSheet.tsx`:

Replace the imports (current lines 4-5) — drop the seed, add the store + display adapter:

```ts
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, BottomSheet, Button, Chip, Field, Icon, SegmentedControl } from "@/src/components";
import type { Contact } from "@/src/contacts/contacts-data";
import { contactRecordToContact } from "@/src/contacts/contacts-display";
import { listContacts } from "@/src/contacts/contacts-store";
import { trustIndicator } from "@/src/contacts/trust-status";
import { looksLikePublicKey, type Recipient } from "@/src/create/recipient";
import { colors, fonts, type } from "@/src/theme";
```

Replace the `TrustChip` prop type (current lines 24-28) so it keys on `Contact["status"]` rather
than the removed seed type:

```ts
function TrustChip({ contactStatus }: { contactStatus: Contact["status"] }) {
```

Inside the component, after `const [pasted, setPasted] = useState("");` (current line 52), add
contact loading. Load on first open and keep them; the picker is a transient sheet so a fresh read
each time it opens is fine:

```ts
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Load the real saved contacts (encrypted on-device store) when the sheet opens. Each persisted
  // ContactRecord is adapted to the presentational Contact view-model; picking one yields a
  // recipient carrying its REAL public key, so the seal path is identical to the paste path.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const records = await listContacts();
      if (!cancelled) {
        setContacts(records.map((r) => ({ contact: contactRecordToContact(r), publicKey: r.publicKey })));
      }
    })().catch(() => {
      // A load failure leaves the saved-contacts list empty; the paste tab still works. Surfaced as
      // an empty list rather than a crash (zero-knowledge metadata read must never brick compose).
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);
```

> Correction: keep `contacts` typed to carry the key alongside the view-model. Use this state shape
> instead (replace the `useState<Contact[]>([])` line above with the following and adjust the map):

```ts
  const [contacts, setContacts] = useState<{ contact: Contact; publicKey: string }[]>([]);
```

Replace the "Verified contacts" list block (current lines 108-131) with a real-contacts list plus an
empty hint:

```ts
      <Text style={styles.listLabel}>Saved contacts</Text>
      {contacts.length === 0 ? (
        <Text style={styles.emptyHint}>
          No saved contacts yet. Paste a public key above, or add a contact from the Contacts tab.
        </Text>
      ) : (
        <View style={styles.list}>
          {contacts.map(({ contact: c, publicKey }) => (
            <Pressable
              key={c.id}
              onPress={() => onSelect({ kind: "contact", contact: c, publicKeyString: publicKey })}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${trustIndicator(c.status).a11yLabel}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Avatar initials={c.name} size={38} />
              <View style={styles.rowMain}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.name}
                </Text>
                {/* Mono is reserved for fingerprints / public keys / secure links. */}
                <Text style={styles.fp} numberOfLines={1}>
                  {c.fingerprint}
                </Text>
              </View>
              <TrustChip contactStatus={c.status} />
            </Pressable>
          ))}
        </View>
      )}
```

Add the `emptyHint` style to the `StyleSheet.create({...})` block (after `searchPlaceholder`):

```ts
  emptyHint: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
    paddingHorizontal: 2,
    marginTop: 4,
  },
```

In `apps/mobile/src/create/ComposeScreen.tsx`, update the `recipientKey` effect comment (current
lines 82-88) so it no longer claims contacts carry no key:

```ts
  // The public key string we validate + seal against. Both recipient sources now supply one: a
  // pasted key directly, and a saved "contact" via its stored publicKey. recipientKey is the single
  // source of truth for the seal input — it tracks the chosen recipient.
  useEffect(() => {
    setRecipientKey(recipientPublicKeyString(recipient) ?? "");
  }, [recipient]);
```

The key-changed stash (current line 71, `useState<Recipient & { kind: "contact" }>()`) and
`handlePicked` (lines 73-80) are unchanged — they already narrow to the contact variant, which now
additionally carries `publicKeyString`, so `setRecipient(keyChanged)` adopts a real key.

> NOTE: the `KeyChangedWarningScreen` block (current lines 290-304) hard-codes
> `previousFingerprint="9C0E 12DA"`. With real records, the previous fingerprint should come from the
> stored `previousFingerprints` history. Wiring that requires the picker to pass the full
> `ContactRecord` (not just the view-model) into the key-changed stash. **This is left as a follow-up
> noted in the PR** — the recipient view-model already exposes the current short fingerprint, and the
> trust-critical seal inputs are unaffected. Do not block this task on it.

- [ ] **Step 4: Manual iOS-simulator verification (no node-env render)**

1. `pnpm --filter @aesmsg/mobile typecheck` → PASS (the picker payload + TrustChip type resolve).
2. Launch the app on the iOS simulator (per the documented build recipe). Set up an identity.
3. Add at least one contact (Contacts tab → Add → paste a valid public key) so the store is non-empty.
4. Open compose (Encrypt tab) → tap the recipient row → the picker shows the **real** saved contact
   under "Saved contacts" with its short fingerprint + trust chip. With no contacts saved, confirm
   the "No saved contacts yet" hint shows and the Paste tab still works.
5. Pick the saved contact → the recipient row shows `Sealing to <fingerprint>` (the green chip),
   proving the contact's real key flowed into the fingerprint effect.
6. Encrypt → confirm a link is created (the seal succeeded against the contact's stored key).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/RecipientPickerSheet.tsx apps/mobile/src/create/ComposeScreen.tsx && git commit -m "feat(mobile): recipient picker loads real saved contacts and seals to their stored key"
```

---

### Task 2.8: `ContactsFlow.tsx` + list/detail/verify screens — read/write through the store

**Files:**
- Modify: `apps/mobile/src/contacts/ContactsFlow.tsx` (load via `listContacts`; wire verify/delete; empty state)
- Modify: `apps/mobile/src/contacts/ContactsListScreen.tsx` (no code change required — verify only)
- Modify: `apps/mobile/src/contacts/ContactDetailScreen.tsx` (no code change required — verify only)
- Modify: `apps/mobile/src/contacts/VerifyFingerprintScreen.tsx` (no code change required — verify only)

`ContactsFlow` becomes the read/write coordinator: it loads `ContactRecord[]` via `listContacts()`,
adapts each to a `Contact` view-model, routes detail/verify/add, and persists mutations
(`setContactVerified` on "Mark as verified", `deleteContact` on "Remove contact"). The list/detail/
verify screens already accept a `Contact` and fire callbacks — they need no internal change; the flow
supplies real data and real handlers. Paste/scan ingestion stays the `ComingSoonScreen` placeholder
(real clipboard/QR parsing is the existing follow-up; the spec does not pull it into this slice).

- [ ] **Step 1: Write the failing test**

The flow is a stateful React component (native data loading + persistence side-effects) — no
node-env render test (per convention). The store + display logic it composes is covered by Tasks
2.2/2.3. Verification is the typecheck + the manual iOS-simulator checklist (Step 4).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: FAIL — `ContactsFlow.tsx` imports the removed `findContact` / `SAMPLE_CONTACTS` from
`contacts-data`.

- [ ] **Step 3: Write the implementation**

Replace the entire body of `apps/mobile/src/contacts/ContactsFlow.tsx` with:

```ts
import { useCallback, useEffect, useState } from "react";
import { AddContactScreen } from "@/src/contacts/AddContactScreen";
import { ComingSoonScreen } from "@/src/contacts/ComingSoonScreen";
import { ContactDetailScreen } from "@/src/contacts/ContactDetailScreen";
import { ContactsEmptyScreen } from "@/src/contacts/ContactsEmptyScreen";
import { ContactsListScreen } from "@/src/contacts/ContactsListScreen";
import type { Contact } from "@/src/contacts/contacts-data";
import { contactRecordToContact } from "@/src/contacts/contacts-display";
import {
  type ContactRecord,
  deleteContact,
  listContacts,
  setContactVerified,
} from "@/src/contacts/contacts-store";
import { QRScanScreen } from "@/src/contacts/QRScanScreen";
import { VerifyFingerprintScreen } from "@/src/contacts/VerifyFingerprintScreen";

// ContactsFlow — the Contacts tab's internal navigation stack, now backed by the encrypted
// on-device contacts store. It loads the real ContactRecord[] (adapting each to the presentational
// Contact view-model), routes between the contacts screens (34/35/36/37/38/39), and persists
// mutations (mark-verified, remove). Paste/scan ingestion stays the ComingSoonScreen placeholder —
// clipboard ingestion + public-key parsing is the existing follow-up slice; nothing here fabricates
// a contact.
//
// Navigation OUT of the tab (e.g. "Send secure message" → compose) is an optional callback so the
// flow stays decoupled; with no callback wired the action is inert rather than navigating wrong.

type Route =
  | { name: "list" }
  | { name: "detail"; contactId: string }
  | { name: "add" }
  | { name: "verify"; contactId: string }
  | { name: "scan" }
  | { name: "paste-soon" };

export interface ContactsFlowProps {
  /** Navigate out of the tab to compose a message to a contact (Integration phase wires this). */
  onSendToContact?: (contact: Contact) => void;
}

export default function ContactsFlow({ onSendToContact }: ContactsFlowProps = {}) {
  const [records, setRecords] = useState<ContactRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [route, setRoute] = useState<Route>({ name: "list" });

  const reload = useCallback(async () => {
    const next = await listContacts();
    setRecords(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload().catch(() => {
      // A metadata-read failure leaves the directory empty (the empty state is shown) rather than
      // crashing the tab. Adding a contact will overwrite the blob and recover.
      setLoaded(true);
    });
  }, [reload]);

  const goList = () => setRoute({ name: "list" });
  const findRecord = (id: string) => records.find((r) => r.id === id);

  const contacts: Contact[] = records.map((r) => contactRecordToContact(r));

  const listScreen = (
    <ContactsListScreen
      contacts={contacts}
      onAdd={() => setRoute({ name: "add" })}
      onSelect={(id) => setRoute({ name: "detail", contactId: id })}
    />
  );

  // Empty-store state (39) takes over the whole tab once loaded with no contacts.
  if (loaded && records.length === 0 && route.name !== "add" && route.name !== "scan" && route.name !== "paste-soon") {
    return (
      <ContactsEmptyScreen
        onScan={() => setRoute({ name: "scan" })}
        onPaste={() => setRoute({ name: "paste-soon" })}
      />
    );
  }

  switch (route.name) {
    case "detail": {
      const record = findRecord(route.contactId);
      if (!record) return listScreen;
      const contact = contactRecordToContact(record);
      return (
        <ContactDetailScreen
          contact={contact}
          onBack={goList}
          onScanQr={() => setRoute({ name: "scan" })}
          onSend={() => onSendToContact?.(contact)}
          onRemove={async () => {
            await deleteContact(record.id);
            await reload();
            goList();
          }}
          onVerify={() => setRoute({ name: "verify", contactId: record.id })}
        />
      );
    }

    case "add":
      return (
        <AddContactScreen
          onBack={goList}
          onPick={(method) =>
            setRoute(method === "scan" ? { name: "scan" } : { name: "paste-soon" })
          }
        />
      );

    case "verify": {
      const record = findRecord(route.contactId);
      if (!record) return listScreen;
      const contact = contactRecordToContact(record);
      const backToDetail = () => setRoute({ name: "detail", contactId: record.id });
      return (
        <VerifyFingerprintScreen
          contact={contact}
          onBack={backToDetail}
          onMarkVerified={async () => {
            await setContactVerified(record.id, true);
            await reload();
            backToDetail();
          }}
          onNotNow={backToDetail}
        />
      );
    }

    case "scan":
      return (
        <QRScanScreen onBack={goList} onPaste={() => setRoute({ name: "paste-soon" })} />
      );

    case "paste-soon":
      return (
        <ComingSoonScreen
          title="Paste public key"
          icon="content_paste"
          message="Pasting and importing a public key is coming soon."
          onBack={goList}
        />
      );

    default:
      return listScreen;
  }
}
```

> The list/detail/verify screens (`ContactsListScreen.tsx`, `ContactDetailScreen.tsx`,
> `VerifyFingerprintScreen.tsx`) take a `Contact` + callbacks and need **no** source change — the
> flow now supplies real data and real persisting handlers. Their `findContact`/`SAMPLE_CONTACTS`
> imports were never present (they receive props), so removing the seed does not touch them.

- [ ] **Step 4: Manual iOS-simulator verification (no node-env render)**

1. `pnpm --filter @aesmsg/mobile typecheck` → PASS (the whole contacts slice now resolves).
2. `pnpm --filter @aesmsg/mobile test` → PASS (full mobile suite green, including the rewritten
   `contacts-data` / `recipient` tests and the new store/display tests).
3. Launch on the iOS simulator. With no contacts saved, the Contacts tab shows the **empty state**
   (39): "No contacts yet".
4. Add a contact via paste (after Task 2.9 wires the Save-as-contact path, or by pasting from compose
   — for this task, add via the Save-as-contact CTA from Task 2.9, or temporarily via a debug paste).
   Confirm it appears in the list (34) with its short fingerprint + an amber "Unverified" chip.
5. Tap the contact → Detail (35) shows the avatar, name, full fingerprint block, and "Key created"
   date. Tap "Verify identity" → Verify (38) → "Mark as verified" → returns to Detail now showing the
   green "Verified" chip. Re-open the tab and confirm the verified state **persisted** (survives a
   tab switch / app relaunch).
6. On Detail, tap "Remove contact" → returns to the list and the contact is gone; relaunch confirms
   the deletion persisted.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/contacts/ContactsFlow.tsx && git commit -m "feat(mobile): contacts tab reads/writes through the encrypted store (verify, remove, empty state persist)"
```

---

### Task 2.9: `ResultScreen.tsx` + `CreateFlow.tsx` — "Save as contact" CTA after an unknown-fingerprint paste send

**Files:**
- Modify: `apps/mobile/src/create/ResultScreen.tsx` (add an optional inline Save-as-contact sheet)
- Modify: `apps/mobile/src/create/CreateFlow.tsx` (compute whether the recipient is unknown; pass save props)
- Test: `apps/mobile/tests/result-save-contact.test.ts` (pure eligibility logic)

After a paste-flow send whose recipient fingerprint is **not** already known (neither a current
contact fingerprint nor any contact's rotated-away fingerprint), `ResultScreen` shows a "Save as
contact" CTA. Tapping it opens an inline name + confirm sheet with the public key pre-filled (no
email — mirror web). The decision of *whether* to show the CTA is pure logic, extracted to a
testable helper; the sheet UI itself is verified on the simulator. `create-and-seal.ts` already
returns `recipientFingerprint`, and the compose draft carries the `recipientPublicKeyString` — no
edit to `create-and-seal.ts` (that file's only change, `recordSentLink`, is owned by Phase 3).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/result-save-contact.test.ts`:

```ts
import { exportPublicKey, type Fingerprint, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { ContactRecord } from "@/src/contacts/contacts-store";
import { isUnknownRecipientFingerprint } from "@/src/create/result-save-contact";

let known: Fingerprint;
let rotatedAway: Fingerprint;
let unknown: Fingerprint;
let records: ContactRecord[];

beforeAll(async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const c = await generateIdentity();
  known = await fingerprint(exportPublicKey(a));
  rotatedAway = await fingerprint(exportPublicKey(b));
  unknown = await fingerprint(exportPublicKey(c));
  records = [
    {
      id: "rec-1",
      label: "Alice",
      publicKey: exportPublicKey(a),
      fingerprint: known,
      verified: false,
      previousFingerprints: [rotatedAway],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      schemaVersion: 1,
    },
  ];
});

describe("isUnknownRecipientFingerprint", () => {
  it("is false when the fingerprint matches a contact's CURRENT key", () => {
    expect(isUnknownRecipientFingerprint(known, records)).toBe(false);
  });

  it("is false when the fingerprint matches a contact's ROTATED-AWAY key", () => {
    expect(isUnknownRecipientFingerprint(rotatedAway, records)).toBe(false);
  });

  it("is true when the fingerprint matches no contact (current or previous)", () => {
    expect(isUnknownRecipientFingerprint(unknown, records)).toBe(true);
  });

  it("is true against an empty directory", () => {
    expect(isUnknownRecipientFingerprint(unknown, [])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test tests/result-save-contact.test.ts`
Expected: FAIL with "Failed to resolve import \"@/src/create/result-save-contact\"".

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/create/result-save-contact.ts`:

```ts
import type { Fingerprint } from "@aesmsg/crypto";
import type { ContactRecord } from "@/src/contacts/contacts-store";

// Pure eligibility check for the "Save as contact" CTA on the Link Created screen (17). The CTA is
// offered ONLY when the recipient fingerprint we just sealed to is not already known — neither a
// saved contact's current fingerprint nor any contact's rotated-away (previous) fingerprint. A
// rotated-away match is intentionally treated as "known": re-saving a key a contact deliberately
// rotated away is the security event web surfaces, not a convenience prompt.
export function isUnknownRecipientFingerprint(
  fingerprint: Fingerprint,
  contacts: ContactRecord[],
): boolean {
  for (const c of contacts) {
    if (c.fingerprint === fingerprint) return false;
    if (c.previousFingerprints.includes(fingerprint)) return false;
  }
  return true;
}
```

In `apps/mobile/src/create/ResultScreen.tsx`, add the optional Save-as-contact affordance. First
extend the imports (current lines 1-6) and add the store import + state hooks:

```ts
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppBar, BottomSheet, Button, Chip, Field, Icon } from "@/src/components";
import { colors, fonts, type } from "@/src/theme";
```

Extend `ResultScreenProps` (current lines 17-28) with the optional save callback:

```ts
export interface ResultScreenProps {
  url: string;
  onNew: () => void;
  expiryLabel?: string;
  opensLabel?: string;
  onViewDetails?: () => void;
  onRevoke?: () => void;
  /**
   * When set, the recipient was a pasted key whose fingerprint is not yet saved — show a
   * "Save as contact" CTA. The handler persists the contact (label + the pre-filled public key).
   * Throws on a validation/duplicate error; the sheet surfaces it inline.
   */
  onSaveContact?: (label: string) => Promise<void>;
}
```

Add to the destructured props (current lines 32-39) `onSaveContact`, and add the sheet state inside
the component (after `const [copied, setCopied] = useState(false);`):

```ts
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function confirmSave() {
    if (saving || saveLabel.trim().length === 0) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await onSaveContact?.(saveLabel);
      setSaved(true);
      setSaveOpen(false);
    } catch {
      // Opaque, calm inline failure (e.g. duplicate / invalid label). The draft sheet stays open.
      setSaveErr("Couldn't save this contact. Try a different name.");
    } finally {
      setSaving(false);
    }
  }
```

Insert the CTA into the `actions` block (after the "View details" button, current line ~113, inside
the `<View style={styles.actions}>`):

```ts
          {onSaveContact && !saved ? (
            <Button kind="outline" icon="person_add" onPress={() => setSaveOpen(true)}>
              Save as contact
            </Button>
          ) : null}
          {saved ? (
            <Chip tone="green" icon="check_circle" fill>
              Saved to contacts
            </Chip>
          ) : null}
```

Add the inline name+confirm sheet just before the closing `</View>` of `root` (after the footer
`</View>`, current line ~127). The public key is **not** displayed/edited (it is pre-filled from the
already-sealed recipient key by the caller); the user supplies only a name — no email (mirror web):

```ts
      <BottomSheet visible={saveOpen} onClose={() => setSaveOpen(false)}>
        <Text style={styles.saveHeading} accessibilityRole="header">
          Save as contact
        </Text>
        <Text style={styles.saveSub}>
          Save this recipient's public key so you can send to them again without pasting it.
        </Text>
        <View style={styles.saveField}>
          <Field placeholder="Name" value={saveLabel} onChangeText={setSaveLabel} />
        </View>
        {saveErr ? <Text style={styles.saveErr}>{saveErr}</Text> : null}
        <Button
          icon="person_add"
          disabled={saving || saveLabel.trim().length === 0}
          onPress={confirmSave}
        >
          {saving ? "Saving…" : "Save contact"}
        </Button>
      </BottomSheet>
```

Add the styles (inside `StyleSheet.create`):

```ts
  saveHeading: { ...type.h2, color: colors.onSurface, marginBottom: 6 },
  saveSub: { ...type.body, color: colors.onSurfaceVariant, marginBottom: 14 },
  saveField: { marginBottom: 12 },
  saveErr: { color: colors.error, fontSize: 13, marginBottom: 12 },
```

In `apps/mobile/src/create/CreateFlow.tsx`, compute the save eligibility and pass `onSaveContact`.
The compose `ComposeSubmit` carries `recipientPublicKeyString`; `createAndSeal` returns
`recipientFingerprint`. Stash the output, check it against the directory, and offer the CTA only for
unknown fingerprints. Replace the file body with:

```ts
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { addContact, listContacts } from "@/src/contacts/contacts-store";
import { ComposeScreen, type ComposeSubmit } from "@/src/create/ComposeScreen";
import { type CreateAndSealOutput, createAndSeal } from "@/src/create/create-and-seal";
import { EncryptingScreen } from "@/src/create/EncryptingScreen";
import { isUnknownRecipientFingerprint } from "@/src/create/result-save-contact";
import { ResultScreen } from "@/src/create/ResultScreen";
import { resultChipLabels } from "@/src/create/result-labels";
import type { PublicKeyString } from "@aesmsg/crypto";

// CreateFlow — the trust-critical compose → seal → result path. Seal logic untouched: it hands the
// ComposeSubmit straight to createAndSeal and shows the returned web link. After a successful seal
// to an UNKNOWN recipient fingerprint, the result screen offers a "Save as contact" CTA so the user
// can keep the pasted key for next time (mirrors web; no email).

type State =
  | { kind: "compose"; error: string | null }
  | { kind: "encrypting"; submit: ComposeSubmit }
  | { kind: "result"; out: CreateAndSealOutput; submit: ComposeSubmit };

export function CreateFlow({ onExit }: { onExit?: () => void } = {}) {
  const [state, setState] = useState<State>({ kind: "compose", error: null });
  const [recipientUnknown, setRecipientUnknown] = useState(false);

  async function submit(v: ComposeSubmit) {
    setState({ kind: "encrypting", submit: v });
    try {
      const out = await createAndSeal(v);
      setState({ kind: "result", out, submit: v });
    } catch {
      setState({
        kind: "compose",
        error: "Could not create the secure link. Check your connection and try again.",
      });
    }
  }

  // After a successful seal, decide whether to offer "Save as contact": only when the recipient
  // fingerprint isn't already a known (current or rotated-away) contact. A directory read failure
  // simply hides the CTA (never blocks the success screen).
  useEffect(() => {
    if (state.kind !== "result") {
      setRecipientUnknown(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const records = await listContacts();
      if (!cancelled) {
        setRecipientUnknown(isUnknownRecipientFingerprint(state.out.recipientFingerprint, records));
      }
    })().catch(() => {
      if (!cancelled) setRecipientUnknown(false);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.kind === "result") {
    const labels = resultChipLabels(state.submit.expiresAt, state.submit.maxOpens);
    const pk = state.submit.recipientPublicKeyString as PublicKeyString;
    return (
      <ResultScreen
        url={state.out.url}
        onNew={() => setState({ kind: "compose", error: null })}
        expiryLabel={labels.expiry}
        opensLabel={labels.opens}
        {...(recipientUnknown
          ? {
              onSaveContact: async (label: string) => {
                await addContact({ label, publicKey: pk });
              },
            }
          : {})}
      />
    );
  }

  const busy = state.kind === "encrypting";
  const error = state.kind === "compose" ? state.error : null;

  return (
    <View style={styles.root}>
      <ComposeScreen onSubmit={submit} busy={busy} error={error} onClose={onExit} />
      {busy ? (
        <View style={StyleSheet.absoluteFill}>
          <EncryptingScreen phase="encrypt" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
```

> The CTA is offered for **both** paste and contact sends, but `isUnknownRecipientFingerprint`
> returns false for any saved contact's fingerprint — so a contact send (always a known fingerprint)
> never surfaces it. The spec's "after a paste-flow send whose fingerprint isn't already known" is
> satisfied: a paste of an already-saved key is also suppressed (it's known), and a contact pick is
> always known. No separate source flag is needed.

- [ ] **Step 4: Run test + manual iOS-simulator verification**

1. `pnpm --filter @aesmsg/mobile test tests/result-save-contact.test.ts` → PASS.
2. `pnpm --filter @aesmsg/mobile typecheck` → PASS.
3. On the simulator: compose to a **freshly pasted** public key (not saved), encrypt → on the Link
   Created screen a "Save as contact" outline button appears. Tap it → the inline sheet opens with a
   Name field (no email). Enter a name → "Save contact" → the button is replaced by a green "Saved to
   contacts" chip. Open the Contacts tab → the new contact is present (unverified). Relaunch →
   persisted.
4. Compose to that **now-saved** contact (pick from the picker) or paste the same key again →
   the "Save as contact" CTA is **absent** (fingerprint is known).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/result-save-contact.ts apps/mobile/src/create/ResultScreen.tsx apps/mobile/src/create/CreateFlow.tsx apps/mobile/tests/result-save-contact.test.ts && git commit -m "feat(mobile): Save-as-contact CTA on link-created for unknown-fingerprint paste sends"
```

---

### Task 2.10: Phase gate — full mobile suite + typecheck green

**Files:**
- Test: (whole suite)

Confirm the contacts slice is internally consistent and nothing regressed.

- [ ] **Step 1: Write the failing test**

No new test — this is the integration gate.

- [ ] **Step 2: Run test to verify it fails**

(Skipped — gate task.)

- [ ] **Step 3: Implementation**

No code — verification only.

- [ ] **Step 4: Run the gates**

Run: `pnpm --filter @aesmsg/mobile test`
Expected: PASS — all suites including `contacts-store`, `contacts-display`, `recipient`,
`contacts-data`, `result-save-contact`, plus the unchanged existing suites.

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

Run: `pnpm lint`
Expected: PASS (Biome clean).

- [ ] **Step 5: Commit**

No commit if all green (nothing changed). If lint applied fixes:

```bash
git add -A && git commit -m "chore(mobile): biome fixes for the contacts persistence slice"
```

---

## Phase 3: Sent links — functional + reconciliation

> This phase replaces the in-memory SEED_LINKS mock in the Links tab with a real encrypted-at-rest sent-links store plus live server reconciliation. It ships four pure/DI-testable modules (sent-links-store, link-reconciliation, link-display, and the use-sent-links hook), extends the API client with listMessages/revokeLink, records every successful send, and rewires LinksFlow to load+reconcile+revoke+delete through the hook. Every non-screen unit is independently testable under node-env Vitest (real AES-GCM via the injected EncryptedStore, fetch stubbed for the API client); screen wiring carries a manual iOS-simulator checklist.

### Task 3.1: `sent-links-store` — encrypted local persistence

Mirrors `apps/web/src/lib/sent-links-store.ts` (same `SentLinkRecord` shape and `recordSentLink / listSentLinks / deleteSentLink` semantics), but persists through Phase 1's single `EncryptedStore` under the blob key `"sent-links"` instead of IndexedDB. Adds `getSentLink(id)` (spec requires it; web lacks it) and a `__deleteSentLinksStoreForTests()` cleanup hook used by `tests/setup.ts`.

**Files:**
- Create: `apps/mobile/src/links/sent-links-store.ts`
- Test: `apps/mobile/tests/sent-links-store.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// expo-secure-store and expo-file-system cannot load under Node vitest. Back them with in-memory
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

vi.mock("expo-file-system", () => {
  const dir = "file:///tmp/aesmsg/";
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
    __dir: dir,
  };
});

import type { Fingerprint } from "@aesmsg/crypto";
import {
  __deleteSentLinksStoreForTests,
  deleteSentLink,
  getSentLink,
  listSentLinks,
  recordSentLink,
} from "@/src/links/sent-links-store";

const FP_A = "SM-AAAA-1111" as Fingerprint;
const FP_B = "SM-BBBB-2222" as Fingerprint;

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
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/sent-links-store.test.ts`
Expected: FAIL with "Cannot find module '@/src/links/sent-links-store'" (the module does not exist yet).
- [ ] **Step 3: Write the implementation**
```ts
import type { Fingerprint } from "@aesmsg/crypto";
import { getEncryptedStore } from "@/src/storage";

// On-device sent-links tracking store. Mirrors apps/web/src/lib/sent-links-store.ts's record shape
// and recordSentLink / listSentLinks / deleteSentLink semantics, but persists through the single
// encrypted-at-rest EncryptedStore (file-blob backend + one shared DEK) under the blob key
// "sent-links" instead of IndexedDB. The whole domain is ONE encrypted JSON blob: an id-keyed map.
//
// PRODUCT INVARIANT: a record holds only sender-derivable metadata (id, recipient fingerprint,
// expiry, max-opens, createdAt, an optional local label) — never plaintext. The encrypted blob keeps
// even that metadata at rest under the device-only DEK, consistent with the zero-knowledge posture.

const BLOB_KEY = "sent-links";

export interface SentLinkRecord {
  id: string;
  recipientFingerprint: Fingerprint;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  maxOpens: number;
  label: string | null;
  schemaVersion: 1;
}

type SentLinkMap = Record<string, SentLinkRecord>;

async function readMap(): Promise<SentLinkMap> {
  const store = await getEncryptedStore();
  return (await store.getJson<SentLinkMap>(BLOB_KEY)) ?? {};
}

async function writeMap(map: SentLinkMap): Promise<void> {
  const store = await getEncryptedStore();
  await store.setJson(BLOB_KEY, map);
}

/** Persist (or upsert by id) a sent-link tracking record. schemaVersion is stamped here. */
export async function recordSentLink(record: Omit<SentLinkRecord, "schemaVersion">): Promise<void> {
  const map = await readMap();
  map[record.id] = { ...record, schemaVersion: 1 };
  await writeMap(map);
}

/** All tracked links, newest-first by createdAt (ISO strings sort lexicographically). */
export async function listSentLinks(): Promise<SentLinkRecord[]> {
  const map = await readMap();
  return Object.values(map).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** One tracked link by id, or null if it was never recorded / has been deleted. */
export async function getSentLink(id: string): Promise<SentLinkRecord | null> {
  const map = await readMap();
  return map[id] ?? null;
}

/** Forget a tracked link locally. Deleting a missing id is a no-op. */
export async function deleteSentLink(id: string): Promise<void> {
  const map = await readMap();
  if (!(id in map)) return;
  delete map[id];
  await writeMap(map);
}

/** Test-only: wipe the sent-links blob so each case starts from an empty store. */
export async function __deleteSentLinksStoreForTests(): Promise<void> {
  const store = await getEncryptedStore();
  await store.remove(BLOB_KEY);
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/sent-links-store.test.ts`
Expected: PASS (5 tests).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/links/sent-links-store.ts apps/mobile/tests/sent-links-store.test.ts && git commit -m "feat(mobile): encrypted sent-links store (record/list newest-first/get/delete)"
```

---

### Task 3.2: `tests/setup.ts` — clear the sent-links store between cases

Phase 1 created `apps/mobile/tests/setup.ts` and wired it as `setupFiles` in `vitest.config.ts`. This task adds the sent-links cleanup so domain stores never bleed state across cases (the contacts/settings phases add their own lines the same way).

**Files:**
- Modify: `apps/mobile/tests/setup.ts` (Phase 1 created this; append the sent-links cleanup inside the existing `beforeEach`)

- [ ] **Step 1 (no automated test — this is the test harness itself)**
This edit is exercised transitively by every store test (Task 3.1, 3.4, etc.). Its correctness is confirmed in Step 3's full-suite run.
- [ ] **Step 2: Read the current setup file to find the insertion point**
Run: `cat apps/mobile/tests/setup.ts`
Expect a `beforeEach(async () => { ... })` block (added by Phase 1) that already calls the storage clear + other domain cleanups. Add the sent-links line beside them.
- [ ] **Step 3: Apply the edit**
Add the import (top of file, beside the other store cleanup imports):
```ts
import { __deleteSentLinksStoreForTests } from "@/src/links/sent-links-store";
```
Inside the existing `beforeEach(async () => { ... })`, add (after the encrypted-store / DEK reset that Phase 1 placed first, so the blob is cleared from a fresh DEK each time):
```ts
  await __deleteSentLinksStoreForTests();
```
- [ ] **Step 4: Run the full mobile suite to verify nothing regressed**
Run: `pnpm --filter @aesmsg/mobile test`
Expected: PASS (the whole suite, including Task 3.1's `sent-links-store.test.ts`, is green).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/tests/setup.ts && git commit -m "test(mobile): clear sent-links store between cases in tests/setup.ts"
```

---

### Task 3.3: `link-reconciliation` — pure merge of local records with the server's live status

Pure `reconcileSentLinks(localRecords, serverResponse, now)`. The server's `POST /api/messages/list` returns `{ results: [{ id, status: "gone" } | { id, status: "active", expiresAt, maxOpens, opensCount }] }` (confirmed in `apps/web/src/server/messages-handler.ts` `createListMessagesHandler`). The merge produces a `ReconciledLink` per local record: server `"active"` becomes a live record carrying `opensCount`/`expiresAt`/`maxOpens`; server `"gone"`, a missing-from-response id, or a local record whose `expiresAt` is already in the past all become `serverStatus: "gone"`.

**Files:**
- Create: `apps/mobile/src/links/link-reconciliation.ts`
- Test: `apps/mobile/tests/link-reconciliation.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import {
  type ListMessagesResponse,
  reconcileSentLinks,
} from "@/src/links/link-reconciliation";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

const NOW = new Date("2026-05-31T12:00:00.000Z").getTime();

function record(over: Partial<SentLinkRecord> & { id: string }): SentLinkRecord {
  return {
    recipientFingerprint: "SM-AAAA-1111" as Fingerprint,
    createdAt: "2026-05-31T10:00:00.000Z",
    expiresAt: "2026-06-01T10:00:00.000Z", // future relative to NOW
    maxOpens: 3,
    label: "deck",
    schemaVersion: 1,
    ...over,
  };
}

describe("reconcileSentLinks", () => {
  it("merges live server status (active) onto a local record", () => {
    const local = [record({ id: "active0000000000" })];
    const server: ListMessagesResponse = {
      results: [
        {
          id: "active0000000000",
          status: "active",
          expiresAt: "2026-06-01T10:00:00.000Z",
          maxOpens: 3,
          opensCount: 1,
        },
      ],
    };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("active");
    expect(r.opensCount).toBe(1);
    expect(r.maxOpens).toBe(3);
    expect(r.expiresAt).toBe("2026-06-01T10:00:00.000Z");
    expect(r.record.id).toBe("active0000000000");
  });

  it("marks a record the server reports as 'gone' (revoked/expired server-side) as gone", () => {
    const local = [record({ id: "revoked000000000" })];
    const server: ListMessagesResponse = {
      results: [{ id: "revoked000000000", status: "gone" }],
    };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("gone");
    expect(r.opensCount).toBeNull();
  });

  it("marks a local record entirely absent from the server response as gone", () => {
    const local = [record({ id: "missing000000000" })];
    const server: ListMessagesResponse = { results: [] };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("gone");
    expect(r.opensCount).toBeNull();
  });

  it("marks a record whose local expiresAt is already past as gone, even if server says active", () => {
    // Defensive: a clock-skewed or stale server row should not resurrect an expired link locally.
    const local = [
      record({ id: "pastexpiry000000", expiresAt: "2026-05-30T10:00:00.000Z" }), // before NOW
    ];
    const server: ListMessagesResponse = {
      results: [
        {
          id: "pastexpiry000000",
          status: "active",
          expiresAt: "2026-05-30T10:00:00.000Z",
          maxOpens: 1,
          opensCount: 0,
        },
      ],
    };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("gone");
  });

  it("returns an empty array for no local records", () => {
    const server: ListMessagesResponse = { results: [] };
    expect(reconcileSentLinks([], server, NOW)).toEqual([]);
  });

  it("preserves local order and reconciles a mixed batch (active + gone + missing)", () => {
    const local = [
      record({ id: "active0000000000" }),
      record({ id: "gone000000000000" }),
      record({ id: "absent0000000000" }),
    ];
    const server: ListMessagesResponse = {
      results: [
        {
          id: "active0000000000",
          status: "active",
          expiresAt: "2026-06-01T10:00:00.000Z",
          maxOpens: 3,
          opensCount: 2,
        },
        { id: "gone000000000000", status: "gone" },
      ],
    };

    const out = reconcileSentLinks(local, server, NOW);
    expect(out.map((r) => `${r.record.id}:${r.serverStatus}`)).toEqual([
      "active0000000000:active",
      "gone000000000000:gone",
      "absent0000000000:gone",
    ]);
    expect(out[0]?.opensCount).toBe(2);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/link-reconciliation.test.ts`
Expected: FAIL with "Cannot find module '@/src/links/link-reconciliation'".
- [ ] **Step 3: Write the implementation**
```ts
import type { SentLinkRecord } from "@/src/links/sent-links-store";

// Pure reconciliation of locally-tracked sent links against the server's live status.
//
// POST /api/messages/list returns one result per requested id. The web handler
// (createListMessagesHandler in apps/web/src/server/messages-handler.ts) only echoes a row as
// { status: "active", expiresAt, maxOpens, opensCount } when it is still active AND unexpired;
// everything else (not_found, revoked, expired, past-expiry) collapses to { status: "gone" }. A
// local record whose id is entirely absent from the response is also treated as gone (defensive:
// the server is the source of truth for liveness). We additionally fail a record to "gone" if its
// own locally-recorded expiresAt is already past `now`, so a stale/clock-skewed server row cannot
// resurrect an expired link in the list. No Date.now() here — `now` is injected for determinism.

/** A server result row for one id. Mirrors the web list-handler's response union. */
export type ListMessageResult =
  | { id: string; status: "gone" }
  | {
      id: string;
      status: "active";
      expiresAt: string;
      maxOpens: number;
      opensCount: number;
    };

export interface ListMessagesResponse {
  results: ListMessageResult[];
}

/** The server-derived liveness of a tracked link after reconciliation. */
export type ServerStatus = "active" | "gone";

export interface ReconciledLink {
  /** The local tracking record (id, recipient fingerprint, label, original expiry/max-opens). */
  record: SentLinkRecord;
  /** Liveness as resolved against the server (and local-expiry guard). */
  serverStatus: ServerStatus;
  /** Live opens consumed (server-reported); null when gone. */
  opensCount: number | null;
  /** Live max opens (server-reported); falls back to the local record's value when gone. */
  maxOpens: number;
  /** Live expiry ISO (server-reported); falls back to the local record's value when gone. */
  expiresAt: string;
}

export function reconcileSentLinks(
  localRecords: SentLinkRecord[],
  serverResponse: ListMessagesResponse,
  now: number,
): ReconciledLink[] {
  const byId = new Map<string, ListMessageResult>();
  for (const r of serverResponse.results) byId.set(r.id, r);

  return localRecords.map((record) => {
    const server = byId.get(record.id);
    const locallyExpired = new Date(record.expiresAt).getTime() <= now;

    if (server && server.status === "active" && !locallyExpired) {
      return {
        record,
        serverStatus: "active",
        opensCount: server.opensCount,
        maxOpens: server.maxOpens,
        expiresAt: server.expiresAt,
      };
    }

    // gone: server said gone, id absent from the response, or local record already past expiry.
    return {
      record,
      serverStatus: "gone",
      opensCount: null,
      maxOpens: record.maxOpens,
      expiresAt: record.expiresAt,
    };
  });
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/link-reconciliation.test.ts`
Expected: PASS (6 tests).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/links/link-reconciliation.ts apps/mobile/tests/link-reconciliation.test.ts && git commit -m "feat(mobile): pure reconcileSentLinks (active/gone/missing/past-expiry merge)"
```

---

### Task 3.4: `link-display` — pure status derivation + label formatting + toDisplayLink

Pure helpers that turn a `ReconciledLink` into the existing presentational `Link` shape (`src/links/links-data.ts`). `deriveLinkStatus` maps reconciliation + opens/expiry onto the existing `LinkStatus` enum (`available | opened | expiring | revoked | expired`). The label formatters reuse the existing `relativeTime(timestamp, now)` helper from `system/activity-data.ts` (no `date-fns`). `toDisplayLink` assembles the full row + detail object the Links screens already consume.

**Files:**
- Create: `apps/mobile/src/links/link-display.ts`
- Test: `apps/mobile/tests/link-display.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import {
  deriveLinkStatus,
  formatCreatedAtLabel,
  formatExpiresLabel,
  formatTimeLabel,
  toDisplayLink,
} from "@/src/links/link-display";
import type { ReconciledLink } from "@/src/links/link-reconciliation";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

const NOW = new Date("2026-05-31T12:00:00.000Z").getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function baseRecord(over: Partial<SentLinkRecord> & { id: string }): SentLinkRecord {
  return {
    recipientFingerprint: "SM-AAAA-1111" as Fingerprint,
    createdAt: "2026-05-31T10:00:00.000Z",
    expiresAt: new Date(NOW + 3 * DAY).toISOString(),
    maxOpens: 3,
    label: "Q3 board deck",
    schemaVersion: 1,
    ...over,
  };
}

function reconciled(over: Partial<ReconciledLink> & { record: SentLinkRecord }): ReconciledLink {
  return {
    serverStatus: "active",
    opensCount: 0,
    maxOpens: over.record.maxOpens,
    expiresAt: over.record.expiresAt,
    ...over,
  };
}

describe("deriveLinkStatus", () => {
  it("gone -> revoked when no opens were consumed (purged before any open)", () => {
    const r = reconciled({ record: baseRecord({ id: "a" }), serverStatus: "gone", opensCount: null });
    expect(deriveLinkStatus(r, NOW)).toBe("revoked");
  });

  it("gone -> expired when the local expiry is already past (timed out, not revoked)", () => {
    const rec = baseRecord({ id: "a", expiresAt: new Date(NOW - HOUR).toISOString() });
    const r = reconciled({ record: rec, serverStatus: "gone", opensCount: null, expiresAt: rec.expiresAt });
    expect(deriveLinkStatus(r, NOW)).toBe("expired");
  });

  it("active with opens consumed -> opened", () => {
    const r = reconciled({ record: baseRecord({ id: "a" }), serverStatus: "active", opensCount: 2 });
    expect(deriveLinkStatus(r, NOW)).toBe("opened");
  });

  it("active, unopened, expiring within 24h -> expiring", () => {
    const exp = new Date(NOW + 3 * HOUR).toISOString();
    const r = reconciled({ record: baseRecord({ id: "a", expiresAt: exp }), serverStatus: "active", opensCount: 0, expiresAt: exp });
    expect(deriveLinkStatus(r, NOW)).toBe("expiring");
  });

  it("active, unopened, expiry far away -> available", () => {
    const exp = new Date(NOW + 3 * DAY).toISOString();
    const r = reconciled({ record: baseRecord({ id: "a", expiresAt: exp }), serverStatus: "active", opensCount: 0, expiresAt: exp });
    expect(deriveLinkStatus(r, NOW)).toBe("available");
  });
});

describe("label formatters", () => {
  it("formatTimeLabel reuses the relative-time helper (2h ago style with ' ago' suffix)", () => {
    expect(formatTimeLabel(new Date(NOW - 2 * HOUR).toISOString(), NOW)).toBe("2h ago");
    expect(formatTimeLabel(new Date(NOW - 30_000).toISOString(), NOW)).toBe("Now");
  });

  it("formatExpiresLabel renders a future remaining-time, 'Revoked', or 'Expired'", () => {
    const active = reconciled({
      record: baseRecord({ id: "a", expiresAt: new Date(NOW + 3 * HOUR + 42 * 60_000).toISOString() }),
      serverStatus: "active",
      opensCount: 0,
      expiresAt: new Date(NOW + 3 * HOUR + 42 * 60_000).toISOString(),
    });
    expect(formatExpiresLabel(active, NOW)).toBe("in 3h 42m");

    const revoked = reconciled({ record: baseRecord({ id: "a" }), serverStatus: "gone", opensCount: null });
    expect(formatExpiresLabel(revoked, NOW)).toBe("Revoked");

    const expRec = baseRecord({ id: "a", expiresAt: new Date(NOW - HOUR).toISOString() });
    const expired = reconciled({ record: expRec, serverStatus: "gone", opensCount: null, expiresAt: expRec.expiresAt });
    expect(formatExpiresLabel(expired, NOW)).toBe("Expired");
  });

  it("formatCreatedAtLabel renders an absolute date/time string", () => {
    const label = formatCreatedAtLabel("2026-05-31T10:00:00.000Z");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("toDisplayLink", () => {
  it("assembles the presentational Link from a reconciled record", () => {
    const exp = new Date(NOW + 3 * HOUR).toISOString();
    const rec = baseRecord({ id: "disp000000000000", expiresAt: exp, label: "Q3 board deck", maxOpens: 3 });
    const r = reconciled({ record: rec, serverStatus: "active", opensCount: 1, expiresAt: exp, maxOpens: 3 });

    const link = toDisplayLink(r, NOW);
    expect(link.id).toBe("disp000000000000");
    expect(link.to).toBe("Q3 board deck");
    expect(link.status).toBe("opened"); // opensCount > 0
    expect(link.opensUsed).toBe(1);
    expect(link.opensMax).toBe(3);
    expect(link.time).toBe(formatTimeLabel(rec.createdAt, NOW));
    expect(link.recipient.shortFingerprint).toBe("SM-AAAA-1111");
    expect(link.recipient.verified).toBe(false);
    expect(link.url).toContain("disp000000000000");
  });

  it("falls back to a generic title and ∞ max when label is null / maxOpens is -1 (unlimited)", () => {
    const exp = new Date(NOW + 3 * DAY).toISOString();
    const rec = baseRecord({ id: "unlim00000000000", label: null, maxOpens: -1, expiresAt: exp });
    const r = reconciled({ record: rec, serverStatus: "active", opensCount: 0, expiresAt: exp, maxOpens: -1 });

    const link = toDisplayLink(r, NOW);
    expect(link.to).toBe("Secure link");
    expect(link.opensMax).toBeNull();
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/link-display.test.ts`
Expected: FAIL with "Cannot find module '@/src/links/link-display'".
- [ ] **Step 3: Write the implementation**
```ts
import type { Link, LinkStatus } from "@/src/links/links-data";
import type { ReconciledLink } from "@/src/links/link-reconciliation";
import { BASE_URL } from "@/src/api/client";
import { relativeTime } from "@/src/system/activity-data";

// Pure presentation layer for the Links tab: maps a reconciled (local + server) link onto the
// existing LinkStatus enum and the presentational `Link` shape the screens already consume. All
// time math reuses the existing relativeTime() helper (no date-fns). `now` is injected everywhere
// so the derivations are deterministic in tests.
//
// Status semantics (mirrors the design's chip map; see link-status.ts):
//   server gone + already past expiry        -> "expired"  (timed out)
//   server gone otherwise                     -> "revoked"  (purged before timeout)
//   server active + opens consumed            -> "opened"
//   server active + unopened + <24h to expiry -> "expiring"
//   server active + unopened + plenty of time -> "available"

const HOUR = 3_600_000;
const EXPIRING_WINDOW_MS = 24 * HOUR; // "expiring soon" threshold

/** Derive the design LinkStatus from a reconciled link relative to `now`. */
export function deriveLinkStatus(link: ReconciledLink, now: number): LinkStatus {
  const expiresMs = new Date(link.expiresAt).getTime();

  if (link.serverStatus === "gone") {
    return expiresMs <= now ? "expired" : "revoked";
  }

  if ((link.opensCount ?? 0) > 0) return "opened";

  const remaining = expiresMs - now;
  if (remaining <= EXPIRING_WINDOW_MS) return "expiring";
  return "available";
}

/** List-row relative time, e.g. "2h ago" / "Yesterday" (no " ago" suffix on Yesterday/Now). */
export function formatTimeLabel(createdAtIso: string, now: number): string {
  const rel = relativeTime(new Date(createdAtIso).getTime(), now);
  // relativeTime returns compact tokens ("Now" | "12m" | "2h" | "Yesterday" | "3d" | "2w").
  // The design's list rows read "2h ago" / "3d ago"; "Now" and "Yesterday" stand alone.
  if (rel === "Now" || rel === "Yesterday") return rel;
  return `${rel} ago`;
}

/** Detail-screen "Expires" value: remaining time for live links; "Revoked"/"Expired" otherwise. */
export function formatExpiresLabel(link: ReconciledLink, now: number): string {
  const expiresMs = new Date(link.expiresAt).getTime();
  if (link.serverStatus === "gone") {
    return expiresMs <= now ? "Expired" : "Revoked";
  }
  return formatRemaining(expiresMs - now);
}

/** Detail-screen "Created" value: an absolute, human date/time (locale string). */
export function formatCreatedAtLabel(createdAtIso: string): string {
  const d = new Date(createdAtIso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Assemble the presentational `Link` the Links screens consume from a reconciled record. */
export function toDisplayLink(link: ReconciledLink, now: number): Link {
  const status = deriveLinkStatus(link, now);
  const fp = link.record.recipientFingerprint as string;
  const opensMax = link.maxOpens === -1 ? null : link.maxOpens;
  return {
    id: link.record.id,
    to: link.record.label && link.record.label.length > 0 ? link.record.label : "Secure link",
    recipient: {
      // Sender-side tracking has no recipient display name (web has none either); show the
      // fingerprint, unverified — the verified state lives in the Contacts directory, not here.
      name: link.record.label && link.record.label.length > 0 ? link.record.label : "Secure link",
      shortFingerprint: fp,
      verified: false,
    },
    createdAt: formatCreatedAtLabel(link.record.createdAt),
    time: formatTimeLabel(link.record.createdAt, now),
    status,
    opensUsed: link.opensCount ?? 0,
    opensMax,
    url: `${BASE_URL}/l/${link.record.id}`,
    expiresLabel: formatExpiresLabel(link, now),
  };
}

// ── Remaining-time formatting ──────────────────────────────────────────────────
// "in 3h 42m" / "in 4 days" / "in 12m". Compact, matching the design's S_LinkDetails examples.
const MINUTE = 60_000;
const DAY = 24 * HOUR;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY);
    return days === 1 ? "in 1 day" : `in ${days} days`;
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes > 0 ? `in ${hours}h ${minutes}m` : `in ${hours}h`;
  }
  const minutes = Math.max(1, Math.floor(ms / MINUTE));
  return `in ${minutes}m`;
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/link-display.test.ts`
Expected: PASS (all describe blocks green).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/links/link-display.ts apps/mobile/tests/link-display.test.ts && git commit -m "feat(mobile): pure link-display (status derivation + expiry/created/time labels + toDisplayLink)"
```

---

### Task 3.5: `api/client.ts` — add `listMessages(ids)` and `revokeLink(id)`

Extend the existing API client with the two endpoints the web app uses: `POST /api/messages/list` (bulk status fetch) and `POST /api/messages/[id]/revoke` (idempotent revoke). Response shapes are taken verbatim from `apps/web/src/server/messages-handler.ts` (`createListMessagesHandler` / `createRevokeMessageHandler`). Follows the file's existing `fetch` + `ApiError` pattern and the test style in `tests/api-client.test.ts`.

**Files:**
- Modify: `apps/mobile/src/api/client.ts:62-70` (append the two new functions + their request/response types after `postMessage`)
- Test: `apps/mobile/tests/api-client-links.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

// expo-constants statically imports react-native (Flow syntax), unparseable under Node vitest, so
// it MUST be mocked. Empty base URL mirrors client.ts's `?? ""`, keeping request paths root-relative.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "" } } },
}));

import { ApiError, listMessages, revokeLink } from "@/src/api/client";

afterEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("listMessages", () => {
  it("POSTs the ids array to /api/messages/list and returns the parsed results", async () => {
    const body = {
      results: [
        { id: "aaaaaaaaaaaaaaaa", status: "active", expiresAt: "2026-06-01T10:00:00.000Z", maxOpens: 3, opensCount: 1 },
        { id: "bbbbbbbbbbbbbbbb", status: "gone" },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));

    const res = await listMessages(["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"]);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/messages\/list$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ ids: ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"] });
    expect(res).toEqual(body);
  });

  it("returns { results: [] } without a network call when ids is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await listMessages([]);
    expect(res).toEqual({ results: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws ApiError carrying the status on a non-ok response (429 rate limited)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 429));
    await expect(listMessages(["aaaaaaaaaaaaaaaa"])).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
    });
  });
});

describe("revokeLink", () => {
  it("POSTs to /api/messages/:id/revoke and resolves on success", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ id: "aaaaaaaaaaaaaaaa", status: "revoked" }));

    await revokeLink("aaaaaaaaaaaaaaaa");

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/messages/aaaaaaaaaaaaaaaa/revoke");
    expect(init?.method).toBe("POST");
  });

  it("throws ApiError on a non-ok revoke response (400 bad id)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 400));
    await expect(revokeLink("../../etc")).rejects.toMatchObject({ name: "ApiError", status: 400 });
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/api-client-links.test.ts`
Expected: FAIL with "listMessages is not exported" / "revokeLink is not exported" by `@/src/api/client`.
- [ ] **Step 3: Write the implementation**
Append to `apps/mobile/src/api/client.ts` after `postMessage` (current end of file, after line 70):
```ts

// ── Sent-links list + revoke (mirrors the web /links page) ──────────────────────
// One result per requested id. The server only echoes a live row as { status: "active", … };
// not_found / revoked / expired / past-expiry all collapse to { status: "gone" }.
export type ListMessageResult =
  | { id: string; status: "gone" }
  | {
      id: string;
      status: "active";
      expiresAt: string;
      maxOpens: number;
      opensCount: number;
    };

export interface ListMessagesResponse {
  results: ListMessageResult[];
}

// Bulk status fetch for the sender's locally-tracked links. Metadata only — never consumes an open
// and never returns ciphertext. An empty id list short-circuits (the server rejects [] as 400).
export async function listMessages(ids: string[]): Promise<ListMessagesResponse> {
  if (ids.length === 0) return { results: [] };
  const res = await fetch(`${BASE_URL}/api/messages/list`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as ListMessagesResponse;
}

// Revoke a link: purges the ciphertext server-side. Idempotent + unauthenticated in Phase 1 (anyone
// with the id can revoke; matches the web behavior). Resolves on success, throws ApiError otherwise.
export async function revokeLink(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/messages/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
  });
  if (!res.ok) throw new ApiError(res.status);
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/api-client-links.test.ts`
Expected: PASS (5 tests).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/api/client.ts apps/mobile/tests/api-client-links.test.ts && git commit -m "feat(mobile): api client listMessages + revokeLink (mirror web /links endpoints)"
```

---

### Task 3.6: `create-and-seal.ts` — record the sent link after a successful POST

After `postMessage(...)` succeeds, persist a `SentLinkRecord` so the Links tab can track and reconcile it. The record carries only sender-derivable metadata (id, recipient fingerprint, expiry, max-opens, createdAt, optional label) — never plaintext. An optional `label` field is threaded onto `CreateAndSealInput` so the compose flow can name the link without a schema break.

**Files:**
- Modify: `apps/mobile/src/create/create-and-seal.ts:1-60` (add the import + `label` input field + the `recordSentLink` call after the successful `postMessage`)
- Test: `apps/mobile/tests/create-and-seal-record.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { exportPublicKey, generateIdentity } from "@aesmsg/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "https://send.test" } } },
}));

// Capture sent-links recording without touching the encrypted store under node-env.
const { recordSentLinkMock } = vi.hoisted(() => ({ recordSentLinkMock: vi.fn(async () => {}) }));
vi.mock("@/src/links/sent-links-store", () => ({ recordSentLink: recordSentLinkMock }));

import { createAndSeal } from "@/src/create/create-and-seal";

describe("createAndSeal records the sent link", () => {
  beforeEach(() => recordSentLinkMock.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it("calls recordSentLink with sender-derivable metadata after a successful POST", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const posted = JSON.parse(String((init as RequestInit).body)) as { id: string };
      return new Response(JSON.stringify({ id: posted.id }), { status: 201 });
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const out = await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "secret",
      expiresAt,
      maxOpens: 3,
      label: "Q3 board deck",
    });

    expect(recordSentLinkMock).toHaveBeenCalledTimes(1);
    const rec = recordSentLinkMock.mock.calls[0]?.[0];
    expect(rec).toMatchObject({
      id: out.id,
      recipientFingerprint: out.recipientFingerprint,
      expiresAt: expiresAt.toISOString(),
      maxOpens: 3,
      label: "Q3 board deck",
    });
    expect(typeof rec.createdAt).toBe("string");
    // createdAt must be a valid ISO timestamp the reconciler can parse.
    expect(Number.isNaN(new Date(rec.createdAt).getTime())).toBe(false);
    // plaintext must never be recorded.
    expect(JSON.stringify(rec)).not.toContain("secret");
  });

  it("does NOT record when the POST fails (no orphan tracking record)", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    await expect(
      createAndSeal({
        recipientPublicKeyString: recipientKey,
        message: "secret",
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 1,
      }),
    ).rejects.toBeTruthy();
    expect(recordSentLinkMock).not.toHaveBeenCalled();
  });

  it("records label as null when none is supplied", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const posted = JSON.parse(String((init as RequestInit).body)) as { id: string };
      return new Response(JSON.stringify({ id: posted.id }), { status: 201 });
    });

    await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "x",
      expiresAt: new Date(Date.now() + 60_000),
      maxOpens: 1,
    });

    expect(recordSentLinkMock.mock.calls[0]?.[0].label).toBeNull();
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/create-and-seal-record.test.ts`
Expected: FAIL — `recordSentLink` is never called (no recording wired) so `toHaveBeenCalledTimes(1)` fails.
- [ ] **Step 3: Write the implementation**
Edit `apps/mobile/src/create/create-and-seal.ts`. Add the import after line 11 (`import { generateLinkId } ...`):
```ts
import { recordSentLink } from "@/src/links/sent-links-store";
```
Add the optional `label` field to `CreateAndSealInput` (currently lines 14-19):
```ts
export interface CreateAndSealInput {
  recipientPublicKeyString: string;
  message: string;
  expiresAt: Date;
  maxOpens: number;
  /** Optional human label for the sender's local link tracking (never sent to the server). */
  label?: string | null;
}
```
Replace the `await postMessage({...})` block (currently lines 50-55) + the trailing `return` with the recording step inserted between them:
```ts
  await postMessage({
    id,
    ciphertext: bytesToBase64(ciphertext as unknown as Uint8Array),
    expiresAt: input.expiresAt.toISOString(),
    maxOpens: input.maxOpens,
  });

  // Record the link locally for the Links tab AFTER a successful POST (so a failed upload leaves no
  // orphan tracking row). Sender-derivable metadata only — id, recipient fingerprint, expiry,
  // max-opens, createdAt, optional local label. Plaintext is never recorded.
  await recordSentLink({
    id,
    recipientFingerprint,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    maxOpens: input.maxOpens,
    label: input.label ?? null,
  });

  // The link must point at the WEB host so a recipient without the app falls back to the web
  // reader, and a recipient with the app deep-links in. BASE_URL is the configured web origin.
  return { id, url: `${BASE_URL}/l/${id}`, recipientFingerprint };
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/create-and-seal-record.test.ts`
Expected: PASS (3 tests). Also re-run the existing `tests/create-and-seal.test.ts` to confirm no regression: `pnpm --filter @aesmsg/mobile test tests/create-and-seal.test.ts` → PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/create/create-and-seal.ts apps/mobile/tests/create-and-seal-record.test.ts && git commit -m "feat(mobile): record sent link after successful POST (metadata-only, label optional)"
```

---

### Task 3.7: `use-sent-links` hook — load + reconcile + refresh + revoke/delete

A thin React hook that the Links screen consumes. It loads local records, fetches live status via `listMessages`, reconciles, and exposes the resulting display `Link[]` plus `loading` / `error` flags and the four actions (`refresh`, `recordNewLink`, `revokeAndDelete`, `deleteLocal`). Because the load/reconcile pipeline is the only non-trivial logic and it must be node-testable, it lives in a pure exported helper `loadAndReconcile(deps, now)` (DI: store + api + clock) that the hook calls; the hook itself is exercised on-device.

**Files:**
- Create: `apps/mobile/src/links/use-sent-links.ts`
- Test: `apps/mobile/tests/use-sent-links-load.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";
import { loadAndReconcile, type SentLinksDeps } from "@/src/links/use-sent-links";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

const NOW = new Date("2026-05-31T12:00:00.000Z").getTime();
const DAY = 24 * 3_600_000;

function rec(over: Partial<SentLinkRecord> & { id: string }): SentLinkRecord {
  return {
    recipientFingerprint: "SM-AAAA-1111" as Fingerprint,
    createdAt: "2026-05-31T10:00:00.000Z",
    expiresAt: new Date(NOW + 3 * DAY).toISOString(),
    maxOpens: 3,
    label: "deck",
    schemaVersion: 1,
    ...over,
  };
}

describe("loadAndReconcile", () => {
  it("loads local records, fetches their ids, reconciles, and returns display links newest-first", async () => {
    const newer = rec({ id: "newer00000000000", createdAt: "2026-05-31T11:00:00.000Z" });
    const older = rec({ id: "older00000000000", createdAt: "2026-05-30T11:00:00.000Z" });
    const listSentLinks = vi.fn(async () => [newer, older]); // store already sorts newest-first
    const listMessages = vi.fn(async (ids: string[]) => ({
      results: ids.map((id) => ({
        id,
        status: "active" as const,
        expiresAt: new Date(NOW + 3 * DAY).toISOString(),
        maxOpens: 3,
        opensCount: 0,
      })),
    }));

    const deps: SentLinksDeps = { listSentLinks, listMessages, revokeLink: vi.fn(), deleteSentLink: vi.fn() };
    const links = await loadAndReconcile(deps, NOW);

    expect(listMessages).toHaveBeenCalledWith(["newer00000000000", "older00000000000"]);
    expect(links.map((l) => l.id)).toEqual(["newer00000000000", "older00000000000"]);
    expect(links[0]?.status).toBe("available");
  });

  it("returns [] without calling listMessages when there are no local records", async () => {
    const listMessages = vi.fn();
    const deps: SentLinksDeps = {
      listSentLinks: vi.fn(async () => []),
      listMessages,
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
    };
    expect(await loadAndReconcile(deps, NOW)).toEqual([]);
    expect(listMessages).not.toHaveBeenCalled();
  });

  it("falls back to all-gone when the server fetch throws (links still render, marked revoked/expired)", async () => {
    const r = rec({ id: "offline000000000" });
    const deps: SentLinksDeps = {
      listSentLinks: vi.fn(async () => [r]),
      listMessages: vi.fn(async () => {
        throw new Error("network down");
      }),
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
    };

    const links = await loadAndReconcile(deps, NOW);
    expect(links).toHaveLength(1);
    // future expiry + server unreachable -> treated as gone -> "revoked" label per deriveLinkStatus
    expect(links[0]?.status).toBe("revoked");
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test tests/use-sent-links-load.test.ts`
Expected: FAIL with "Cannot find module '@/src/links/use-sent-links'".
- [ ] **Step 3: Write the implementation**
```ts
import { useCallback, useEffect, useState } from "react";
import { listMessages as apiListMessages, revokeLink as apiRevokeLink } from "@/src/api/client";
import type { Link } from "@/src/links/links-data";
import { type ListMessagesResponse, reconcileSentLinks } from "@/src/links/link-reconciliation";
import { toDisplayLink } from "@/src/links/link-display";
import {
  deleteSentLink as storeDeleteSentLink,
  listSentLinks as storeListSentLinks,
  recordSentLink,
  type SentLinkRecord,
} from "@/src/links/sent-links-store";

// useSentLinks — the Links tab's data hook. Loads locally-tracked records, fetches their live
// server status in one bulk call, reconciles, and exposes the resulting display links plus
// loading/error flags and the mutating actions. The pure load+reconcile pipeline is extracted as
// loadAndReconcile(deps, now) so it is node-testable via DI (store + api + injected clock); the hook
// is the thin React wrapper exercised on-device.
//
// Refresh strategy: load on mount + manual refresh() (pull-to-refresh). No background sync (YAGNI).

/** Injected dependencies for the pure pipeline (store + api). */
export interface SentLinksDeps {
  listSentLinks: () => Promise<SentLinkRecord[]>;
  listMessages: (ids: string[]) => Promise<ListMessagesResponse>;
  revokeLink: (id: string) => Promise<void>;
  deleteSentLink: (id: string) => Promise<void>;
}

const productionDeps: SentLinksDeps = {
  listSentLinks: storeListSentLinks,
  listMessages: apiListMessages,
  revokeLink: apiRevokeLink,
  deleteSentLink: storeDeleteSentLink,
};

/**
 * Pure load pipeline: read local records, fetch live status, reconcile, map to display links.
 * If the server fetch fails (offline), reconcile against an empty response so links still render —
 * each is treated as gone (revoked/expired), never hidden. `now` is injected for determinism.
 */
export async function loadAndReconcile(deps: SentLinksDeps, now: number): Promise<Link[]> {
  const records = await deps.listSentLinks();
  if (records.length === 0) return [];

  let server: ListMessagesResponse;
  try {
    server = await deps.listMessages(records.map((r) => r.id));
  } catch {
    server = { results: [] };
  }

  return reconcileSentLinks(records, server, now).map((r) => toDisplayLink(r, now));
}

export interface UseSentLinksResult {
  links: Link[];
  loading: boolean;
  /** True only when the last load failed at the local-store level (server failures degrade to gone). */
  error: boolean;
  refresh: () => Promise<void>;
  recordNewLink: (record: Omit<SentLinkRecord, "schemaVersion">) => Promise<void>;
  revokeAndDelete: (id: string) => Promise<void>;
  deleteLocal: (id: string) => Promise<void>;
}

export function useSentLinks(deps: SentLinksDeps = productionDeps): UseSentLinksResult {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setLinks(await loadAndReconcile(deps, Date.now()));
    } catch {
      // Only a local-store read failure reaches here (server failures are swallowed inside the
      // pipeline). Surface a non-fatal "couldn't load" state rather than crashing the tab.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [deps]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recordNewLink = useCallback(
    async (record: Omit<SentLinkRecord, "schemaVersion">) => {
      await recordSentLink(record);
      await refresh();
    },
    [refresh],
  );

  const revokeAndDelete = useCallback(
    async (id: string) => {
      // Revoke purges the ciphertext server-side; then drop the local tracking record.
      await deps.revokeLink(id);
      await deps.deleteSentLink(id);
      await refresh();
    },
    [deps, refresh],
  );

  const deleteLocal = useCallback(
    async (id: string) => {
      await deps.deleteSentLink(id);
      await refresh();
    },
    [deps, refresh],
  );

  return { links, loading, error, refresh, recordNewLink, revokeAndDelete, deleteLocal };
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test tests/use-sent-links-load.test.ts`
Expected: PASS (3 tests).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/links/use-sent-links.ts apps/mobile/tests/use-sent-links-load.test.ts && git commit -m "feat(mobile): useSentLinks hook + pure loadAndReconcile pipeline (offline-safe)"
```

---

### Task 3.8: `links-data.ts` — drop SEED_LINKS, keep type exports

Remove the mock seed array now that links come from the store. The `Link` / `LinkRecipient` / `LinkStatus` type exports stay — `LinksFlow`, `LinkRowCard`, `LinkDetailsScreen`, `link-display`, and `link-reconciliation` all import them.

**Files:**
- Modify: `apps/mobile/src/links/links-data.ts:1-121` (delete `SEED_LINKS` const + its leading comment block; keep the interfaces + `LinkStatus` re-export)

- [ ] **Step 1: No new test** — this is a deletion guarded by typecheck + the suite. The type exports are covered transitively by the consuming modules' tests (3.3, 3.4).
- [ ] **Step 2: Confirm current consumers before editing**
Run: `grep -rn "SEED_LINKS" apps/mobile/src apps/mobile/tests`
Expected: after Task 3.9 lands, only `links-data.ts` itself should match. (If `LinksFlow.tsx` still matches here, do Task 3.9 first — they share this file's exports; sequence 3.9 before 3.8, or land them together.)
- [ ] **Step 3: Apply the edit**
Replace the file's header comment (lines 1-8) so it no longer claims to seed sample links, and delete the entire `export const SEED_LINKS: Link[] = [ ... ];` block (lines 47-121, including its leading comment on lines 46-47). The final file is exactly:
```ts
// Type definitions for the Links tab. The actual records now come from the encrypted on-device
// sent-links store, reconciled with the server's live status (see sent-links-store.ts /
// link-reconciliation.ts / link-display.ts). This module is types-only — no sample data.
//
// PRODUCT INVARIANT: a Link carries encrypted-message metadata only (id, recipient fingerprint,
// expiry, max opens, status, opaque pointer URL) — never plaintext.

import type { LinkStatus } from "@/src/links/link-status";

export type { LinkStatus } from "@/src/links/link-status";

/** A recipient as shown on the link detail screen (verified contact). */
export interface LinkRecipient {
  /** Display name (e.g. "Elena Rodriguez"). */
  name: string;
  /** Short fingerprint, mono-styled (e.g. "A1B2 C3D4"). */
  shortFingerprint: string;
  /** Whether the recipient's key is verified (emerald check). */
  verified: boolean;
}

export interface Link {
  id: string;
  /** Row title, "<subject> → <recipient>" exactly as the design shows it. */
  to: string;
  /** Recipient detail shown on the link detail screen. */
  recipient: LinkRecipient;
  /** Absolute "Created" value from the detail screen. */
  createdAt: string;
  /** Relative time shown in the list row (e.g. "2h ago"). */
  time: string;
  status: LinkStatus;
  /** Opens consumed so far. */
  opensUsed: number;
  /** Max opens; null = unlimited (rendered as ∞). */
  opensMax: number | null;
  // ── Detail-only metadata (mirrors S_LinkDetails) ──────────────────────────
  /** Opaque pointer link, mono-styled, truncated in the middle (e.g. "aesmsg.to/l/9fA2·…·tdN0"). */
  url: string;
  /** "Expires" value shown on the detail screen (amber when expiring, e.g. "in 3h 42m"). */
  expiresLabel: string;
}
```
- [ ] **Step 4: Verify typecheck + suite are green**
Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm --filter @aesmsg/mobile test`
Expected: PASS (no remaining `SEED_LINKS` references; all link tests still green).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/links/links-data.ts && git commit -m "refactor(mobile): drop SEED_LINKS mock; links-data is types-only"
```

---

### Task 3.9: `LinksFlow.tsx` — drive the tab from `useSentLinks()` (loading / empty / error)

Replace the local `useState(SEED_LINKS)` mock + the inline revoke/delete mutators with `useSentLinks()`. Add a loading state (initial fetch), keep the existing empty state, and add a non-fatal error state ("couldn't load — Retry"). Revoke now calls `revokeAndDelete` (purge server-side + drop locally) and returns to the list; Delete calls `deleteLocal`. This is screen wiring that cannot run under node-env tests, so it carries a manual iOS-simulator checklist instead of an automated test.

**Files:**
- Modify: `apps/mobile/src/links/LinksFlow.tsx:1-87` (full rewrite of the component body)

- [ ] **Step 1 (no automated test — native-backed screen wiring)**
Per the apps/mobile convention, all non-trivial logic already lives in tested pure modules (`loadAndReconcile`, `reconcileSentLinks`, `toDisplayLink`). This task is the thin React wiring; verify it on the simulator in Step 4.
- [ ] **Step 2: Confirm the hook + screens it consumes exist**
Run: `grep -rn "export function useSentLinks" apps/mobile/src/links/use-sent-links.ts`
Expected: one match (Task 3.7 landed).
- [ ] **Step 3: Write the implementation**
Replace the entire contents of `apps/mobile/src/links/LinksFlow.tsx` with:
```tsx
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button, LargeTitle, Screen } from "@/src/components";
import { LinkDetailsScreen } from "@/src/links/LinkDetailsScreen";
import { LinksEmptyScreen } from "@/src/links/LinksEmptyScreen";
import { LinksListScreen } from "@/src/links/LinksListScreen";
import { RevokeConfirmSheet } from "@/src/links/RevokeConfirmSheet";
import { useSentLinks } from "@/src/links/use-sent-links";
import { colors } from "@/src/theme";
import { useState } from "react";

// LinksFlow — the Links tab's internal stack, now backed by the real encrypted sent-links store +
// server reconciliation via useSentLinks(). Self-contained navigation (no react-navigation; the
// Integration phase owns the tab shell). Routes:
//   list   <-> details   (tap a row / back)
//   details -> revoke sheet (Revoke link -> purge server-side + drop locally -> back to list)
//   empty / loading / error  (store + fetch lifecycle states)
//
// `onCreate` is a no-op placeholder until the tab shell can navigate to the Encrypt tab.

type Route = { name: "list" } | { name: "details"; id: string };

export interface LinksFlowProps {
  /** Navigate to the Encrypt/compose flow (wired by the Integration phase). */
  onCreate?: () => void;
}

export function LinksFlow({ onCreate }: LinksFlowProps = {}) {
  const { links, loading, error, refresh, revokeAndDelete, deleteLocal } = useSentLinks();
  const [route, setRoute] = useState<Route>({ name: "list" });
  const [revokeVisible, setRevokeVisible] = useState(false);

  const selected = route.name === "details" ? (links.find((l) => l.id === route.id) ?? null) : null;

  function openLink(id: string) {
    setRoute({ name: "details", id });
  }

  function backToList() {
    setRevokeVisible(false);
    setRoute({ name: "list" });
  }

  async function confirmRevoke() {
    if (selected) await revokeAndDelete(selected.id);
    setRevokeVisible(false);
    setRoute({ name: "list" });
  }

  async function deleteLink() {
    if (selected) await deleteLocal(selected.id);
    setRoute({ name: "list" });
  }

  // Initial load — show a spinner under the "Links" title (avoids a flash of the empty state).
  if (loading && links.length === 0) {
    return (
      <Screen contentStyle={styles.fill}>
        <LargeTitle title="Links" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  // Non-fatal load failure (local store unreadable). Honest copy + retry — never a silent wipe.
  if (error && links.length === 0) {
    return (
      <Screen contentStyle={styles.fill}>
        <LargeTitle title="Links" />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't load your links</Text>
          <Text style={styles.errorBody}>
            Your link history couldn't be read on this device. Your data hasn't been deleted.
          </Text>
          <Button kind="outline" onPress={() => void refresh()} style={styles.retry}>
            Retry
          </Button>
        </View>
      </Screen>
    );
  }

  // Empty state — no links at all.
  if (links.length === 0) {
    return <LinksEmptyScreen onCreate={() => onCreate?.()} />;
  }

  // Details route (falls back to the list if the selected id was deleted/refreshed away).
  if (route.name === "details" && selected) {
    return (
      <>
        <LinkDetailsScreen
          link={selected}
          onBack={backToList}
          onRevoke={() => setRevokeVisible(true)}
          onDelete={() => void deleteLink()}
        />
        <RevokeConfirmSheet
          visible={revokeVisible}
          link={selected}
          onCancel={() => setRevokeVisible(false)}
          onConfirm={() => void confirmRevoke()}
        />
      </>
    );
  }

  // Default: the list. (Pull-to-refresh wiring lives inside LinksListScreen's scroll view when the
  // Integration phase threads `refresh`; the hook already reloads on mount + after every mutation.)
  return <LinksListScreen links={links} onOpenLink={openLink} />;
}

export default LinksFlow;

const styles = StyleSheet.create({
  fill: {
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 22,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.onSurface,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 300,
  },
  retry: {
    marginTop: 8,
    width: "auto",
    paddingHorizontal: 24,
    alignSelf: "center",
  },
});
```
- [ ] **Step 4: Verify on the iOS simulator**
Build/run per the project recipe (`project_mobile_ios_build` memory: `pod install` with macOS `SDKROOT`/`LIBRARY_PATH`, then `xcodebuild`, then launch on the sim). Then, in the running app:
  1. With a fresh identity and no sent links, open the **Links** tab → confirm the **empty state** ("No secure links yet").
  2. Go to **Encrypt**, paste a public key, set 24h expiry / 3 opens, send → return to **Links** → confirm the new link appears at the **top** with an **Available**/**Expiring** chip and a "Xm ago" subtitle.
  3. Open the link's detail → tap **Revoke link** → confirm in the sheet → confirm the row **disappears** from the list (revoke purges server-side, then drops the local record).
  4. Send another link, open its detail, tap **Delete** → confirm the row disappears (local-only delete).
  5. Toggle the device to **airplane mode**, reopen the Links tab (or pull to refresh) → confirm existing links still render (degraded to revoked/expired styling) and the tab does **not** crash.
  6. Force-quit + relaunch the app → confirm the sent links **persist** (encrypted-at-rest store survives restart).
  7. Wipe the identity (Keys → wipe) → relaunch → confirm the Links tab shows the **empty state** (DEK + blobs wiped with the identity).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/links/LinksFlow.tsx && git commit -m "feat(mobile): drive Links tab from useSentLinks (loading/empty/error + real revoke/delete)"
```

---

## Phase 4: Settings — persist + behavior wiring

> This phase delivers persisted, behavior-wired settings for apps/mobile: a pure validation/migration/derivation module (settings-format.ts) and an encrypted settings-store over Phase 1's getEncryptedStore() under key "settings" (corrupt/missing -> SETTINGS_DEFAULTS), both TDD with node-env Vitest; a SettingsProvider/useSettings context that auto-persists; and the end-to-end behavior wiring per the spec's honest matrix — appLockTimeout into identity auto-lock, blurPreview+blockScreens into the privacy shield (expo-screen-capture), clipboardClearSeconds into reader clipboard auto-clear, autoWipe into the reader, and the three settings screens reading/writing through useSettings. Pure modules are independently testable in node-env; native/React wiring carries exact code edits plus iOS-simulator verify checklists.

### Task 4.1: Pure settings model + validation/migration (`settings-format.ts`)

This adds the `SettingsRecord` shape, `SETTINGS_DEFAULTS`, and the four pure functions the spec names (`validateSettings`, `migrateSettings`, `appLockTimeoutMs`, `isValidClipboardSeconds`) into the EXISTING `src/settings/settings-format.ts` (which already holds the clipboard-slider + fingerprint helpers — we extend it, we do not replace it). `clampClipboardSeconds` already exists there and is reused for the clamp.

**Files:**
- Modify: `apps/mobile/src/settings/settings-format.ts:1-62` (append the new model + functions; do not touch the existing exports)
- Test: `apps/mobile/tests/settings-record.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// apps/mobile/tests/settings-record.test.ts
import { describe, expect, it } from "vitest";
import {
  appLockTimeoutMs,
  isValidClipboardSeconds,
  migrateSettings,
  SETTINGS_DEFAULTS,
  type SettingsRecord,
  validateSettings,
} from "@/src/settings/settings-format";

// Pure validation / migration / derivation backing the persisted Settings store. Tested per the
// node-env / no-React-renderer convention. The store (settings-store.ts) layers persistence on top
// of these; the screens read derived values through useSettings.

describe("SETTINGS_DEFAULTS", () => {
  it("matches the spec defaults exactly", () => {
    expect(SETTINGS_DEFAULTS.biometric).toBe(true);
    expect(SETTINGS_DEFAULTS.requireUnlock).toBe(true);
    expect(SETTINGS_DEFAULTS.blurPreview).toBe(true);
    expect(SETTINGS_DEFAULTS.blockScreens).toBe(true);
    expect(SETTINGS_DEFAULTS.autoWipe).toBe(true);
    expect(SETTINGS_DEFAULTS.clipboardClearSeconds).toBe(45);
    expect(SETTINGS_DEFAULTS.appLockTimeout).toBe("never");
    expect(SETTINGS_DEFAULTS.analytics).toBe(false);
    expect(SETTINGS_DEFAULTS.quietHoursEnabled).toBe(false);
    expect(SETTINGS_DEFAULTS.quietHoursFrom).toBe("22:00");
    expect(SETTINGS_DEFAULTS.quietHoursTo).toBe("07:00");
    expect(SETTINGS_DEFAULTS.schemaVersion).toBe(1);
  });

  it("is returned as a fresh copy (callers can mutate without poisoning the shared default)", () => {
    const a = { ...SETTINGS_DEFAULTS };
    a.biometric = false;
    expect(SETTINGS_DEFAULTS.biometric).toBe(true);
  });
});

describe("isValidClipboardSeconds", () => {
  it("accepts integers inside the 10..90 range", () => {
    expect(isValidClipboardSeconds(10)).toBe(true);
    expect(isValidClipboardSeconds(45)).toBe(true);
    expect(isValidClipboardSeconds(90)).toBe(true);
  });

  it("rejects out-of-range, non-finite, and non-integer values", () => {
    expect(isValidClipboardSeconds(9)).toBe(false);
    expect(isValidClipboardSeconds(91)).toBe(false);
    expect(isValidClipboardSeconds(45.5)).toBe(false);
    expect(isValidClipboardSeconds(Number.NaN)).toBe(false);
    expect(isValidClipboardSeconds(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("appLockTimeoutMs", () => {
  it("maps 'never' to null (no auto-lock-on-timeout)", () => {
    expect(appLockTimeoutMs("never")).toBeNull();
  });

  it("maps each labelled window to milliseconds", () => {
    expect(appLockTimeoutMs("1m")).toBe(60_000);
    expect(appLockTimeoutMs("5m")).toBe(5 * 60_000);
    expect(appLockTimeoutMs("15m")).toBe(15 * 60_000);
    expect(appLockTimeoutMs("1h")).toBe(60 * 60_000);
  });
});

describe("validateSettings", () => {
  it("returns a complete record unchanged (round-trips a valid blob)", () => {
    const valid: SettingsRecord = {
      ...SETTINGS_DEFAULTS,
      biometric: false,
      clipboardClearSeconds: 30,
      appLockTimeout: "5m",
      createdAt: 111,
      updatedAt: 222,
    };
    expect(validateSettings(valid)).toEqual(valid);
  });

  it("fills missing / wrong-typed fields from defaults (a single bad field never discards the rest)", () => {
    const partial = {
      biometric: false,
      clipboardClearSeconds: 999, // out of range -> default
      appLockTimeout: "bogus", // not in the union -> default
      analytics: "yes", // wrong type -> default
    } as unknown;
    const out = validateSettings(partial);
    expect(out.biometric).toBe(false); // valid field preserved
    expect(out.clipboardClearSeconds).toBe(SETTINGS_DEFAULTS.clipboardClearSeconds);
    expect(out.appLockTimeout).toBe(SETTINGS_DEFAULTS.appLockTimeout);
    expect(out.analytics).toBe(SETTINGS_DEFAULTS.analytics);
    expect(out.schemaVersion).toBe(1);
  });

  it("returns defaults for null / non-object input", () => {
    expect(validateSettings(null)).toEqual(SETTINGS_DEFAULTS);
    expect(validateSettings(42)).toEqual(SETTINGS_DEFAULTS);
    expect(validateSettings("nope")).toEqual(SETTINGS_DEFAULTS);
  });

  it("validates quiet-hours HH:MM strings, falling back on malformed times", () => {
    const out = validateSettings({ ...SETTINGS_DEFAULTS, quietHoursFrom: "25:99", quietHoursTo: "ab:cd" });
    expect(out.quietHoursFrom).toBe(SETTINGS_DEFAULTS.quietHoursFrom);
    expect(out.quietHoursTo).toBe(SETTINGS_DEFAULTS.quietHoursTo);
  });
});

describe("migrateSettings", () => {
  it("passes a current-schema record through validation", () => {
    const rec = { ...SETTINGS_DEFAULTS, biometric: false };
    expect(migrateSettings(rec)).toEqual(rec);
  });

  it("treats an unknown/future schemaVersion as best-effort: keeps recognised fields, fills the rest", () => {
    const future = { ...SETTINGS_DEFAULTS, schemaVersion: 99, biometric: false, somethingNew: true } as unknown;
    const out = migrateSettings(future);
    expect(out.schemaVersion).toBe(1); // normalised to the version this build understands
    expect(out.biometric).toBe(false); // recognised field preserved
    expect("somethingNew" in out).toBe(false); // unknown field dropped
  });

  it("returns defaults for null input", () => {
    expect(migrateSettings(null)).toEqual(SETTINGS_DEFAULTS);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test settings-record`
Expected: FAIL — `validateSettings`, `migrateSettings`, `appLockTimeoutMs`, `isValidClipboardSeconds`, `SETTINGS_DEFAULTS`, and the `SettingsRecord` type are not exported from `settings-format.ts` (import/`TypeError` / "is not a function").

- [ ] **Step 3: Write the implementation**
Append to `apps/mobile/src/settings/settings-format.ts` (after the existing `formatFingerprintGroups` block, keeping every existing export intact):
```ts
// ── Persisted settings model (§4) ────────────────────────────────────────────
// The encrypted on-device preferences blob. Stored as JSON in the single EncryptedStore under the
// "settings" key. validate/migrate below guarantee a load NEVER throws on a partially-corrupt or
// stale-schema blob — a single bad field falls back to its default, never discarding the record.

export type AppLockTimeout = "never" | "1m" | "5m" | "15m" | "1h";

export interface SettingsRecord {
  biometric: boolean; // persisted; not a true on/off this slice (see §6)
  requireUnlock: boolean;
  blurPreview: boolean; // -> privacy-shield blur-on-background
  blockScreens: boolean; // -> expo-screen-capture prevent/allow
  autoWipe: boolean; // -> reader auto-wipe of decrypted content
  clipboardClearSeconds: number; // 10..90, integer
  appLockTimeout: AppLockTimeout; // "never" => no timeout-lock
  analytics: boolean; // persisted only — no SDK, nothing sent
  quietHoursEnabled: boolean; // display-only this slice
  quietHoursFrom: string; // "HH:MM"
  quietHoursTo: string; // "HH:MM"
  schemaVersion: 1;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

const SETTINGS_SCHEMA_VERSION = 1 as const;

// A frozen baseline; SETTINGS_DEFAULTS is a getter-style fresh copy so callers can mutate freely.
const SETTINGS_DEFAULTS_BASE: Omit<SettingsRecord, "createdAt" | "updatedAt"> = {
  biometric: true,
  requireUnlock: true,
  blurPreview: true,
  blockScreens: true,
  autoWipe: true,
  clipboardClearSeconds: 45,
  appLockTimeout: "never",
  analytics: false,
  quietHoursEnabled: false,
  quietHoursFrom: "22:00",
  quietHoursTo: "07:00",
  schemaVersion: SETTINGS_SCHEMA_VERSION,
};

/** Spec defaults (§4). A fresh object each access so a caller's mutation can't poison the baseline. */
export const SETTINGS_DEFAULTS: SettingsRecord = {
  ...SETTINGS_DEFAULTS_BASE,
  createdAt: 0,
  updatedAt: 0,
};

const APP_LOCK_TIMEOUTS: readonly AppLockTimeout[] = ["never", "1m", "5m", "15m", "1h"];
const APP_LOCK_TIMEOUT_MS: Record<Exclude<AppLockTimeout, "never">, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

/** Inactivity window in ms; "never" -> null (no timeout-driven lock). Wired into identity auto-lock. */
export function appLockTimeoutMs(timeout: AppLockTimeout): number | null {
  if (timeout === "never") return null;
  return APP_LOCK_TIMEOUT_MS[timeout];
}

/** True only for whole seconds within the supported clipboard-clear range [10,90]. */
export function isValidClipboardSeconds(seconds: unknown): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isInteger(seconds) &&
    seconds >= CLIPBOARD_CLEAR_MIN_SECONDS &&
    seconds <= CLIPBOARD_CLEAR_MAX_SECONDS
  );
}

function isAppLockTimeout(v: unknown): v is AppLockTimeout {
  return typeof v === "string" && (APP_LOCK_TIMEOUTS as readonly string[]).includes(v);
}

// "HH:MM" 24h validation for the quiet-hours window (display-only this slice, but still validated so
// a corrupt time can't render garbage).
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
function isHhMm(v: unknown): v is string {
  return typeof v === "string" && HH_MM.test(v);
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Coerce arbitrary parsed JSON into a complete, well-typed SettingsRecord. Every field is checked
 * independently and falls back to its default if missing or wrong-typed — a single corrupt field
 * NEVER discards the rest. createdAt/updatedAt are preserved when finite, else 0.
 */
export function validateSettings(input: unknown): SettingsRecord {
  if (input === null || typeof input !== "object") {
    return { ...SETTINGS_DEFAULTS };
  }
  const r = input as Record<string, unknown>;
  const createdAt = typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : 0;
  const updatedAt = typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : 0;
  return {
    biometric: bool(r.biometric, SETTINGS_DEFAULTS.biometric),
    requireUnlock: bool(r.requireUnlock, SETTINGS_DEFAULTS.requireUnlock),
    blurPreview: bool(r.blurPreview, SETTINGS_DEFAULTS.blurPreview),
    blockScreens: bool(r.blockScreens, SETTINGS_DEFAULTS.blockScreens),
    autoWipe: bool(r.autoWipe, SETTINGS_DEFAULTS.autoWipe),
    clipboardClearSeconds: isValidClipboardSeconds(r.clipboardClearSeconds)
      ? r.clipboardClearSeconds
      : SETTINGS_DEFAULTS.clipboardClearSeconds,
    appLockTimeout: isAppLockTimeout(r.appLockTimeout)
      ? r.appLockTimeout
      : SETTINGS_DEFAULTS.appLockTimeout,
    analytics: bool(r.analytics, SETTINGS_DEFAULTS.analytics),
    quietHoursEnabled: bool(r.quietHoursEnabled, SETTINGS_DEFAULTS.quietHoursEnabled),
    quietHoursFrom: isHhMm(r.quietHoursFrom) ? r.quietHoursFrom : SETTINGS_DEFAULTS.quietHoursFrom,
    quietHoursTo: isHhMm(r.quietHoursTo) ? r.quietHoursTo : SETTINGS_DEFAULTS.quietHoursTo,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    createdAt,
    updatedAt,
  };
}

/**
 * Bring any stored record up to the current schema. Only schemaVersion 1 exists today, so migration
 * is "normalise via validateSettings": recognised fields survive, unknown fields are dropped, and the
 * version is stamped to the build's version. Future versions add explicit step-ups above this call.
 */
export function migrateSettings(input: unknown): SettingsRecord {
  return validateSettings(input);
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test settings-record`
Expected: PASS. Also run the existing pure test to confirm no regression: `pnpm --filter @aesmsg/mobile test settings-format`.

- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/settings/settings-format.ts apps/mobile/tests/settings-record.test.ts && git commit -m "feat(mobile): settings model + validate/migrate/appLockTimeoutMs/isValidClipboardSeconds"
```

---

### Task 4.2: Encrypted settings store (`settings-store.ts`)

Persistence over Phase 1's `getEncryptedStore()` under the `"settings"` blob key. Load failure (missing OR `DecryptionError` OR any throw) falls back to `SETTINGS_DEFAULTS` and logs — a corrupt byte must not brick startup (spec §4 + Corruption policy). TDD: the test mocks `@/src/storage` with an in-memory record, exactly mirroring the `secure-store.test.ts` `vi.hoisted` + `vi.mock` style.

**Files:**
- Create: `apps/mobile/src/settings/settings-store.ts`
- Test: `apps/mobile/tests/settings-store.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// apps/mobile/tests/settings-store.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_DEFAULTS, type SettingsRecord } from "@/src/settings/settings-format";
import {
  deleteSettings,
  hasSavedSettings,
  loadSettings,
  saveSettings,
  SETTINGS_BLOB_KEY,
} from "@/src/settings/settings-store";

// The settings store layers persistence over the single EncryptedStore (Phase 1). It cannot load
// expo-file-system / expo-secure-store under Node, so we mock @/src/storage with a fake EncryptedStore
// backed by an in-memory map — same vi.hoisted pattern as secure-store.test.ts. The store under test
// only ever touches getJson/setJson/remove for the "settings" key, plus the DecryptionError type.

class FakeDecryptionError extends Error {
  constructor(message = "decrypt failed") {
    super(message);
    this.name = "DecryptionError";
  }
}

const { blob } = vi.hoisted(() => ({
  // value held under the "settings" key. `undefined` => never written; a thrown sentinel => corrupt.
  blob: { current: undefined as unknown },
}));

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
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test settings-store`
Expected: FAIL — `@/src/settings/settings-store` does not exist; import resolution error / `loadSettings is not a function`.

- [ ] **Step 3: Write the implementation**
```ts
// apps/mobile/src/settings/settings-store.ts
import { DecryptionError, getEncryptedStore } from "@/src/storage";
import {
  migrateSettings,
  SETTINGS_DEFAULTS,
  type SettingsRecord,
} from "@/src/settings/settings-format";

// Persistence for the on-device preferences blob, layered over the single shared EncryptedStore
// (Phase 1). Domains are separated by key only — settings live under "settings". Every read is
// fail-soft: a missing OR undecryptable blob resolves to SETTINGS_DEFAULTS (never throws, never
// silently wipes), so a single corrupt byte cannot brick app startup (spec §4 + Corruption policy).

/** The canonical blob key for the settings domain inside the shared EncryptedStore. */
export const SETTINGS_BLOB_KEY = "settings" as const;

/**
 * Load the persisted settings, normalised to the current schema. Returns SETTINGS_DEFAULTS when
 * nothing is stored, the blob is undecryptable (GCM auth failure / malformed framing -> a logged,
 * non-fatal fallback), or any unexpected error occurs. Never throws.
 */
export async function loadSettings(): Promise<SettingsRecord> {
  try {
    const store = await getEncryptedStore();
    const raw = await store.getJson<unknown>(SETTINGS_BLOB_KEY);
    if (raw === null) return { ...SETTINGS_DEFAULTS };
    return migrateSettings(raw);
  } catch (err) {
    if (err instanceof DecryptionError) {
      console.warn("[settings] undecryptable settings blob; falling back to defaults");
    } else {
      console.warn("[settings] failed to load settings; falling back to defaults", err);
    }
    return { ...SETTINGS_DEFAULTS };
  }
}

/**
 * Persist a settings record. Stamps updatedAt to now and sets createdAt on first write (when 0).
 * The value is validated/migrated before write so a caller can never persist a malformed record.
 */
export async function saveSettings(next: SettingsRecord): Promise<void> {
  const now = Date.now();
  const normalised = migrateSettings(next);
  const toStore: SettingsRecord = {
    ...normalised,
    createdAt: normalised.createdAt > 0 ? normalised.createdAt : now,
    updatedAt: now,
  };
  const store = await getEncryptedStore();
  await store.setJson(SETTINGS_BLOB_KEY, toStore);
}

/** Remove the persisted settings blob (used by the wipe flow alongside the DEK + other blobs). */
export async function deleteSettings(): Promise<void> {
  const store = await getEncryptedStore();
  await store.remove(SETTINGS_BLOB_KEY);
}

/** True when a settings blob has been written (distinguishes first-run defaults from a saved record). */
export async function hasSavedSettings(): Promise<boolean> {
  try {
    const store = await getEncryptedStore();
    const raw = await store.getJson<unknown>(SETTINGS_BLOB_KEY);
    return raw !== null;
  } catch {
    // An undecryptable blob still means something was written — but it's unusable; treat as unsaved
    // so the provider seeds defaults rather than reporting a phantom saved state.
    return false;
  }
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test settings-store`
Expected: PASS (all 9 cases green).

- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/settings/settings-store.ts apps/mobile/tests/settings-store.test.ts && git commit -m "feat(mobile): encrypted settings-store over getEncryptedStore (fail-soft to defaults)"
```

---

### Task 4.3: Settings context + provider (`settings-context.tsx`)

`SettingsProvider` loads once on mount (defaults until loaded), exposes the current `SettingsRecord` + an `update(patch)` that optimistically applies and auto-persists via `saveSettings`. `useSettings()` throws outside the provider, mirroring `useIdentity`. This is React/provider wiring that can't run under node-env — exact code + an iOS-sim verify step.

**Files:**
- Create: `apps/mobile/src/settings/settings-context.tsx`

- [ ] **Step 1: Write the implementation**
```tsx
// apps/mobile/src/settings/settings-context.tsx
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SETTINGS_DEFAULTS, type SettingsRecord } from "@/src/settings/settings-format";
import { loadSettings, saveSettings } from "@/src/settings/settings-store";

// App-root provider for the persisted preferences. It loads the encrypted blob once on mount (showing
// SETTINGS_DEFAULTS until the load resolves — fail-soft, never blocks the tree), and exposes an
// `update(patch)` that optimistically applies the change to React state AND persists it via
// saveSettings. Auto-persist means screens just call update(); they never touch the store directly.
//
// PROVIDER ORDERING: this sits ABOVE IdentityProvider in App.tsx so identity-context can read
// appLockTimeout without a settings<->identity render race (spec §4 Edits + Risks).

export interface SettingsContextValue {
  settings: SettingsRecord;
  /** True until the first load resolves (defaults are shown meanwhile). */
  loading: boolean;
  /** Merge a partial change into the current settings and persist it. */
  update: (patch: Partial<SettingsRecord>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsRecord>(SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadSettings().then((loaded) => {
      if (!cancelled) {
        setSettings(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<SettingsRecord>) => {
    setSettings((prev) => {
      const next: SettingsRecord = { ...prev, ...patch };
      // Fire-and-forget persist; a write failure leaves the optimistic UI state in place (the next
      // successful write reconciles it). Errors are swallowed so a toggle never crashes the screen.
      void saveSettings(next).catch((err) => {
        console.warn("[settings] failed to persist settings update", err);
      });
      return next;
    });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loading, update }),
    [settings, loading, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}
```
- [ ] **Step 2: Typecheck (no node-env test — React/provider wiring)**
Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (note: fix the import — React exports `useCallback`, not `useCallback`; if the editor flags it, correct the named import to `useCallback`). Manual sim verification happens in Task 4.4 once the provider is wired into the tree.

- [ ] **Step 3: Commit**
```bash
git add apps/mobile/src/settings/settings-context.tsx && git commit -m "feat(mobile): SettingsProvider + useSettings (auto-persisting preferences)"
```

---

### Task 4.4: Mount `SettingsProvider` above `IdentityProvider` (`App.tsx`)

Wrap the tree so settings load before identity and are readable by `identity-context` and the reader. SHARED FILE: `App.tsx` is also edited by Phase 5 (biometric onboarding routing) — this edit only adds the provider wrapper; keep it minimal so Phase 5's `<Root>` changes don't conflict.

**Files:**
- Modify: `apps/mobile/App.tsx:22-24` (add import), `apps/mobile/App.tsx:107-116` (wrap with `SettingsProvider`)

- [ ] **Step 1: Add the import**
Edit `apps/mobile/App.tsx` — insert after the existing SettingsFlow import (line 22):
```tsx
import SettingsFlow from "@/src/settings/SettingsFlow";
import { SettingsProvider } from "@/src/settings/settings-context";
```
- [ ] **Step 2: Wrap the tree**
Replace the `App()` body provider stack (lines 107-116). Current:
```tsx
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <IdentityProvider>
        <StatusBar style="light" />
        {/* Inset every screen below the status bar / Dynamic Island and above the home indicator /
            nav bar. The kit's small design gaps (Screen STATUS_CLEARANCE, footers) sit on top. */}
        <SafeAreaView style={styles.safe}>
          <Root />
        </SafeAreaView>
      </IdentityProvider>
    </SafeAreaProvider>
```
New:
```tsx
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* SettingsProvider sits ABOVE IdentityProvider so identity auto-lock can read appLockTimeout
          without a settings<->identity render race (spec §4). */}
      <SettingsProvider>
        <IdentityProvider>
          <StatusBar style="light" />
          {/* Inset every screen below the status bar / Dynamic Island and above the home indicator /
              nav bar. The kit's small design gaps (Screen STATUS_CLEARANCE, footers) sit on top. */}
          <SafeAreaView style={styles.safe}>
            <Root />
          </SafeAreaView>
        </IdentityProvider>
      </SettingsProvider>
    </SafeAreaProvider>
```
- [ ] **Step 3: Typecheck**
Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.
- [ ] **Step 4: Verify on iOS simulator**
  - Cold-launch the app; confirm it boots to the existing splash/setup/unlock/tab shell with no crash or new flash (provider load is async + fail-soft).
  - Open Settings tab → confirm screens still render (they don't consume `useSettings` yet — wired next).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/App.tsx && git commit -m "feat(mobile): mount SettingsProvider above IdentityProvider"
```

---

### Task 4.5: Wire `SecuritySettingsScreen` to `useSettings`

Replace the screen's local `useState` toggles with `useSettings()`. Biometric toggle is reflected but honestly noted as not-a-true-off this slice; `requireUnlock` persisted; `blurPreview`/`blockScreens`/`autoWipe` persisted (their behavior is wired in 4.8–4.10); the clipboard slider becomes interactive over `clipboardClearSeconds`; the app-lock-timeout row shows the live label.

**Files:**
- Modify: `apps/mobile/src/settings/SecuritySettingsScreen.tsx:1-122`
- Modify: `apps/mobile/src/settings/SettingsFlow.tsx:56-57` (pass `onOpenTimeout` no-op stays; nothing new required — screen no longer needs mock props)

- [ ] **Step 1: Replace the screen implementation**
Replace lines 1-122 of `apps/mobile/src/settings/SecuritySettingsScreen.tsx`:
```tsx
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { useMemo, useRef } from "react";
import { AppBar, ListGroup, ListRow, Screen, SectionLabel } from "@/src/components";
import { SwitchRow } from "@/src/settings/SwitchRow";
import {
  CLIPBOARD_CLEAR_MAX_SECONDS,
  CLIPBOARD_CLEAR_MIN_SECONDS,
  clampClipboardSeconds,
  clipboardFillFraction,
  formatClipboardClear,
} from "@/src/settings/settings-format";
import { useSettings } from "@/src/settings/settings-context";
import { colors, fonts, radii } from "@/src/theme";

// 46 · Security Settings. Now reads/writes the persisted SettingsRecord via useSettings — toggles and
// the clipboard slider are real, persisted preferences (no local useState). Behaviors they name are
// wired elsewhere this slice: appLockTimeout -> identity auto-lock, blur/blockScreens -> privacy
// shield, clipboardClearSeconds + autoWipe -> reader. "Biometric unlock" is reflected but is NOT a
// true on/off this slice (the gate cannot be disabled without the deferred passphrase fallback), so
// it carries an honest sub-label.

export interface SecuritySettingsScreenProps {
  onBack?: (() => void) | undefined;
  /** Open the app-lock-timeout picker (presentational chevron row for now). */
  onOpenTimeout?: (() => void) | undefined;
}

const noop = () => {};

const APP_LOCK_LABELS: Record<string, string> = {
  never: "Never",
  "1m": "1 min",
  "5m": "5 min",
  "15m": "15 min",
  "1h": "1 hour",
};

export function SecuritySettingsScreen({ onBack, onOpenTimeout }: SecuritySettingsScreenProps) {
  const { settings, update } = useSettings();

  const clearSeconds = settings.clipboardClearSeconds;
  const fillPct: `${number}%` = `${Math.round(clipboardFillFraction(clearSeconds) * 100)}%`;
  const trackWidth = useRef(0);

  // Interactive slider: map a horizontal drag/tap x-position over the measured track width into the
  // [10,90] range and persist it. Whole-second clamp keeps it a valid clipboardClearSeconds.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => applyAtX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => applyAtX(e.nativeEvent.locationX),
      }),
    // applyAtX closes over `update`/track width via refs+closure; recreate is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function applyAtX(x: number) {
    const w = trackWidth.current;
    if (w <= 0) return;
    const frac = Math.max(0, Math.min(1, x / w));
    const span = CLIPBOARD_CLEAR_MAX_SECONDS - CLIPBOARD_CLEAR_MIN_SECONDS;
    const seconds = clampClipboardSeconds(CLIPBOARD_CLEAR_MIN_SECONDS + Math.round(frac * span));
    update({ clipboardClearSeconds: seconds });
  }

  return (
    <Screen topInset={false}>
      <AppBar title="Settings & Security" onLeading={onBack ?? noop} />

      <View style={styles.stack}>
        <View>
          <SectionLabel>Unlock</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="fingerprint"
              title="Biometric unlock"
              sub="Always on this device — disabling needs a passphrase fallback (coming soon)."
              value={settings.biometric}
              onValueChange={(v) => update({ biometric: v })}
            />
            <SwitchRow
              icon="lock"
              title="Require unlock before decrypting"
              sub="Ask for biometrics every time."
              value={settings.requireUnlock}
              onValueChange={(v) => update({ requireUnlock: v })}
            />
            <ListRow
              title="App-lock timeout"
              sub="Re-lock after inactivity"
              value={APP_LOCK_LABELS[settings.appLockTimeout] ?? settings.appLockTimeout}
              onPress={onOpenTimeout ?? noop}
            />
          </ListGroup>
        </View>

        <View>
          <SectionLabel>On-screen protection</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="blur_on"
              title="Blur app preview"
              sub="Hide contents in the app switcher."
              value={settings.blurPreview}
              onValueChange={(v) => update({ blurPreview: v })}
            />
            <SwitchRow
              icon="screenshot_monitor"
              title="Block screenshots"
              sub="On screens showing plaintext."
              value={settings.blockScreens}
              onValueChange={(v) => update({ blockScreens: v })}
            />
          </ListGroup>
        </View>

        <View>
          <SectionLabel>After decryption</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="auto_delete"
              title="Auto-wipe local plaintext"
              sub="Clear decrypted text when you leave."
              value={settings.autoWipe}
              onValueChange={(v) => update({ autoWipe: v })}
            />
            <View style={styles.sliderRow}>
              <View style={styles.sliderHead}>
                <Text style={styles.sliderTitle}>Clipboard auto-clear</Text>
                <Text style={styles.sliderValue}>{formatClipboardClear(clearSeconds)}</Text>
              </View>
              <View
                style={styles.track}
                accessibilityRole="adjustable"
                accessibilityLabel="Clipboard auto-clear delay"
                accessibilityValue={{ text: formatClipboardClear(clearSeconds) }}
                onLayout={(e) => {
                  trackWidth.current = e.nativeEvent.layout.width;
                }}
                {...pan.panHandlers}
              >
                <View style={[styles.fill, { width: fillPct }]} />
                <View style={[styles.knob, { left: fillPct }]} />
              </View>
            </View>
          </ListGroup>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  sliderRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: "relative",
  },
  sliderHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sliderTitle: { fontSize: 15, color: colors.onSurface },
  sliderValue: { fontFamily: fonts.mono, color: colors.primary, fontSize: 13 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceContainerHighest,
    justifyContent: "center",
  },
  fill: { height: "100%", borderRadius: 2, backgroundColor: colors.primary },
  knob: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    marginLeft: -8,
  },
});
```
Note: this removes the imports of `clipboardFillFraction`/`formatClipboardClear` from the old line 5 and the `APP_LOCK_TIMEOUT_LABEL`/`CLIPBOARD_CLEAR_DEFAULT_SECONDS` mock imports (lines 6-9) — they are replaced above. Leave `settings-mock.ts`'s `PROFILE_MOCK`/`ADVANCED_MOCK`/`QUIET_HOURS_MOCK` exports intact (still used by other screens); only the two now-unused security constants (`CLIPBOARD_CLEAR_DEFAULT_SECONDS`, `APP_LOCK_TIMEOUT_LABEL`) become dead — remove them from `settings-mock.ts:32-36` in this same commit.
- [ ] **Step 2: Remove dead mock constants**
Edit `apps/mobile/src/settings/settings-mock.ts` — delete lines 32-36 (the `CLIPBOARD_CLEAR_DEFAULT_SECONDS` and `APP_LOCK_TIMEOUT_LABEL` exports and their comments).
- [ ] **Step 3: Typecheck**
Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (confirm no other importer of the two removed constants: `grep -rn "CLIPBOARD_CLEAR_DEFAULT_SECONDS\|APP_LOCK_TIMEOUT_LABEL" apps/mobile/src` returns nothing).
- [ ] **Step 4: Verify on iOS simulator**
  - Settings → Security: toggle Biometric/Require-unlock/Blur/Block/Auto-wipe; drag the clipboard slider; confirm the label updates live (e.g. "30s").
  - Background+foreground the app (or pop to Settings root and back into Security): confirm every toggle + the slider value PERSISTED (proves the blob round-trips).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/settings/SecuritySettingsScreen.tsx apps/mobile/src/settings/settings-mock.ts && git commit -m "feat(mobile): Security settings screen reads/writes persisted settings (interactive clipboard slider)"
```

---

### Task 4.6: Wire `PrivacySettingsScreen` analytics toggle to `useSettings`

The analytics opt-in becomes persisted (persist-only — no SDK, nothing sent, per the honest matrix). Replace the local `useState(false)`.

**Files:**
- Modify: `apps/mobile/src/settings/PrivacySettingsScreen.tsx:1-95`

- [ ] **Step 1: Replace the local analytics state with useSettings**
Edit `apps/mobile/src/settings/PrivacySettingsScreen.tsx`. Replace the import block + the `analytics` state.
Change line 1:
```tsx
import { useState } from "react";
```
to:
```tsx
import { useState } from "react";
import { useSettings } from "@/src/settings/settings-context";
```
Change lines 31-32:
```tsx
  const [analytics, setAnalytics] = useState(false); // off by default
  const [confirming, setConfirming] = useState(false);
```
to:
```tsx
  // Analytics opt-in is PERSISTED but persist-only this slice: no analytics SDK exists, nothing is
  // ever sent (spec §4 honest matrix). The toggle reflects + stores the preference only.
  const { settings, update } = useSettings();
  const [confirming, setConfirming] = useState(false);
```
Change the SwitchRow (lines 61-67):
```tsx
            <SwitchRow
              icon="bar_chart"
              title="Share anonymous analytics"
              sub="Off by default. Never includes content."
              value={analytics}
              onValueChange={setAnalytics}
            />
```
to:
```tsx
            <SwitchRow
              icon="bar_chart"
              title="Share anonymous analytics"
              sub="Off by default. Never includes content. (Not yet active — nothing is sent.)"
              value={settings.analytics}
              onValueChange={(v) => update({ analytics: v })}
            />
```
- [ ] **Step 2: Typecheck**
Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.
- [ ] **Step 3: Verify on iOS simulator**
  - Settings → Privacy: toggle "Share anonymous analytics"; leave and re-enter; confirm the state PERSISTED.
  - Confirm the "Not yet active — nothing is sent." note renders (honest persist-only labelling).
- [ ] **Step 4: Commit**
```bash
git add apps/mobile/src/settings/PrivacySettingsScreen.tsx && git commit -m "feat(mobile): persist analytics opt-in via useSettings (persist-only, labelled not-yet-active)"
```

---

### Task 4.7: Wire `NotificationsScreen` to `useSettings` (display-only quiet hours, labelled)

Quiet-hours toggle persists; the alert toggles (Link opened / Expiring soon / Contact key changed) are NOT in `SettingsRecord` and have no delivery path this slice — keep them local but add a clear in-UI "not yet active" note. Quiet-hours From/To rows read the persisted `quietHoursFrom`/`quietHoursTo`.

**Files:**
- Modify: `apps/mobile/src/settings/NotificationsScreen.tsx:1-102`

- [ ] **Step 1: Replace the implementation**
Replace lines 1-102 of `apps/mobile/src/settings/NotificationsScreen.tsx`:
```tsx
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppBar, Icon, ListGroup, ListRow, Screen, SectionLabel } from "@/src/components";
import { SwitchRow } from "@/src/settings/SwitchRow";
import { useSettings } from "@/src/settings/settings-context";
import { colors, radii } from "@/src/theme";

// 49 · Notifications Settings. Quiet-hours ENABLED + the From/To window are persisted via useSettings,
// but quiet hours and per-event alerts are DISPLAY-ONLY this slice: there is no scheduler and no push
// transport (spec §4 honest matrix + non-goals). The info card states this honestly. The per-alert
// toggles are not part of SettingsRecord (no delivery path) so they stay local presentational state.

export interface NotificationsScreenProps {
  onBack?: (() => void) | undefined;
  /** Open the From / To time pickers (presentational rows for now). */
  onOpenQuietFrom?: (() => void) | undefined;
  onOpenQuietTo?: (() => void) | undefined;
}

const noop = () => {};

export function NotificationsScreen({
  onBack,
  onOpenQuietFrom,
  onOpenQuietTo,
}: NotificationsScreenProps) {
  const { settings, update } = useSettings();
  // Per-event alert toggles have no delivery path this slice (no push transport) — local state only.
  const [linkOpened, setLinkOpened] = useState(true);
  const [expiringSoon, setExpiringSoon] = useState(true);
  const [keyChanged, setKeyChanged] = useState(true);

  return (
    <Screen topInset={false}>
      <AppBar title="Notifications" onLeading={onBack ?? noop} />

      <View style={styles.stack}>
        <View style={styles.infoCard}>
          <Icon name="info" size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            Notifications never include message content — only that something happened. Push delivery
            and quiet-hours scheduling aren't active yet; these preferences are saved for when they are.
          </Text>
        </View>

        <View>
          <SectionLabel>Alerts</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="visibility"
              title="Link opened"
              sub="When a recipient opens one of your links."
              value={linkOpened}
              onValueChange={setLinkOpened}
            />
            <SwitchRow
              icon="schedule"
              title="Expiring soon"
              sub="An hour before a link expires."
              value={expiringSoon}
              onValueChange={setExpiringSoon}
            />
            <SwitchRow
              icon="key"
              title="Contact key changed"
              sub="When a verified contact's fingerprint changes."
              value={keyChanged}
              onValueChange={setKeyChanged}
            />
          </ListGroup>
        </View>

        <View>
          <SectionLabel>Quiet hours</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="dark_mode"
              title="Quiet hours"
              sub="Silence alerts during this window."
              value={settings.quietHoursEnabled}
              onValueChange={(v) => update({ quietHoursEnabled: v })}
            />
            <ListRow
              title="From"
              value={settings.quietHoursFrom}
              trailing={null}
              onPress={onOpenQuietFrom ?? noop}
            />
            <ListRow
              title="To"
              value={settings.quietHoursTo}
              trailing={null}
              onPress={onOpenQuietTo ?? noop}
            />
          </ListGroup>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    padding: 16,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
});
```
This drops the `QUIET_HOURS_MOCK` import (the From/To now come from settings). Remove the now-unused `QUIET_HOURS_MOCK` export from `settings-mock.ts:38-42` only if no other importer remains.
- [ ] **Step 2: Check for other QUIET_HOURS_MOCK importers, then prune if dead**
Run: `grep -rn "QUIET_HOURS_MOCK" apps/mobile/src`
If `NotificationsScreen.tsx` was the only importer, delete lines 38-42 of `settings-mock.ts`.
- [ ] **Step 3: Typecheck**
Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.
- [ ] **Step 4: Verify on iOS simulator**
  - Settings → Notifications: toggle "Quiet hours"; leave + re-enter; confirm it PERSISTED.
  - Confirm the info card states push/quiet-hours scheduling aren't active yet (honest display-only labelling).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/settings/NotificationsScreen.tsx apps/mobile/src/settings/settings-mock.ts && git commit -m "feat(mobile): persist quiet-hours toggle/window; label notifications display-only"
```

---

### Task 4.8: Parameterise the privacy shield (blurPreview + blockScreens + clipboardClearMs)

Make the shield's hardcoded behavior configurable via DI so settings can drive it: the controller takes a `blockScreens` flag (skip `preventScreenCaptureAsync` when off) and an `enabled` obscure flag (skip the cover when `blurPreview` is off); the clipboard timer takes a `clearMs` so the reader can pass the persisted seconds. Pure-logic edits get node-env tests; the hook seam is exact code + sim verify.

**Files:**
- Modify: `apps/mobile/src/shield/shield-logic.ts:32-50` (parameterise `createClipboardAutoClear` with a configurable ms)
- Modify: `apps/mobile/src/shield/privacy-shield-controller.ts:30-60` (add `blockScreens` + `obscureEnabled` deps)
- Modify: `apps/mobile/src/shield/usePrivacyShield.ts:17-48` (thread options into both)
- Test: `apps/mobile/tests/shield-config.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// apps/mobile/tests/shield-config.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClipboardAutoClear } from "@/src/shield/shield-logic";
import { createPrivacyShieldController } from "@/src/shield/privacy-shield-controller";

// The shield logic was parameterised so persisted settings can drive it:
//   - createClipboardAutoClear now takes a configurable delay (clipboardClearSeconds * 1000).
//   - createPrivacyShieldController skips screen-capture prevention when blockScreens is false, and
//     reports never-obscured when obscureEnabled (blurPreview) is false.
// All framework-agnostic, so it's unit-tested in Node (no RN renderer).

describe("createClipboardAutoClear (configurable delay)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make(clearMs: number) {
    return createClipboardAutoClear({
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h),
      clearMs,
    });
  }

  it("fires after the configured delay, not the old 60s default", async () => {
    const autoClear = make(30_000);
    const fn = vi.fn();
    autoClear.schedule(fn);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("defaults to 60_000ms when no clearMs is supplied (back-compat with the reader's old call)", async () => {
    const autoClear = createClipboardAutoClear({
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h),
    });
    const fn = vi.fn();
    autoClear.schedule(fn);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("createPrivacyShieldController (blockScreens + obscureEnabled)", () => {
  function fakeDeps(overrides: Partial<{ blockScreens: boolean; obscureEnabled: boolean }> = {}) {
    const prevent = vi.fn(async () => {});
    const allow = vi.fn(async () => {});
    let listener: ((s: string) => void) | null = null;
    const onObscuredChange = vi.fn();
    const controller = createPrivacyShieldController({
      ScreenCapture: { preventScreenCaptureAsync: prevent, allowScreenCaptureAsync: allow },
      AppState: {
        addEventListener: (_t, l) => {
          listener = l as (s: string) => void;
          return { remove: vi.fn() };
        },
      },
      onObscuredChange,
      blockScreens: overrides.blockScreens ?? true,
      obscureEnabled: overrides.obscureEnabled ?? true,
    });
    return { prevent, allow, onObscuredChange, controller, fire: (s: string) => listener?.(s) };
  }

  it("calls preventScreenCaptureAsync on start when blockScreens is true", () => {
    const { prevent, controller } = fakeDeps({ blockScreens: true });
    controller.start();
    expect(prevent).toHaveBeenCalledTimes(1);
  });

  it("does NOT call preventScreenCaptureAsync when blockScreens is false", () => {
    const { prevent, controller } = fakeDeps({ blockScreens: false });
    controller.start();
    expect(prevent).not.toHaveBeenCalled();
  });

  it("obscures on non-active states when obscureEnabled is true", () => {
    const { onObscuredChange, controller, fire } = fakeDeps({ obscureEnabled: true });
    controller.start();
    fire("background");
    expect(onObscuredChange).toHaveBeenLastCalledWith(true);
    fire("active");
    expect(onObscuredChange).toHaveBeenLastCalledWith(false);
  });

  it("never reports obscured when obscureEnabled is false (blur preview off)", () => {
    const { onObscuredChange, controller, fire } = fakeDeps({ obscureEnabled: false });
    controller.start();
    fire("background");
    expect(onObscuredChange).toHaveBeenLastCalledWith(false);
    fire("inactive");
    expect(onObscuredChange).toHaveBeenLastCalledWith(false);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test shield-config`
Expected: FAIL — `clearMs`/`blockScreens`/`obscureEnabled` are not honored: the configurable-delay case fires at 60s not 30s; `blockScreens:false` still calls prevent; `obscureEnabled:false` still reports `true`. (Also a TS error on the new `clearMs`/`blockScreens`/`obscureEnabled` deps fields.)
- [ ] **Step 3a: Parameterise the clipboard timer**
Edit `apps/mobile/src/shield/shield-logic.ts`. Replace the `TimerDeps` interface (lines 15-18) and the `createClipboardAutoClear` body (lines 32-50):
```ts
export interface TimerDeps {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  // Auto-clear delay in ms. Defaults to CLIPBOARD_CLEAR_MS (60s) when omitted, preserving the prior
  // behavior for callers that don't yet thread a persisted clipboardClearSeconds.
  clearMs?: number;
}
```
and:
```ts
// Factory for the clipboard auto-clear timer. The delay (deps.clearMs, default 60s) and the timer
// functions are injected so the React hook can pass globals + the persisted clipboardClearSeconds,
// and tests can pass fake timers + an arbitrary delay.
export function createClipboardAutoClear(deps: TimerDeps): ClipboardAutoClear {
  const delayMs = deps.clearMs ?? CLIPBOARD_CLEAR_MS;
  let handle: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (handle !== null) {
      deps.clearTimeout(handle);
      handle = null;
    }
  };
  return {
    schedule(fn: () => void) {
      cancel();
      handle = deps.setTimeout(() => {
        handle = null;
        fn();
      }, delayMs);
    },
    cancel,
  };
}
```
- [ ] **Step 3b: Add blockScreens + obscureEnabled to the controller**
Edit `apps/mobile/src/shield/privacy-shield-controller.ts`. Replace the `PrivacyShieldDeps` interface (lines 30-35) and the `createPrivacyShieldController` body (lines 42-60):
```ts
export interface PrivacyShieldDeps {
  ScreenCapture: ScreenCaptureDep;
  AppState: AppStateDep;
  // Notified with `true` whenever the app is not foregrounded, `false` when it returns to active.
  onObscuredChange: (obscured: boolean) => void;
  // When false, screen-capture prevention is skipped entirely (Block screenshots OFF). Default true.
  blockScreens?: boolean;
  // When false, the cover is never requested regardless of AppState (Blur app preview OFF). Default true.
  obscureEnabled?: boolean;
}
```
and:
```ts
export function createPrivacyShieldController(deps: PrivacyShieldDeps): PrivacyShieldController {
  let subscription: AppStateSubscription | null = null;
  const blockScreens = deps.blockScreens ?? true;
  const obscureEnabled = deps.obscureEnabled ?? true;

  return {
    start() {
      if (blockScreens) {
        deps.ScreenCapture.preventScreenCaptureAsync().catch(() => {
          // Best-effort: iOS has no hard guarantee. The caller still renders the cover.
        });
      }
      subscription = deps.AppState.addEventListener("change", (state) => {
        deps.onObscuredChange(obscureEnabled ? isObscured(state) : false);
      });
    },
    stop() {
      if (blockScreens) {
        deps.ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      }
      subscription?.remove();
      subscription = null;
    },
  };
}
```
- [ ] **Step 3c: Thread options through the hook**
Edit `apps/mobile/src/shield/usePrivacyShield.ts`. Replace lines 17-48:
```ts
export interface PrivacyShieldOptions {
  /** Blur/obscure the screen when not foregrounded (Settings → Blur app preview). Default true. */
  blurPreview?: boolean;
  /** Block screenshots / recording while mounted (Settings → Block screenshots). Default true. */
  blockScreens?: boolean;
}

export function usePrivacyShield(options: PrivacyShieldOptions = {}): { isObscured: boolean } {
  const { blurPreview = true, blockScreens = true } = options;
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const controller = createPrivacyShieldController({
      ScreenCapture,
      AppState,
      onObscuredChange: setObscured,
      blockScreens,
      obscureEnabled: blurPreview,
    });
    controller.start();
    return () => controller.stop();
  }, [blurPreview, blockScreens]);

  return { isObscured: obscured };
}

// Clipboard auto-clear matching the web DecryptedScreen, with a configurable delay (the persisted
// clipboardClearSeconds; default 60s). Returns a canceller so the caller can clear the timer on
// unmount. The timer logic itself lives in createClipboardAutoClear (tested).
export function useClipboardAutoClear(clearMs?: number) {
  const autoClear = useRef(
    createClipboardAutoClear({
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle),
      clearMs,
    }),
  );
  useEffect(() => () => autoClear.current.cancel(), []);
  return {
    scheduleClear(clearFn: () => void) {
      autoClear.current.schedule(clearFn);
    },
  };
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test shield-config`
Expected: PASS. Re-run the existing shield test to confirm no regression: `pnpm --filter @aesmsg/mobile test usePrivacyShield` (the 60s default cases still pass since `clearMs` is optional and the controller defaults to obscure-on + block-on).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/shield/shield-logic.ts apps/mobile/src/shield/privacy-shield-controller.ts apps/mobile/src/shield/usePrivacyShield.ts apps/mobile/tests/shield-config.test.ts && git commit -m "feat(mobile): parameterise privacy shield (blurPreview/blockScreens/clipboardClearMs via DI)"
```

---

### Task 4.9: Wire the reader to settings (blurPreview, blockScreens, clipboardClearSeconds, autoWipe)

`ReaderScreen` now reads `useSettings()` and feeds the shield + clipboard timer the persisted values, and honors `autoWipe` (when off, skip the clipboard auto-clear schedule on copy and skip the cache wipe on unmount — the decrypted content is the user's responsibility past that point, per CLAUDE.md). React/native wiring — exact code + sim verify (the timer/controller DI seams it relies on are already unit-tested in 4.8).

**Files:**
- Modify: `apps/mobile/src/reader/ReaderScreen.tsx:1-73`

- [ ] **Step 1: Thread settings into the reader**
Edit `apps/mobile/src/reader/ReaderScreen.tsx`.
Add the import after line 12 (`useClipboardAutoClear`/`usePrivacyShield` import):
```tsx
import { useClipboardAutoClear, usePrivacyShield } from "@/src/shield/usePrivacyShield";
import { useSettings } from "@/src/settings/settings-context";
```
Replace the top of the component body (lines 32-54), from `export function ReaderScreen(...)` through the `tempFiles` effect, with:
```tsx
export function ReaderScreen({ text, attachments, onDone }: ReaderScreenProps) {
  const { settings } = useSettings();
  const { isObscured } = usePrivacyShield({
    blurPreview: settings.blurPreview,
    blockScreens: settings.blockScreens,
  });
  // Clipboard auto-clear honors the persisted delay (clipboardClearSeconds). When auto-wipe is off
  // the schedule is simply never armed (see onCopy) — the copy persists until the OS/user clears it.
  const { scheduleClear } = useClipboardAutoClear(settings.clipboardClearSeconds * 1000);
  const [copied, setCopied] = useState(false);
  const hasText = text.length > 0;
  const attachmentItems = useMemo(
    () => attachments.map((attachment) => ({ id: crypto.randomUUID(), attachment })),
    [attachments],
  );

  // Track every decrypted file written to the cache dir so all of them can be wiped exactly once
  // when leaving the reader. A ref accumulator (not state) is essential: a state array re-created
  // each download would retrigger a [tempFiles] cleanup effect and PREMATURELY delete earlier
  // files that may still be in-flight to the OS share sheet. Mirrors the web DecryptedScreen
  // objectUrls.current pattern. The single empty-dep effect runs cleanup only on unmount.
  //
  // AUTO-WIPE: when settings.autoWipe is on (default), unmount wipes the cached decrypted files. When
  // a user explicitly turns it off, the files are intentionally left in the app's cache (their
  // responsibility past decryption, per the security model). We read the flag through a ref so the
  // empty-dep unmount effect sees the latest value without re-running.
  const autoWipeRef = useRef(settings.autoWipe);
  autoWipeRef.current = settings.autoWipe;
  const tempFiles = useRef<string[]>([]);
  useEffect(
    () => () => {
      if (autoWipeRef.current) {
        void clearCachedFiles({ FileSystem }, tempFiles.current);
      }
      tempFiles.current = [];
    },
    [],
  );
```
Replace `onCopy` (lines 56-64):
```tsx
  const onCopy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    // Only auto-clear when auto-wipe is enabled; otherwise the copied text persists (user's choice).
    if (settings.autoWipe) {
      scheduleClear(async () => {
        const current = await Clipboard.getStringAsync().catch(() => "");
        if (current === text) await Clipboard.setStringAsync("");
        setCopied(false);
      });
    }
  };
```
Update the copy-button label to reflect the live delay. Replace the copy button (currently lines 146-150):
```tsx
        {hasText && (
          <Button kind="outline" icon="content_copy" onPress={onCopy} style={styles.copyBtn}>
            {copied
              ? settings.autoWipe
                ? `Copied — clears in ${settings.clipboardClearSeconds}s`
                : "Copied"
              : "Copy"}
          </Button>
        )}
```
- [ ] **Step 2: Typecheck**
Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.
- [ ] **Step 3: Verify on iOS simulator** (the reader is reachable via a deep link / the Reader flow; use a self-sent test link)
  - Settings → Security: set clipboard auto-clear to e.g. 15s. Open a decrypted message, tap Copy → label reads "Copied — clears in 15s"; paste before 15s shows the text; after ~15s the clipboard is empty.
  - Turn "Block screenshots" OFF → screenshots on the reader succeed; turn ON → blocked (Android hard, iOS best-effort).
  - Turn "Blur app preview" OFF → backgrounding the reader (app switcher) shows content; ON → shows the opaque cover.
  - Turn "Auto-wipe local plaintext" OFF → Copy does NOT clear after the delay, and leaving the reader leaves a downloaded attachment in cache; ON → both wipe.
- [ ] **Step 4: Commit**
```bash
git add apps/mobile/src/reader/ReaderScreen.tsx && git commit -m "feat(mobile): reader honors persisted blur/blockScreens/clipboard-clear/auto-wipe settings"
```

---

### Task 4.10: Wire `appLockTimeout` into identity auto-lock

Add a pure timeout-lock decision to `auto-lock.ts` (testable) and consume it in `identity-context.tsx` via `useSettings()`: an inactivity timer that locks the machine after `appLockTimeoutMs(appLockTimeout)`, restarted on foreground/activity, disabled when `"never"`. The existing background-lock (`shouldLockOnAppState`) is unchanged. Pure decision gets a node-env test; the React timer wiring is exact code + sim verify.

**Files:**
- Modify: `apps/mobile/src/identity/auto-lock.ts:1-13` (add the pure timeout helper)
- Modify: `apps/mobile/src/identity/identity-context.tsx:16-17,87-93` (read settings; add the inactivity timer effect)
- Test: `apps/mobile/tests/auto-lock-timeout.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// apps/mobile/tests/auto-lock-timeout.test.ts
import { describe, expect, it } from "vitest";
import { resolveAutoLockMs } from "@/src/identity/auto-lock";

// The inactivity auto-lock timer reads its duration from the persisted appLockTimeout. resolveAutoLockMs
// is the pure mapping the identity provider uses to decide whether (and after how long) to arm the
// timer. "never" => null (no timer). This is separate from shouldLockOnAppState (background lock).

describe("resolveAutoLockMs", () => {
  it("returns null for 'never' (no inactivity timer)", () => {
    expect(resolveAutoLockMs("never")).toBeNull();
  });

  it("maps labelled windows to milliseconds", () => {
    expect(resolveAutoLockMs("1m")).toBe(60_000);
    expect(resolveAutoLockMs("5m")).toBe(5 * 60_000);
    expect(resolveAutoLockMs("15m")).toBe(15 * 60_000);
    expect(resolveAutoLockMs("1h")).toBe(60 * 60_000);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test auto-lock-timeout`
Expected: FAIL — `resolveAutoLockMs` is not exported from `@/src/identity/auto-lock`.
- [ ] **Step 3a: Add the pure helper**
Append to `apps/mobile/src/identity/auto-lock.ts` (after the existing `shouldLockOnAppState`):
```ts
import type { AppLockTimeout } from "@/src/settings/settings-format";
import { appLockTimeoutMs } from "@/src/settings/settings-format";

// The inactivity timeout (ms) after which the app re-locks, or null to disable. Thin re-export of the
// settings mapping, kept here so identity-context imports a single auto-lock surface. "never" => null.
export function resolveAutoLockMs(timeout: AppLockTimeout): number | null {
  return appLockTimeoutMs(timeout);
}
```
(Place the two `import` lines at the TOP of the file, above the existing `import type { AppStateStatus }` line, since imports must lead the module; the function can stay at the bottom.)
- [ ] **Step 3b: Arm the inactivity timer in the provider**
Edit `apps/mobile/src/identity/identity-context.tsx`.
Add to the auto-lock import (line 17):
```tsx
import { resolveAutoLockMs, shouldLockOnAppState } from "./auto-lock";
```
Add a settings import after line 31 (the secure-store import block):
```tsx
import { useSettings } from "@/src/settings/settings-context";
```
After the existing background-lock effect (lines 87-93), add a second effect that arms an inactivity timer driven by `appLockTimeout`. Insert immediately after that effect's closing `}, [machine]);`:
```tsx
  // Inactivity auto-lock: re-lock the machine after the persisted appLockTimeout of no foregrounding.
  // SEPARATE from the background-lock above — that drops the key the instant the app backgrounds; this
  // covers the case where the app is left foregrounded-but-idle, or returns to foreground and should
  // re-lock after the window elapses. "never" disables the timer entirely. The timer is (re)armed when
  // the app becomes active and cleared when it backgrounds (background-lock already handled that path).
  const { settings } = useSettings();
  useEffect(() => {
    const ms = resolveAutoLockMs(settings.appLockTimeout);
    if (ms === null) return; // "never" — no inactivity timer

    let handle: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (handle !== null) clearTimeout(handle);
      handle = setTimeout(() => machine.lock(), ms);
    };
    const disarm = () => {
      if (handle !== null) {
        clearTimeout(handle);
        handle = null;
      }
    };
    const onChange = (next: AppStateStatus) => {
      if (next === "active") arm();
      else disarm();
    };
    arm(); // arm on mount (app is foreground)
    const sub = AppState.addEventListener("change", onChange);
    return () => {
      disarm();
      sub.remove();
    };
  }, [machine, settings.appLockTimeout]);
```
- [ ] **Step 4: Run test + typecheck**
Run: `pnpm --filter @aesmsg/mobile test auto-lock-timeout && pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS. Re-run the existing `auto-lock` test to confirm `shouldLockOnAppState` still behaves: `pnpm --filter @aesmsg/mobile test auto-lock`.
- [ ] **Step 5: Verify on iOS simulator**
  - Settings → Security → App-lock timeout shows the live value (default "Never" — no timeout lock; the timer is disabled).
  - (When the timeout picker exists / via a temporary test default of "1m") leave the app idle in foreground past the window → confirm it returns to the Unlock screen; background+foreground still locks immediately via the existing background-lock.
- [ ] **Step 6: Commit**
```bash
git add apps/mobile/src/identity/auto-lock.ts apps/mobile/src/identity/identity-context.tsx apps/mobile/tests/auto-lock-timeout.test.ts && git commit -m "feat(mobile): inactivity auto-lock driven by persisted appLockTimeout"
```

---

### Task 4.11: Ensure `tests/setup.ts` clears the settings store between cases

The spec requires `tests/setup.ts` to clear every store between cases. Phase 1 creates this file for the storage stores; this task ADDS the settings-store reset to it (idempotent — if Phase 1 already wired a global store reset that covers settings, this is a no-op confirmation). Because the settings tests mock `@/src/storage` per-file (Task 4.2), the global reset must not assume a real store; it resets the in-memory backing the storage mock exposes. This is a SHARED FILE with Phases 1-3.

**Files:**
- Modify: `apps/mobile/tests/setup.ts` (created by Phase 1) — add a settings-blob reset if not already covered

- [ ] **Step 1: Inspect what Phase 1 wired**
Run: `cat apps/mobile/tests/setup.ts` and `grep -n "setupFiles" apps/mobile/vitest.config.ts`
If `setup.ts` already calls a global `__resetStores()` / clears the shared in-memory blob map (Phase 1's storage mock) in a `beforeEach`/`afterEach`, settings are already covered (settings live in the same EncryptedStore blob map) — STOP, no edit needed, and skip to Step 4.
- [ ] **Step 2: If a settings-specific reset is missing, add it**
Only if the settings domain needs an explicit reset beyond the shared map clear, append to `apps/mobile/tests/setup.ts`:
```ts
import { afterEach } from "vitest";
// Settings-store tests mock @/src/storage per-file with their own in-memory blob; nothing global is
// required for them. This hook is a guard for any future test that imports the REAL settings-store
// against the shared storage mock — it removes the "settings" blob so cases don't bleed state.
afterEach(async () => {
  try {
    const storage = await import("@/src/storage");
    if (typeof storage.getEncryptedStore === "function") {
      const store = await storage.getEncryptedStore();
      await store.remove("settings");
    }
  } catch {
    // No real/shared store in this run (per-file mocks own their reset) — nothing to clear.
  }
});
```
- [ ] **Step 3: Confirm `setup.ts` is registered**
Verify `apps/mobile/vitest.config.ts` has `test.setupFiles: ["tests/setup.ts"]` (Phase 1 adds this). If absent, add it under `test`:
```ts
    setupFiles: ["tests/setup.ts"],
```
- [ ] **Step 4: Run the full mobile suite**
Run: `pnpm --filter @aesmsg/mobile test`
Expected: PASS — all Phase 4 suites (`settings-record`, `settings-store`, `shield-config`, `auto-lock-timeout`) plus every pre-existing suite green; no cross-test bleed.
- [ ] **Step 5: Commit** (only if Step 2/3 made a change)
```bash
git add apps/mobile/tests/setup.ts apps/mobile/vitest.config.ts && git commit -m "test(mobile): clear settings blob between cases in tests/setup.ts"
```

---

## Phase 5: Biometric onboarding

> This phase adds the one-time, post-setup biometric education + confirmation step described in spec §5. It ships a pure, node-testable `biometric-onboarding.ts` (capability detection, live confirmation, and a `biometricOnboardingSeen`-gated state selector — all TDD with a mocked `expo-local-authentication`), a thin `EnableBiometricsScreenIntegration.tsx` wrapper that wires the existing presentational `EnableBiometricsScreen` to `useSettings()`, and an `App.tsx` edit that renders the wrapper exactly once after `status === "unlocked"` while `!biometricOnboardingSeen`. It also documents the known no-biometric setup dead-end (spec §5 / §6) as a deferred-slice limitation without weakening the trust-critical secret protection class. The pure module is independently testable via Vitest; the wrapper and App wiring are verified on the iOS simulator.

### Task 5.1: Pure biometric-onboarding logic module

**Files:**
- Create: `apps/mobile/src/onboarding/biometric-onboarding.ts`
- Test: `apps/mobile/tests/biometric-onboarding.test.ts`

This is the only node-testable unit in the phase: capability detection, live confirmation, and the seen-gated onboarding-state selector. It is dependency-light — `checkBiometricCapability` and `performBiometricConfirmation` call `expo-local-authentication` directly (mocked in tests, exactly like `tests/device-secret.test.ts`), and `getBiometricOnboardingState` is a pure function over a Phase-4 `SettingsRecord` (only the `biometricOnboardingSeen` field is read, so no Phase-4 import is required — the parameter is typed structurally).

Key behavior, faithful to spec §5:
- `checkBiometricCapability()` calls `hasHardwareAsync()` + `isEnrolledAsync()` and returns a `{ hasHardware, isEnrolled, capable }` record. It NEVER throws on a missing/unenrolled device — capability is data the wrapper branches on for honest messaging.
- `performBiometricConfirmation(prompt)` calls `authenticateAsync({ promptMessage: prompt })` and **throws `BiometricConfirmationRejectedError` when `result.success === false`** (mirrors `device-secret.ts`'s `if (!result.success) throw`). It does NOT re-run the capability gate — the wrapper only calls it when capability is already known good, and it must surface a cancel/fail distinctly from "no hardware".
- `getBiometricOnboardingState(settings)` returns `"show"` when `!settings.biometricOnboardingSeen`, else `"skip"`. The whole one-time gate hinges on this single persisted flag from Phase 4's `SettingsRecord`.

- [ ] **Step 1: Write the failing test**
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BiometricConfirmationRejectedError,
  checkBiometricCapability,
  getBiometricOnboardingState,
  performBiometricConfirmation,
} from "@/src/onboarding/biometric-onboarding";

// expo-local-authentication cannot load under Node vitest — mock the three surfaces this module
// touches, exactly as tests/device-secret.test.ts does. No expo-secure-store here: this module
// never reads the keychain (it persists via useSettings in the wrapper, not from this pure logic).
vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: vi.fn(),
  isEnrolledAsync: vi.fn(),
  authenticateAsync: vi.fn(),
}));

const LocalAuthentication = await import("expo-local-authentication");
const hasHardwareAsync = vi.mocked(LocalAuthentication.hasHardwareAsync);
const isEnrolledAsync = vi.mocked(LocalAuthentication.isEnrolledAsync);
const authenticateAsync = vi.mocked(LocalAuthentication.authenticateAsync);

// Minimal structural settings shapes — only `biometricOnboardingSeen` is read by the selector.
const SEEN = { biometricOnboardingSeen: true } as const;
const UNSEEN = { biometricOnboardingSeen: false } as const;

describe("biometric-onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasHardwareAsync.mockResolvedValue(true);
    isEnrolledAsync.mockResolvedValue(true);
    authenticateAsync.mockResolvedValue({ success: true } as Awaited<
      ReturnType<typeof LocalAuthentication.authenticateAsync>
    >);
  });

  describe("checkBiometricCapability", () => {
    it("reports capable when hardware is present and a biometric is enrolled", async () => {
      const cap = await checkBiometricCapability();
      expect(cap).toEqual({ hasHardware: true, isEnrolled: true, capable: true });
    });

    it("reports not-capable (and does NOT throw) when there is no hardware", async () => {
      hasHardwareAsync.mockResolvedValue(false);
      const cap = await checkBiometricCapability();
      expect(cap).toEqual({ hasHardware: false, isEnrolled: true, capable: false });
    });

    it("reports not-capable (and does NOT throw) when no biometric is enrolled", async () => {
      isEnrolledAsync.mockResolvedValue(false);
      const cap = await checkBiometricCapability();
      expect(cap).toEqual({ hasHardware: true, isEnrolled: false, capable: false });
    });

    it("reports not-capable when neither hardware nor enrollment is present", async () => {
      hasHardwareAsync.mockResolvedValue(false);
      isEnrolledAsync.mockResolvedValue(false);
      const cap = await checkBiometricCapability();
      expect(cap.capable).toBe(false);
    });
  });

  describe("performBiometricConfirmation", () => {
    it("authenticates with the supplied prompt and resolves when the user confirms", async () => {
      await expect(performBiometricConfirmation("Confirm Face ID")).resolves.toBeUndefined();
      expect(authenticateAsync).toHaveBeenCalledTimes(1);
      const [opts] = authenticateAsync.mock.calls[0] ?? [];
      expect(opts?.promptMessage).toBe("Confirm Face ID");
    });

    it("throws BiometricConfirmationRejectedError when the user cancels or fails", async () => {
      authenticateAsync.mockResolvedValue({ success: false } as Awaited<
        ReturnType<typeof LocalAuthentication.authenticateAsync>
      >);
      await expect(performBiometricConfirmation("Confirm Face ID")).rejects.toBeInstanceOf(
        BiometricConfirmationRejectedError,
      );
    });

    it("does not run a capability gate before prompting (single authenticate call only)", async () => {
      await performBiometricConfirmation("Confirm Face ID");
      expect(hasHardwareAsync).not.toHaveBeenCalled();
      expect(isEnrolledAsync).not.toHaveBeenCalled();
    });
  });

  describe("getBiometricOnboardingState", () => {
    it("returns 'show' on first run (biometricOnboardingSeen === false)", () => {
      expect(getBiometricOnboardingState(UNSEEN)).toBe("show");
    });

    it("returns 'skip' once the screen has been seen", () => {
      expect(getBiometricOnboardingState(SEEN)).toBe("skip");
    });
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @aesmsg/mobile test biometric-onboarding`
Expected: FAIL — `Failed to resolve import "@/src/onboarding/biometric-onboarding"` (module does not exist yet).
- [ ] **Step 3: Write the implementation**
```ts
import * as LocalAuthentication from "expo-local-authentication";

// Pure / DI-friendly biometric-onboarding logic for the one-time, post-setup education + confirmation
// step (spec §5). It is deliberately node-testable: expo-local-authentication is the only native
// surface, mocked in tests exactly like device-secret. NO React, NO keychain, NO persistence here —
// the wrapper (EnableBiometricsScreenIntegration) owns persistence via useSettings.
//
// Scope note (spec §5 / §6): this slice's biometric work is education + a persisted preference. It
// must NOT touch the trust-critical secret-wrapping crypto in device-secret.ts. In particular the
// device secret stays `requireAuthentication: true`; nothing here weakens that protection class.

/** Result of probing whether this device can use biometrics. Never thrown — it is a branch input. */
export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  /** true only when hardware is present AND a biometric is enrolled. */
  capable: boolean;
}

/** Thrown when the user cancels or fails the confirmation prompt (mirrors device-secret's reject). */
export class BiometricConfirmationRejectedError extends Error {
  constructor() {
    super("Biometric confirmation was cancelled or failed");
    this.name = "BiometricConfirmationRejectedError";
  }
}

/**
 * Probe device biometric capability via hasHardwareAsync + isEnrolledAsync. Returns the raw flags
 * plus a derived `capable`. NEVER throws on a missing/unenrolled device — the onboarding wrapper
 * uses this to choose between the "Enable Face ID" affordance and the honest no-biometric message.
 */
export async function checkBiometricCapability(): Promise<BiometricCapability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return { hasHardware, isEnrolled, capable: hasHardware && isEnrolled };
}

/**
 * Run a live biometric prompt as the onboarding confirmation. Resolves on success; throws
 * BiometricConfirmationRejectedError on cancel/fail. The caller (wrapper) only invokes this when
 * capability is already known good, so no capability gate is re-run here.
 */
export async function performBiometricConfirmation(promptMessage: string): Promise<void> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage });
  if (!result.success) throw new BiometricConfirmationRejectedError();
}

/** The single persisted flag from Phase 4's SettingsRecord that gates the one-time screen. */
type OnboardingGate = Pick<{ biometricOnboardingSeen: boolean }, "biometricOnboardingSeen">;

export type BiometricOnboardingState = "show" | "skip";

/**
 * Decide whether the one-time biometric onboarding screen should render. "show" on first run,
 * "skip" once `biometricOnboardingSeen` has been persisted true (either path: Enable or Not now).
 */
export function getBiometricOnboardingState(settings: OnboardingGate): BiometricOnboardingState {
  return settings.biometricOnboardingSeen ? "skip" : "show";
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @aesmsg/mobile test biometric-onboarding`
Expected: PASS (all 10 cases green).
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/onboarding/biometric-onboarding.ts apps/mobile/tests/biometric-onboarding.test.ts && git commit -m "feat(mobile): pure biometric-onboarding logic (capability, confirm, seen-gate)"
```

---

### Task 5.2: EnableBiometricsScreenIntegration wrapper (capability detection + persist via useSettings)

**Files:**
- Create: `apps/mobile/src/onboarding/EnableBiometricsScreenIntegration.tsx`
- Modify: `apps/mobile/src/onboarding/index.ts:17-20` (barrel: add the new pure module + the wrapper exports)

The presentational `EnableBiometricsScreen` (lines 15-71, props `onEnable` / `onSkip`) is untouched, per spec §5. This wrapper supplies those callbacks and adds the capability-aware honest-messaging variant.

Behavior, faithful to spec §5:
- On mount, call `checkBiometricCapability()`. While probing, render `null` (the screen is post-`unlocked`, so the splash is gone; a brief null frame matches the calm flow — no spinner per the design ethos).
- **Capable device** → render the unchanged `EnableBiometricsScreen`. `onEnable` runs `performBiometricConfirmation("Confirm Face ID to enable")`; on success it persists `{ biometric: true, biometricOnboardingSeen: true }` via `useSettings().update(...)` and calls `onDone()`. On `BiometricConfirmationRejectedError` (or any throw) it does NOT persist `biometric:true` and does NOT advance — the user stays on the screen to retry or pick "Not now" (honest: a cancelled prompt must not silently flip the preference). `onSkip` persists `{ biometricOnboardingSeen: true }` and calls `onDone()`.
- **No-biometric device** → render the honest no-biometric variant (own presentational markup, reusing the kit `Screen`/`Medallion`/`Icon`/`Button` like the real screen) explaining biometrics aren't available on this device, with a single "Continue" that persists `{ biometricOnboardingSeen: true }` and calls `onDone()`. This is the visible half of the documented dead-end (the other half — setup itself failing on such devices — is Task 5.4).

This wrapper is React + native-backed (`useSettings`, live `authenticateAsync`), so it has no node-env automated test (convention); Task 5.5 covers it with an iOS-sim checklist. The pure decision logic it calls is already tested in Task 5.1.

`useSettings` / `SettingsProvider` and the `SettingsRecord` fields `biometric` + `biometricOnboardingSeen` come from Phase 4. The wrapper assumes `useSettings()` returns `{ settings: SettingsRecord; update(patch: Partial<SettingsRecord>): void }` (Phase 4's auto-persisting hook). If Phase 4's method name differs, this is the single call site to adjust.

- [ ] **Step 1: Write the wrapper implementation**
```tsx
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Icon, Medallion, Screen } from "@/src/components";
import { useSettings } from "@/src/settings/settings-context";
import { colors, type as typo } from "@/src/theme";
import {
  type BiometricCapability,
  checkBiometricCapability,
  performBiometricConfirmation,
} from "./biometric-onboarding";
import { EnableBiometricsScreen } from "./EnableBiometricsScreen";

// EnableBiometricsScreenIntegration — the wired half of the one-time, post-setup biometric
// onboarding step (spec §5). The presentational EnableBiometricsScreen stays untouched; this wrapper
// owns capability detection + persistence via useSettings.
//
// HONEST SCOPE (spec §5/§6): "Enable" persists `biometric:true` after a live confirmation; "Not now"
// only dismisses the educational screen — it does NOT disable the intrinsic biometric gate (the
// device secret stays requireAuthentication: true; weakening it is the deferred passphrase slice).
// On a device with no enrolled biometrics we show an honest "not available" variant instead of the
// Enable affordance. NOTE: such devices in practice never reach this screen, because
// device-secret.ts's createDeviceSecret() throws BiometricUnavailableError at identity-setup time
// (see the known-limitation doc, Task 5.4). The variant exists for completeness + future-proofing.

export interface EnableBiometricsScreenIntegrationProps {
  /** Called once the one-time screen has been resolved (Enable confirmed, skipped, or continued). */
  onDone: () => void;
}

export function EnableBiometricsScreenIntegration({
  onDone,
}: EnableBiometricsScreenIntegrationProps) {
  const { update } = useSettings();
  const [capability, setCapability] = useState<BiometricCapability | null>(null);

  // Probe capability once on mount. checkBiometricCapability never throws, so no try/catch is needed;
  // a still-null capability simply renders nothing until the (fast) probe resolves.
  useEffect(() => {
    let alive = true;
    void checkBiometricCapability().then((cap) => {
      if (alive) setCapability(cap);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (capability === null) {
    // Brief probe frame — post-unlock, so no splash; calm null is acceptable per the design ethos.
    return null;
  }

  // "Not now" / "Continue": persist only that the screen was seen. Honest — the biometric gate is
  // unchanged; this just stops the one-time screen from reappearing.
  function markSeenAndContinue() {
    update({ biometricOnboardingSeen: true });
    onDone();
  }

  if (!capability.capable) {
    // Honest no-biometric variant: no Enable affordance, just an explanation + Continue.
    return (
      <Screen contentStyle={styles.content}>
        <View style={styles.hero}>
          <Medallion>
            <Icon name="info" size={42} color={colors.onSurfaceVariant} />
          </Medallion>
          <Text style={styles.title} accessibilityRole="header">
            Biometrics aren’t available
          </Text>
          <Text style={styles.body}>
            This device has no Face ID or fingerprint set up, so biometric unlock can’t be enabled
            here. Your private key still stays on this device.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button onPress={markSeenAndContinue}>Continue</Button>
        </View>
      </Screen>
    );
  }

  // Capable device: the unchanged presentational screen, wired to live confirmation + persistence.
  return (
    <EnableBiometricsScreen
      onEnable={() => {
        // Live confirmation. On success persist the preference + seen flag and advance. On a
        // cancelled/failed prompt do NOT flip `biometric` and do NOT advance — the user can retry
        // or choose "Not now". Any throw is swallowed to the same "stay on screen" outcome.
        void performBiometricConfirmation("Confirm Face ID to enable")
          .then(() => {
            update({ biometric: true, biometricOnboardingSeen: true });
            onDone();
          })
          .catch(() => {
            // Rejected/failed: leave the screen up; no preference change.
          });
      }}
      onSkip={markSeenAndContinue}
    />
  );
}

export default EnableBiometricsScreenIntegration;

const styles = StyleSheet.create({
  content: { gap: 18 },
  hero: { alignItems: "center", gap: 16, paddingTop: 12 },
  title: { ...typo.h1, color: colors.onSurface, textAlign: "center" },
  body: { ...typo.body, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 290 },
  footer: { paddingTop: 8, gap: 12 },
});
```
- [ ] **Step 2: Extend the onboarding barrel**
In `apps/mobile/src/onboarding/index.ts`, replace the existing `EnableBiometricsScreen` export block (lines 17-20):
```ts
export {
  EnableBiometricsScreen,
  type EnableBiometricsScreenProps,
} from "./EnableBiometricsScreen";
```
with (adds the pure module's value/type re-exports above it and the new wrapper below it):
```ts
export {
  type BiometricCapability,
  type BiometricOnboardingState,
  BiometricConfirmationRejectedError,
  checkBiometricCapability,
  getBiometricOnboardingState,
  performBiometricConfirmation,
} from "./biometric-onboarding";
export {
  EnableBiometricsScreen,
  type EnableBiometricsScreenProps,
} from "./EnableBiometricsScreen";
export {
  EnableBiometricsScreenIntegration,
  type EnableBiometricsScreenIntegrationProps,
} from "./EnableBiometricsScreenIntegration";
```
- [ ] **Step 3: Verify it typechecks**
Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS. (If it fails on `useSettings`/`update` not existing, Phase 4 has not landed yet — this wrapper depends on Phase 4's `settings-context`; sequence after Phase 4. If `Icon` rejects the `name="info"` glyph, swap to an existing `DesignIconName` from `src/components/icon-map.ts` — the wrapper does not depend on the specific glyph.)
- [ ] **Step 4: Commit**
```bash
git add apps/mobile/src/onboarding/EnableBiometricsScreenIntegration.tsx apps/mobile/src/onboarding/index.ts && git commit -m "feat(mobile): biometric onboarding wrapper (capability-aware, persists via useSettings)"
```

---

### Task 5.3: Render the onboarding wrapper once post-setup in App.tsx

**Files:**
- Modify: `apps/mobile/App.tsx:21` (import), `apps/mobile/App.tsx:27` (read settings), `apps/mobile/App.tsx:72-74` (insert unlocked gate)

After identity reaches `status === "unlocked"`, conditionally render `EnableBiometricsScreenIntegration` exactly once — gated by Phase 4's persisted `biometricOnboardingSeen` — then fall through to the existing deep-link / tab-shell logic (spec §5). The gate must sit **before** the `linkId` reader branch and the tab shell so the one-time screen is the very first thing a freshly-set-up user sees; once `onDone` persists `biometricOnboardingSeen: true`, `useSettings` re-renders `Root`, the condition flips false, and the user falls through to the shell on the same `unlocked` session. A deep link captured during this window is preserved in `linkId` state and opens immediately after.

`SettingsProvider` is wrapped **above** `IdentityProvider` by Phase 4 (spec §4 / §5), so `useSettings()` is available inside `Root` here. This task only reads `settings.biometricOnboardingSeen` (a Phase-4 `SettingsRecord` field) — it does not add the provider itself.

`App.tsx` is a shared edit point across phases (Phase 4 wraps the provider tree; this phase adds the unlocked-gate branch) — flagged in `sharedFileEdits`. This wiring is native/React-only, so it is verified on the iOS sim (Task 5.5), not by a node test.

- [ ] **Step 1: Add the wrapper + useSettings imports**
In `apps/mobile/App.tsx`, the existing onboarding import is line 21:
```tsx
import { ImportBackupScreen, OnboardingFlow } from "@/src/onboarding";
```
Replace it with:
```tsx
import {
  EnableBiometricsScreenIntegration,
  ImportBackupScreen,
  OnboardingFlow,
} from "@/src/onboarding";
import { useSettings } from "@/src/settings/settings-context";
```
- [ ] **Step 2: Read settings in Root**
The current first line of `Root()` (line 27) is:
```tsx
  const { state, actions } = useIdentity();
```
Replace it with:
```tsx
  const { state, actions } = useIdentity();
  const { settings } = useSettings();
```
- [ ] **Step 3: Insert the one-time gate inside the unlocked branch**
Insert the gate immediately after the `if (state.status === "locked")` block and before the existing `// Unlocked: open a deep-linked message` comment. The current block (lines 72-74) is:
```tsx
  // Unlocked: open a deep-linked message, or show the tabbed app shell.
  if (linkId) {
    return <ReaderFlow id={linkId} onDone={() => setLinkId(null)} />;
  }
```
Insert ABOVE it so the final ordering reads:
```tsx
  // One-time, post-setup biometric onboarding (spec §5). Shown once a fresh identity is unlocked and
  // before anything else, gated by the persisted `biometricOnboardingSeen` flag. The wrapper's
  // useSettings().update persists the flag (Enable or Not now), flipping this condition false so we
  // fall through to the shell on the same unlocked session. A deep link captured meanwhile stays in
  // `linkId` and opens right after. onDone is a no-op: the re-render is driven by the persisted flag.
  if (!settings.biometricOnboardingSeen) {
    return <EnableBiometricsScreenIntegration onDone={() => undefined} />;
  }

  // Unlocked: open a deep-linked message, or show the tabbed app shell.
  if (linkId) {
    return <ReaderFlow id={linkId} onDone={() => setLinkId(null)} />;
  }
```
Note: no extra local state in `App.tsx` is needed — `useSettings().update` inside the wrapper persists `biometricOnboardingSeen: true`, which re-renders `Root` through the SettingsProvider and falls through naturally (the persisted flag, not an in-memory `seenIntro`-style boolean, is the source of truth here).
- [ ] **Step 4: Verify it typechecks**
Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS. (Depends on Phase 4's `settings-context` `useSettings`/`SettingsProvider` and the `biometricOnboardingSeen` field; sequence after Phase 4.)
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/App.tsx && git commit -m "feat(mobile): render biometric onboarding once post-setup, then fall through to shell"
```

---

### Task 5.4: Document the no-biometric setup dead-end as a known, deferred limitation

**Files:**
- Modify: `apps/mobile/src/identity/device-secret.ts:38-39` (augment the `ensureBiometricCapable` doc comment) and `apps/mobile/src/identity/device-secret.ts:53-56` (augment the `createDeviceSecret` doc comment)

This task adds NO behavior change — it is the explicit, in-code documentation the PR must carry (spec §5 "Known limitation"). `createDeviceSecret()` calls `ensureBiometricCapable()`, which **throws `BiometricUnavailableError` on a device with no enrolled biometrics** (confirmed at `device-secret.ts:40-44`: `const hasHardware = await LocalAuthentication.hasHardwareAsync(); const enrolled = await LocalAuthentication.isEnrolledAsync(); if (!hasHardware || !enrolled) throw new BiometricUnavailableError();`). Because `setupNew()` in `identity-machine.ts:94-95` awaits `crypto.generateIdentity()` then `secret.createDeviceSecret()` before persisting anything, such a device **dead-ends during identity setup and never reaches the unlocked state**, hence never reaches the Task 5.3 onboarding gate. The only honest fix (optional-biometric + passphrase/PIN fallback) is the **deferred slice** — this phase must NOT weaken the `requireAuthentication: true` protection class to paper over it. We record that contract in the source so a future reader does not "fix" the dead-end by relaxing the gate.

This is comment-only; it is covered by the existing `tests/device-secret.test.ts` cases ("throws BiometricUnavailableError without writing storage when no biometric is enrolled", lines 92-97; and "...when no hardware is present", lines 83-90) which already pin the throw behavior we are documenting — run them to prove the documented behavior is real and unchanged.

- [ ] **Step 1: Augment the `ensureBiometricCapable` doc comment**
In `apps/mobile/src/identity/device-secret.ts`, the current comment immediately above `ensureBiometricCapable` (lines 38-39) is:
```ts
// Capability gate only — verifies the device can actually hold a biometric-protected item.
// No prompt: creating a requireAuthentication item does not authenticate (that happens on read).
```
Replace those two lines with:
```ts
// Capability gate only — verifies the device can actually hold a biometric-protected item.
// No prompt: creating a requireAuthentication item does not authenticate (that happens on read).
//
// KNOWN LIMITATION (deferred slice): this throws BiometricUnavailableError on a device with NO
// enrolled biometric. Because createDeviceSecret() pre-flights this gate, identity setup DEAD-ENDS
// on such devices BEFORE the user ever reaches the post-setup biometric onboarding screen
// (see src/onboarding/EnableBiometricsScreenIntegration.tsx + the App.tsx unlocked gate). The only
// honest fix is the optional-biometric + passphrase/PIN fallback, which is a SEPARATE deferred
// slice. Do NOT "fix" the dead-end by relaxing requireAuthentication below — that would silently
// weaken the private key's protection class. The current slice only adds honest messaging + this
// documentation.
```
- [ ] **Step 2: Augment the `createDeviceSecret` doc comment**
The current comment block inside `createDeviceSecret` (lines 53-56) is:
```ts
  // Pre-flight the gate so an unenrolled device/simulator fails with a branded, explainable
  // BiometricUnavailableError instead of SecureStore's raw native "No biometrics are currently
  // enrolled" rejection. requireAuthentication: true is non-negotiable here — the private key
  // must stay biometric-gated — so this surfaces a clear error rather than relaxing the gate.
```
Replace it with:
```ts
  // Pre-flight the gate so an unenrolled device/simulator fails with a branded, explainable
  // BiometricUnavailableError instead of SecureStore's raw native "No biometrics are currently
  // enrolled" rejection. requireAuthentication: true is non-negotiable here — the private key
  // must stay biometric-gated — so this surfaces a clear error rather than relaxing the gate.
  //
  // Consequence (deferred slice — see ensureBiometricCapable above): on a no-biometric device this
  // throw makes setupNew() fail before any identity is persisted, so such devices never reach the
  // post-setup biometric onboarding screen. That dead-end is owned by the deferred passphrase/PIN
  // fallback slice; this slice deliberately does NOT weaken the gate to work around it.
```
- [ ] **Step 3: Verify behavior unchanged**
Run: `pnpm --filter @aesmsg/mobile test device-secret`
Expected: PASS — including "throws BiometricUnavailableError without writing storage when no biometric is enrolled" and "...when no hardware is present". Comments do not change behavior; this confirms the documented throw is real.
- [ ] **Step 4: Commit**
```bash
git add apps/mobile/src/identity/device-secret.ts && git commit -m "docs(mobile): document no-biometric setup dead-end as deferred limitation (no gate change)"
```

---

### Task 5.5: Manual iOS-simulator verification of biometric onboarding

**Files:**
- None (manual verification only)

The wrapper + App wiring are native/React-backed and cannot run under node-env Vitest (convention). Verify on the iOS simulator. Use the project's build recipe (Expo SDK 56 dev build on Xcode 26.5: run `pod install` with the macOS-SDK env shim, then `xcodebuild`, then launch on sim — per the team's recorded iOS build recipe). The simulator supports enrolled Face ID via **Features → Face ID → Enrolled**, and **Features → Face ID → Matching Face / Non-matching Face** to simulate confirm vs reject.

- [ ] **Step 1: First-run, capable device — Enable path**
  1. Wipe any existing identity (Settings → wipe, or fresh sim).
  2. Enroll Face ID: simulator menu **Features → Face ID → Enrolled**.
  3. Complete onboarding intro → create a new identity (setup succeeds because biometrics are enrolled).
  4. Verify the **Enable Biometrics** screen appears immediately after unlock, before the tab shell.
  5. Tap **Enable Face ID** → trigger **Features → Face ID → Matching Face**.
  6. Expected: confirmation succeeds, the screen advances to the tab shell, and reopening Settings → Security shows the biometric row reflecting on.
- [ ] **Step 2: One-time guarantee — does not reappear**
  1. Background + foreground the app, or lock + unlock.
  2. Expected: the Enable Biometrics screen does NOT reappear (persisted `biometricOnboardingSeen: true`). The app goes straight to the shell (or the deep-linked reader if a link was pending).
- [ ] **Step 3: First-run, capable device — Not now path**
  1. Wipe + recreate identity (Face ID still enrolled).
  2. On the Enable Biometrics screen tap **Not now**.
  3. Expected: advances to the shell; the screen does not reappear on relock; the biometric preference was NOT flipped on by skipping (honest — Not now only dismisses the screen).
- [ ] **Step 4: Enable then cancel the prompt — no silent flip**
  1. Wipe + recreate identity.
  2. Tap **Enable Face ID** → trigger **Features → Face ID → Non-matching Face** (or cancel the prompt).
  3. Expected: the screen stays up (does not advance); the user can retry Enable or tap Not now. `biometric` was not flipped to true by the failed attempt.
- [ ] **Step 5: No-biometric variant (best-effort — note the dead-end)**
  1. Simulator menu **Features → Face ID → Enrolled** toggled OFF (no enrollment).
  2. Attempt to create a new identity.
  3. Expected (documents Task 5.4): identity **setup itself fails** with the branded BiometricUnavailableError before reaching onboarding — confirming the no-biometric variant is currently unreachable via the real setup path and the dead-end is a genuine, deferred limitation. The honest "Biometrics aren’t available" variant exists in code for the future fallback slice but will not render today. Record this in the PR description.
- [ ] **Step 6: Record results in the PR**
Note pass/fail for each step and re-confirm the §5 known-limitation text (no-biometric dead-end owned by the deferred passphrase/PIN slice) in the PR body.

---
