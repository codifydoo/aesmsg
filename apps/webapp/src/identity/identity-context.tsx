"use client";

import {
  BadPassphraseError,
  DEFAULT_WRAP_KDF_PARAMS,
  exportPublicKey,
  fingerprint,
  generateIdentity,
  type IdentityKeypair,
  type PublicKeyString,
  unwrapPrivateKey,
  type WrappedKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IDENTITY_STORE, RETIRED_STORE, withStores } from "./db";
import { allPrivateKeysForDecrypt } from "./decrypt-keys";
import { prependRetired, type RetiredKeyEntry, retiredExcludingActive } from "./identity-bundle";
import {
  deleteIdentity,
  hasIdentity,
  loadIdentity,
  type StoredIdentity,
  saveIdentity,
} from "./identity-store";
import { clearRetiredEntries, loadRetiredEntries } from "./retired-keys-store";

/**
 * The identity state machine:
 *  - `loading`      — reading IndexedDB to learn whether a web identity exists yet.
 *  - `no_identity`  — no identity on this device; the user must create one (onboarding).
 *  - `locked`       — an identity exists, wrapped at rest; the private key is NOT in memory.
 *  - `unlocked`     — the private key has been unwrapped and lives in memory for this session.
 *
 * MULTI-KEY IDENTITY (SP5, parity with apps/mobile identity-machine): the identity is an ACTIVE
 * keypair plus an ordered list of RETIRED keypairs. `rotate(passphrase)` generates a new active
 * keypair and retires the old one — but RETAINS the old private key (still wrapped at rest) so
 * in-flight legacy links sealed to a previous public key still open. The active key is used for all
 * new sends/receives; `getAllPrivateKeysForDecrypt()` exposes the ordered set so the reader can fall
 * back through the retired keys when decrypting.
 */
export type IdentityState = "loading" | "no_identity" | "locked" | "unlocked";

/** Thrown by `rotate`/re-auth when the re-prompted passphrase does not unlock the stored envelope. */
export class WrongPassphraseError extends Error {
  constructor() {
    super("The passphrase did not match");
    this.name = "WrongPassphraseError";
  }
}

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
  /**
   * Adopt an imported (restored-from-backup) identity as this device's active identity. Guarded to
   * `no_identity` (a restore can never silently overwrite an existing, otherwise-unrecoverable key).
   * The envelope is adopted VERBATIM — it is already `DEFAULT_WRAP_KDF_PARAMS`, so the import
   * passphrase becomes the ongoing login passphrase; no re-wrap.
   */
  importIdentity(envelope: WrappedKey, keypair: IdentityKeypair): Promise<void>;
  /** Unlock the stored identity with `passphrase`. On a wrong passphrase, stays `locked`. */
  unlock(passphrase: string): Promise<void>;
  /**
   * Rotate the active keypair: re-verify `passphrase`, retire the old key (RETAINED, wrapped), make
   * a fresh active keypair active, and return its new public key so the caller can surface the new
   * fingerprint for re-verification. `WrongPassphraseError` → identity untouched.
   */
  rotate(passphrase: string): Promise<PublicKeyString>;
  /** Drop the in-memory keys (active + retired) and return to `locked`. */
  lock(): void;
  /** Irreversibly delete the identity + retired keys from this device and return to `no_identity`. */
  wipe(): Promise<void>;
  /** Clear the wrong-passphrase flag (e.g. when the user edits the field). */
  clearWrongPassphrase(): void;
  /**
   * The ordered private-key set the reader tries for decryption: `[active, ...retired]`. Empty
   * unless unlocked. The reader re-derives each key's own AAD, so a retired key opens the exact
   * legacy link it was sealed under.
   */
  getAllPrivateKeysForDecrypt(): IdentityKeypair[];
  /**
   * Re-prompt gate for sensitive operations. Returns the unlocked keypair, or throws if the identity
   * is not currently unlocked so the caller can route to `/unlock`.
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
  // The RETAINED retired keypairs (newest→oldest), unwrapped under the same login passphrase at
  // unlock. Memory-only (like the active key), dropped on lock/wipe, never persisted unwrapped. Held
  // in a ref: the reader reads them synchronously via getAllPrivateKeysForDecrypt() and no UI needs
  // to re-render when they change (the active fingerprint drives all rotation UI).
  const retiredKeypairsRef = useRef<IdentityKeypair[]>([]);
  // A ref mirror of `state` so guards (importIdentity) read the CURRENT status without stale closures.
  const stateRef = useRef<IdentityState>("loading");
  // Monotonic epoch guarding against an unlock/rotate-vs-lock/wipe race. A slow Argon2id KDF runs
  // during unlock/rotate; if lock()/wipe() runs during that await, the resolved op must NOT resurrect
  // the (locked/wiped) key in memory. Both lock() and wipe() bump this counter; unlock/rotate
  // snapshot it before the KDF and abandon their in-memory result if the epoch moved on.
  const epochRef = useRef(0);

  const applyState = useCallback((next: IdentityState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const setIdentity = useCallback((id: IdentityKeypair | null) => {
    identityRef.current = id;
    setIdentityState(id);
    setPublicKeyString(id ? exportPublicKey(id) : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    hasIdentity(PRIMARY)
      .then((exists) => {
        if (!cancelled) applyState(exists ? "locked" : "no_identity");
      })
      .catch(() => {
        // If IndexedDB is unreachable, treat as no identity rather than wedging on `loading`.
        if (!cancelled) applyState("no_identity");
      });
    return () => {
      cancelled = true;
    };
  }, [applyState]);

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
      retiredKeypairsRef.current = [];
      setWrongPassphrase(false);
      setIdentity(id);
      applyState("unlocked");
    },
    [setIdentity, applyState],
  );

  const importIdentity = useCallback(
    async (envelope: WrappedKey, keypair: IdentityKeypair) => {
      // Guard: only valid from a clean slate, so a restore can never silently overwrite an existing
      // (and otherwise unrecoverable) identity — mirrors mobile identity-machine.importIdentity.
      if (stateRef.current !== "no_identity") {
        throw new Error(`Cannot import an identity from status: ${stateRef.current}`);
      }
      // Adopt the imported envelope VERBATIM (already DEFAULT_WRAP_KDF_PARAMS — the web's at-rest
      // params). The import passphrase becomes the ongoing login passphrase; no re-wrap.
      await saveIdentity({
        id: PRIMARY,
        publicKeyString: exportPublicKey(keypair),
        wrapped: envelope,
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
      });
      await requestPersistentStorage();
      retiredKeypairsRef.current = [];
      setWrongPassphrase(false);
      setIdentity(keypair);
      applyState("unlocked");
    },
    [setIdentity, applyState],
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
        if (epoch === epochRef.current) applyState("no_identity");
        return;
      }
      let id: IdentityKeypair;
      try {
        id = await unwrapPrivateKey(record.wrapped, passphrase);
      } catch (err) {
        if (epoch !== epochRef.current) return;
        if (err instanceof BadPassphraseError) {
          setWrongPassphrase(true);
          return;
        }
        throw err;
      }
      // The ACTIVE unwrap succeeded, but if lock()/wipe() ran during it, abandon the result so a
      // wiped/locked identity is never resurrected in memory.
      if (epoch !== epochRef.current) return;

      // Apply the unlocked state IMMEDIATELY on the active key. The RETAINED retired keys each cost a
      // heavy Argon2id unwrap, so unwrapping them here would add ~0.7s+ per past rotation to EVERY
      // unlock. Instead we go unlocked now with an empty retired set for this session, and load the
      // retired keys in the BACKGROUND (below).
      retiredKeypairsRef.current = [];
      setWrongPassphrase(false);
      setIdentity(id);
      applyState("unlocked");

      // BACKGROUND (fire-and-forget): unwrap the RETAINED retired keys under the SAME login passphrase
      // so the reader can open legacy links sealed to a pre-rotation key. Best-effort per entry (a
      // corrupt/incompatible retired entry is skipped — it never fails the unlock; the active key is
      // the priority). Any entry duplicating the active key (a crash mid-rotation) is dropped first.
      // EPOCH-GUARDED: a lock()/wipe() during this slow work advances the epoch, so we re-check
      // epochRef.current before EVERY retiredKeypairsRef write; a stale background unwrap is discarded
      // and never leaks a key into a later session.
      const activePk = exportPublicKey(id);
      void (async () => {
        try {
          const retiredEntries = retiredExcludingActive(await loadRetiredEntries(), activePk);
          for (const entry of retiredEntries) {
            if (epoch !== epochRef.current) return;
            let unwrapped: IdentityKeypair;
            try {
              unwrapped = await unwrapPrivateKey(entry.wrapped, passphrase);
            } catch {
              // Skip a retired key that can't be unwrapped; the active + other retired keys stand.
              continue;
            }
            // Re-check AFTER the await: a lock()/wipe() that landed during THIS unwrap must discard
            // the result rather than resurrect the key into a now-locked/wiped/rotated session.
            if (epoch !== epochRef.current) return;
            retiredKeypairsRef.current = [...retiredKeypairsRef.current, unwrapped];
          }
        } catch {
          // loadRetiredEntries already fails soft to []; swallow any other unexpected error so a
          // best-effort background unwrap can never surface as an unhandled promise rejection.
        }
      })();
    },
    [setIdentity, applyState],
  );

  const rotate = useCallback(
    async (passphrase: string): Promise<PublicKeyString> => {
      // Snapshot the epoch at the VERY TOP (parity with unlock): a lock()/wipe() landing during ANY
      // await below — including the initial loadIdentity read — advances the epoch, and we must abort
      // rather than write, so a wiped identity is never re-put to disk.
      const epoch = epochRef.current;
      const oldActive = identityRef.current;
      if (oldActive === null) {
        throw new Error("Cannot rotate a locked identity — unlock first");
      }
      const stored = await loadIdentity(PRIMARY);
      if (stored === null) {
        throw new Error("No stored identity to rotate");
      }
      // A lock()/wipe() during the loadIdentity read invalidates this rotation before it touches
      // keys — abort so the write below can never re-put a wiped/locked identity.
      if (epoch !== epochRef.current) {
        throw new Error("Rotation aborted: identity state changed mid-rotation");
      }

      // Re-verify the login passphrase (spec §5 explicit re-auth + it is needed to wrap the new key).
      // A wrong passphrase aborts BEFORE anything is generated or written — identity untouched.
      try {
        await unwrapPrivateKey(stored.wrapped, passphrase);
      } catch (err) {
        if (err instanceof BadPassphraseError) throw new WrongPassphraseError();
        throw err;
      }

      // The retired entry RE-USES the existing stored envelope verbatim — it is already sealed under
      // this passphrase with DEFAULT_WRAP_KDF_PARAMS (the SAME at-rest protection). No re-wrap, no
      // second Argon2id for the retired key.
      const retiredEntry: RetiredKeyEntry = {
        wrapped: stored.wrapped,
        publicKeyString: stored.publicKeyString,
        fingerprint: await fingerprint(stored.publicKeyString),
        retiredAtMs: Date.now(),
      };

      // Generate + wrap the NEW active keypair under the same passphrase.
      const newId = await generateIdentity();
      const newPk = exportPublicKey(newId);
      const newWrapped = await wrapPrivateKey(newId, passphrase, DEFAULT_WRAP_KDF_PARAMS);

      // Epoch guard (parity with unlock): if a lock()/wipe() ran during the slow KDF work above, abort
      // WITHOUT writing — never resurrect a locked/wiped identity onto disk.
      if (epoch !== epochRef.current) {
        throw new Error("Rotation aborted: identity state changed mid-rotation");
      }

      const newStored: StoredIdentity = {
        id: PRIMARY,
        publicKeyString: newPk,
        wrapped: newWrapped,
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
      };
      const retiredBlob = {
        id: PRIMARY,
        entries: prependRetired(await loadRetiredEntries(), retiredEntry),
        schemaVersion: 1,
      };

      // ONE atomic transaction over [IDENTITY_STORE, RETIRED_STORE]: `put` the new active identity AND
      // the prepended retired blob together. IndexedDB commits a multi-store transaction all-or-nothing,
      // so the rotation is "fully rotated OR unchanged, never bricked" — this transaction atomicity
      // SUBSUMES mobile's two-phase retired-first write ordering (identity-machine.rotate).
      await withStores([IDENTITY_STORE, RETIRED_STORE], "readwrite", (stores) => {
        stores[IDENTITY_STORE]?.put(newStored);
        stores[RETIRED_STORE]?.put(retiredBlob);
      });

      // If a lock/wipe landed during the (fast) write, don't resurrect keys in memory — disk is already
      // rotated, which is correct; we simply don't re-populate the unlocked state.
      if (epoch !== epochRef.current) return newPk;

      // Flip in-memory state: new active, old active prepended to the retired keypairs (both already
      // held unwrapped — no re-unwrap, no extra passphrase prompt).
      retiredKeypairsRef.current = [oldActive, ...retiredKeypairsRef.current];
      setWrongPassphrase(false);
      setIdentity(newId);
      applyState("unlocked");
      return newPk;
    },
    [setIdentity, applyState],
  );

  const lock = useCallback(() => {
    // Invalidate any in-flight unlock before dropping the keys.
    epochRef.current += 1;
    retiredKeypairsRef.current = [];
    setIdentity(null);
    setWrongPassphrase(false);
    applyState("locked");
  }, [setIdentity, applyState]);

  const wipe = useCallback(async () => {
    // Bump the epoch first so an unlock/rotate awaiting the KDF right now cannot resurrect the key we
    // are about to delete, even if its unwrap resolves after this returns.
    epochRef.current += 1;
    await deleteIdentity(PRIMARY);
    // Required for irreversibility: a surviving retired key would leave a private key recoverable.
    await clearRetiredEntries();
    retiredKeypairsRef.current = [];
    setIdentity(null);
    setWrongPassphrase(false);
    applyState("no_identity");
  }, [setIdentity, applyState]);

  const clearWrongPassphrase = useCallback(() => setWrongPassphrase(false), []);

  const getAllPrivateKeysForDecrypt = useCallback((): IdentityKeypair[] => {
    const active = identityRef.current;
    if (active === null) return [];
    return allPrivateKeysForDecrypt(active, retiredKeypairsRef.current);
  }, []);

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
      importIdentity,
      unlock,
      rotate,
      lock,
      wipe,
      clearWrongPassphrase,
      getAllPrivateKeysForDecrypt,
      requireUnlocked,
    }),
    [
      state,
      wrongPassphrase,
      identity,
      publicKeyString,
      setupNew,
      importIdentity,
      unlock,
      rotate,
      lock,
      wipe,
      clearWrongPassphrase,
      getAllPrivateKeysForDecrypt,
      requireUnlocked,
    ],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}
