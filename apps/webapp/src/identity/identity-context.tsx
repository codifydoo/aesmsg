"use client";

import {
  BadPassphraseError,
  DEFAULT_WRAP_KDF_PARAMS,
  exportPublicKey,
  generateIdentity,
  type IdentityKeypair,
  type PublicKeyString,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteIdentity, hasIdentity, loadIdentity, saveIdentity } from "./identity-store";

/**
 * The identity state machine:
 *  - `loading`      — reading IndexedDB to learn whether a web identity exists yet.
 *  - `no_identity`  — no identity on this device; the user must create one (onboarding).
 *  - `locked`       — an identity exists, wrapped at rest; the private key is NOT in memory.
 *  - `unlocked`     — the private key has been unwrapped and lives in memory for this session.
 */
export type IdentityState = "loading" | "no_identity" | "locked" | "unlocked";

export interface IdentityContextValue {
  readonly state: IdentityState;
  /** True after the most recent unlock attempt failed on a wrong passphrase. */
  readonly wrongPassphrase: boolean;
  /**
   * The in-memory, unwrapped keypair. Non-null ONLY while `state === "unlocked"`. It lives in
   * React memory for the session and is dropped on lock/wipe — it is never persisted.
   */
  readonly identity: IdentityKeypair | null;
  /** Public key of the unlocked identity, for convenience. Null unless unlocked. */
  readonly publicKeyString: PublicKeyString | null;
  /** Generate a fresh identity, wrap it under `passphrase`, persist the envelope, unlock. */
  setupNew(passphrase: string): Promise<void>;
  /** Unlock the stored identity with `passphrase`. On a wrong passphrase, stays `locked`. */
  unlock(passphrase: string): Promise<void>;
  /** Drop the in-memory key and return to `locked`. */
  lock(): void;
  /** Irreversibly delete the identity from this device and return to `no_identity`. */
  wipe(): Promise<void>;
  /** Clear the wrong-passphrase flag (e.g. when the user edits the field). */
  clearWrongPassphrase(): void;
  /**
   * Re-prompt gate for sensitive operations (decrypt/export/rotate in later sub-projects).
   * Returns the unlocked keypair, or throws if the identity is not currently unlocked so the
   * caller can route to `/unlock`. SP1 ships no sensitive ops yet.
   */
  requireUnlocked(): IdentityKeypair;
}

export const IdentityContext = createContext<IdentityContextValue | null>(null);

const PRIMARY = "primary" as const;

async function requestPersistentStorage(): Promise<void> {
  // Best-effort mitigation against IndexedDB eviction (spec §11). Never throws, never logs.
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* unsupported or denied — the wrapped envelope simply lives in best-effort storage */
  }
}

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<IdentityState>("loading");
  const [wrongPassphrase, setWrongPassphrase] = useState(false);
  // The unwrapped keypair is held in a ref (memory only) AND mirrored to state so consumers
  // re-render when it appears/disappears. It is NEVER written to storage.
  const identityRef = useRef<IdentityKeypair | null>(null);
  const [identity, setIdentityState] = useState<IdentityKeypair | null>(null);
  const [publicKeyString, setPublicKeyString] = useState<PublicKeyString | null>(null);
  // Monotonic epoch guarding against an unlock-vs-lock/wipe race. `unlock` awaits a slow
  // Argon2id unwrap; if `lock()`/`wipe()` runs during that await, the resolved unlock must NOT
  // resurrect the (locked/wiped) key in memory. Both lock() and wipe() bump this counter; unlock
  // snapshots it before the KDF and abandons its result if the epoch moved on.
  const epochRef = useRef(0);

  const setIdentity = useCallback((id: IdentityKeypair | null) => {
    identityRef.current = id;
    setIdentityState(id);
    setPublicKeyString(id ? exportPublicKey(id) : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    hasIdentity(PRIMARY)
      .then((exists) => {
        if (!cancelled) setState(exists ? "locked" : "no_identity");
      })
      .catch(() => {
        // If IndexedDB is unreachable, treat as no identity rather than wedging on `loading`.
        if (!cancelled) setState("no_identity");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // TODO(SP2+): add a `visibilitychange`/idle auto-lock that calls lock() when the tab hides.
  // SP1's deliverable is the memory-only guarantee (key dropped on lock/wipe); auto-lock is a
  // hardening upgrade, not required here.

  const setupNew = useCallback(
    async (passphrase: string) => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, passphrase, DEFAULT_WRAP_KDF_PARAMS);
      await saveIdentity({
        id: PRIMARY,
        publicKeyString: exportPublicKey(id),
        wrapped,
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
      });
      await requestPersistentStorage();
      setWrongPassphrase(false);
      setIdentity(id);
      setState("unlocked");
    },
    [setIdentity],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      // Snapshot the epoch up front: if lock()/wipe() fires anywhere across the async work below
      // (the IndexedDB read or, critically, the slow Argon2id unwrap), the epoch advances and this
      // unlock is stale — we must drop its result rather than write a key back into memory.
      const epoch = epochRef.current;
      const record = await loadIdentity(PRIMARY);
      if (record === null) {
        // Nothing to unlock — reconcile state (unless a newer op already moved us on).
        if (epoch === epochRef.current) setState("no_identity");
        return;
      }
      try {
        const id = await unwrapPrivateKey(record.wrapped, passphrase);
        // The unwrap succeeded, but if lock()/wipe() ran during it, abandon the result so a
        // wiped/locked identity is never resurrected in memory.
        if (epoch !== epochRef.current) return;
        setWrongPassphrase(false);
        setIdentity(id);
        setState("unlocked");
      } catch (err) {
        if (epoch !== epochRef.current) return;
        if (err instanceof BadPassphraseError) {
          setWrongPassphrase(true);
          return;
        }
        throw err;
      }
    },
    [setIdentity],
  );

  const lock = useCallback(() => {
    // Invalidate any in-flight unlock before dropping the key.
    epochRef.current += 1;
    setIdentity(null);
    setWrongPassphrase(false);
    setState("locked");
  }, [setIdentity]);

  const wipe = useCallback(async () => {
    // Bump the epoch first so an unlock awaiting the KDF right now cannot resurrect the key we
    // are about to delete, even if its unwrap resolves after this returns.
    epochRef.current += 1;
    await deleteIdentity(PRIMARY);
    setIdentity(null);
    setWrongPassphrase(false);
    setState("no_identity");
  }, [setIdentity]);

  const clearWrongPassphrase = useCallback(() => setWrongPassphrase(false), []);

  const requireUnlocked = useCallback((): IdentityKeypair => {
    const id = identityRef.current;
    if (id === null) {
      throw new Error("Identity is locked — unlock before performing this action");
    }
    return id;
  }, []);

  const value = useMemo<IdentityContextValue>(
    () => ({
      state,
      wrongPassphrase,
      identity,
      publicKeyString,
      setupNew,
      unlock,
      lock,
      wipe,
      clearWrongPassphrase,
      requireUnlocked,
    }),
    [
      state,
      wrongPassphrase,
      identity,
      publicKeyString,
      setupNew,
      unlock,
      lock,
      wipe,
      clearWrongPassphrase,
      requireUnlocked,
    ],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}
