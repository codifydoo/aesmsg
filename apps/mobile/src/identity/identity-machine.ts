import type { Fingerprint, IdentityKeypair, PublicKeyString, WrappedKey } from "@aesmsg/crypto";
import { prependRetired, type RetiredKeyEntry, retiredExcludingActive } from "./identity-bundle";

// Pure, dependency-injected identity state machine. Mirrors the web app's IdentityProvider
// contract (loading | no_identity | locked | unlocked + setupNew/unlock/lock/wipe) so screen
// logic ports cleanly. All side-effecting modules (crypto, biometric-gated secret store,
// wrapped-key persistence) are injected so this can be exercised in Node with real crypto and
// fake storage/secret seams.
//
// MULTI-KEY IDENTITY (roadmap 2.4 / PG-1): the identity is an ACTIVE keypair plus an ordered list of
// RETIRED keypairs. Rotation (rotate()) generates a new active keypair and retires the old one — but
// RETAINS the old private key (still device-secret-wrapped) so in-flight legacy links sealed to a
// previous public key still open. The active key is used for all new sends/receives; the unlocked
// state also exposes `retiredKeypairs` so the reader can fall back through them when decrypting.
//
// SECURITY INVARIANTS preserved here:
//  - The unwrapped IdentityKeypair(s) live in machine memory only (the `unlocked` state). Only
//    WrappedKey envelopes are ever handed to the store — never a raw keypair.
//  - Retired private keys keep the SAME at-rest protection as the active key: they are stored only
//    device-secret-wrapped, wrapped under the identical device secret via the injected wrapPrivateKey.
//  - lock() drops all keypairs (back to `locked`); the next read requires the device secret again.
//  - wipe() deletes the wrapped ACTIVE identity, the RETIRED keys, AND the device secret, so a later
//    unlock cannot recover the identity (load returns null -> no_identity).
//  - wipe() is intentionally LINKS-AGNOSTIC. It purges keys + local blobs only; it does NOT revoke
//    the user's outstanding sent links. Wiping destroys the per-link revocation tokens (BE-1 / R2),
//    so revoke-before-wipe is a caller-level concern that MUST run first — see revokeAllThenWipe in
//    settings/wipe-orchestration.ts, driven by PrivacySettingsScreen. Keeping the machine free of
//    the links/API dependency preserves its pure crypto+storage contract.
//  - setupNew refuses unless status === "no_identity", so a generate cannot silently overwrite an
//    existing (and otherwise unrecoverable) identity.
//  - rotate() refuses unless status === "unlocked" and persists CRASH-SAFELY (see rotate()).

export type IdentityState =
  | { status: "loading" }
  | { status: "no_identity" }
  | { status: "locked" }
  | {
      status: "unlocked";
      /** The ACTIVE keypair — used for all new sends/receives and shown as the identity. */
      identity: IdentityKeypair;
      publicKeyString: PublicKeyString;
      /** RETAINED retired keypairs, newest→oldest, for decrypting pre-rotation (legacy) links. */
      retiredKeypairs: IdentityKeypair[];
    };

// The action contract mirrored to React consumers (matches the web app's IdentityActions). `init`
// is intentionally NOT part of this contract — it is a lifecycle method the provider drives, not a
// user action.
export interface IdentityActions {
  setupNew(): Promise<void>;
  importIdentity(identity: IdentityKeypair): Promise<void>;
  unlock(): Promise<void>;
  lock(): void;
  wipe(): Promise<void>;
  /** Rotate the active keypair (retire the old, retain it for legacy links). Returns the new
   *  active public key so the caller can surface its fingerprint for re-verification. */
  rotate(): Promise<PublicKeyString>;
}

export interface IdentityCryptoDeps {
  generateIdentity(): Promise<IdentityKeypair>;
  wrapPrivateKey(identity: IdentityKeypair, secret: string): Promise<WrappedKey>;
  unwrapPrivateKey(wrapped: WrappedKey, secret: string): Promise<IdentityKeypair>;
  exportPublicKey(identity: IdentityKeypair): PublicKeyString;
  /** AM- fingerprint of a public key — recorded (as PUBLIC metadata) on a retired key at rotation. */
  fingerprint(publicKeyString: PublicKeyString): Promise<Fingerprint>;
  /** True when `wrapped` was produced under heavier KDF parameters than this device now uses, so
   *  it should be lazily re-wrapped after a successful unlock. */
  needsRewrap(wrapped: WrappedKey): boolean;
}

export interface IdentitySecretDeps {
  createDeviceSecret(): Promise<string>;
  unlockDeviceSecret(): Promise<string>;
  deleteDeviceSecret(): Promise<void>;
}

export interface IdentityStoreDeps {
  hasStoredIdentity(): Promise<boolean>;
  saveWrappedIdentity(wrapped: WrappedKey): Promise<void>;
  loadWrappedIdentity(): Promise<WrappedKey | null>;
  deleteWrappedIdentity(): Promise<void>;
  /** Load the retained retired keys (newest→oldest). Returns [] when none / on a corrupt blob. */
  loadRetiredKeys(): Promise<RetiredKeyEntry[]>;
  /** Persist the retired-keys list atomically (single blob). See rotate() for write ordering. */
  saveRetiredKeys(entries: RetiredKeyEntry[]): Promise<void>;
  /** Purge the retired-keys blob (part of identity wipe). */
  deleteRetiredKeys(): Promise<void>;
  /** Purge all encrypted blobs and the DEK from storage. Called as part of identity wipe so no
   *  metadata remains decryptable after the identity is deleted. Injected rather than imported so
   *  the pure machine never carries a direct expo-* dependency. */
  wipeStorage(): Promise<void>;
}

export interface IdentityMachineDeps {
  crypto: IdentityCryptoDeps;
  secret: IdentitySecretDeps;
  store: IdentityStoreDeps;
  /** Monotonic-ish wall clock for retirement timestamps. Defaults to Date.now; injected for tests. */
  now?: () => number;
}

export interface IdentityMachine {
  getState(): IdentityState;
  init(): Promise<void>;
  setupNew(): Promise<void>;
  importIdentity(identity: IdentityKeypair): Promise<void>;
  unlock(): Promise<void>;
  lock(): void;
  wipe(): Promise<void>;
  rotate(): Promise<PublicKeyString>;
  subscribe(listener: (state: IdentityState) => void): () => void;
}

export function createIdentityMachine(deps: IdentityMachineDeps): IdentityMachine {
  const { crypto, secret, store } = deps;
  const now = deps.now ?? (() => Date.now());
  let state: IdentityState = { status: "loading" };
  const listeners = new Set<(state: IdentityState) => void>();

  function setState(next: IdentityState): void {
    state = next;
    for (const listener of listeners) listener(state);
  }

  async function init(): Promise<void> {
    const exists = await store.hasStoredIdentity();
    setState({ status: exists ? "locked" : "no_identity" });
  }

  // Shared tail of setupNew/importIdentity: create the device secret, wrap the (generated or
  // imported) identity under it, persist ONLY the wrapped envelope, and transition to unlocked
  // holding the keypair in memory. Never persists the raw IdentityKeypair — only the WrappedKey.
  async function persistAndUnlock(identity: IdentityKeypair): Promise<void> {
    const deviceSecret = await secret.createDeviceSecret();
    const wrapped = await crypto.wrapPrivateKey(identity, deviceSecret);
    await store.saveWrappedIdentity(wrapped);
    setState({
      status: "unlocked",
      identity,
      publicKeyString: crypto.exportPublicKey(identity),
      // A freshly generated / imported identity has no retired keys. (setupNew/importIdentity only
      // run from `no_identity`, which follows a wipe that already purged any retired blob.)
      retiredKeypairs: [],
    });
  }

  async function setupNew(): Promise<void> {
    // Guard: never overwrite an existing identity (it would be unrecoverable). Only generate
    // from a clean slate.
    if (state.status !== "no_identity") {
      throw new Error(`Cannot setup a new identity from status: ${state.status}`);
    }
    const identity = await crypto.generateIdentity();
    await persistAndUnlock(identity);
  }

  // Adopt an externally-restored identity (decrypted from an encrypted backup file) as this
  // device's active identity. Same guard discipline as setupNew: only valid from a clean slate, so
  // a restore can never silently overwrite an existing (and otherwise unrecoverable) identity.
  async function importIdentity(identity: IdentityKeypair): Promise<void> {
    if (state.status !== "no_identity") {
      throw new Error(`Cannot import an identity from status: ${state.status}`);
    }
    await persistAndUnlock(identity);
  }

  async function unlock(): Promise<void> {
    const wrapped = await store.loadWrappedIdentity();
    if (!wrapped) {
      // No wrapped identity on disk — nothing to unlock. (e.g. after wipe.)
      setState({ status: "no_identity" });
      return;
    }
    // unlockDeviceSecret runs the biometric gate. A reject/unavailable rejection, or an
    // unwrap failure (wrong key), must leave us in `locked` with no keypair in memory.
    const deviceSecret = await secret.unlockDeviceSecret();
    const identity = await crypto.unwrapPrivateKey(wrapped, deviceSecret);
    const publicKeyString = crypto.exportPublicKey(identity);

    // Unwrap the RETAINED retired keys so the reader can open legacy links sealed to a pre-rotation
    // key. All retired keys were wrapped under the SAME device secret we just unlocked with, so no
    // extra biometric prompt is needed. Per entry this is BEST-EFFORT: a corrupt / incompatible
    // retired entry is skipped (never fails the whole unlock — the active key is the priority). Any
    // entry that duplicates the active key (a crash mid-rotation can leave the old key both active
    // and retired) is dropped first so it is never tried twice.
    const retiredEntries = retiredExcludingActive(await store.loadRetiredKeys(), publicKeyString);
    const retiredKeypairs: IdentityKeypair[] = [];
    for (const entry of retiredEntries) {
      try {
        retiredKeypairs.push(await crypto.unwrapPrivateKey(entry.wrapped, deviceSecret));
      } catch {
        // Skip a retired key that can't be unwrapped; the active key + other retired keys stand.
      }
    }

    setState({ status: "unlocked", identity, publicKeyString, retiredKeypairs });

    // Lazy KDF migration: if this envelope was wrapped under heavier KDF parameters than the device
    // now uses (a pre-fix identity, or one created by the web app under its passphrase-grade params),
    // transparently re-wrap it under the lighter mobile parameters so the NEXT unlock is fast. This
    // runs AFTER the unlock has already succeeded and is strictly best-effort: any failure here —
    // including a `needsRewrap` throw on a malformed envelope, or a re-wrap/save error — must not
    // affect the already-unlocked state, so the whole block is swallowed and simply retried on the
    // next unlock. Idempotent: a light envelope reports `needsRewrap === false`. The re-wrap reuses
    // the in-scope `deviceSecret`, so no extra biometric prompt is shown.
    try {
      if (crypto.needsRewrap(wrapped)) {
        const rewrapped = await crypto.wrapPrivateKey(identity, deviceSecret);
        // Re-check state before persisting: a lock() or wipe() may have run during the await above.
        // wipe() in particular deletes the stored envelope, and saving here would resurrect it —
        // violating the irreversibility invariant. Only persist while we are still unlocked.
        if (state.status === "unlocked") {
          await store.saveWrappedIdentity(rewrapped);
        }
      }
    } catch {
      // Migration is best-effort; the unlock already succeeded. Retry on the next unlock.
    }
  }

  function lock(): void {
    if (state.status === "unlocked") {
      // Drop the in-memory keypair.
      setState({ status: "locked" });
    }
  }

  async function wipe(): Promise<void> {
    // Purge only — the caller (revokeAllThenWipe in settings/wipe-orchestration.ts) is responsible
    // for the best-effort revoke pass that runs BEFORE this, since wipe destroys the per-link
    // revocation tokens. By the time we get here, the revoke pass has completed (and any failures
    // were explicitly acknowledged), so this step always runs to completion.
    //
    // Delete the wrapped identity, the retired keys, and the device secret first — these are the
    // keys to the kingdom. Then purge all encrypted blobs + the DEK so no metadata remains
    // decryptable after wipe. All must be attempted; errors propagate so the caller knows the wipe
    // was incomplete. Retired keys are deleted before wipeStorage so a wipeStorage failure still
    // leaves no recoverable private key behind.
    await store.deleteWrappedIdentity();
    await store.deleteRetiredKeys();
    await secret.deleteDeviceSecret();
    await store.wipeStorage();
    setState({ status: "no_identity" });
  }

  // Real key rotation (roadmap 2.4 / PG-1). Generates a NEW active keypair, retires the current one,
  // and RETAINS the old private key (device-secret-wrapped) so legacy links sealed to it still open.
  //
  // CRASH-SAFETY (must be "fully rotated OR unchanged", never bricked): the retired-keys blob — which
  // RETAINS the old private key — is persisted BEFORE the active pointer is flipped to the new key.
  //   • Crash after neither write → unchanged (still on the old active key).
  //   • Crash between the two writes → the old key is BOTH the still-active on-disk key AND present
  //     in the retired blob; nothing is lost and the identity is fully usable. On the next unlock the
  //     duplicate is deduped away (retiredExcludingActive), yielding exactly the pre-rotation state.
  //   • Crash after both writes → fully rotated.
  // The reverse order (flip active first) could drop the old private key before it was retained and
  // brick every legacy link, so it is intentionally avoided.
  async function rotate(): Promise<PublicKeyString> {
    if (state.status !== "unlocked") {
      throw new Error(`Cannot rotate identity from status: ${state.status}`);
    }
    const oldActive = state.identity;
    const oldActivePk = state.publicKeyString;
    const priorRetiredKeypairs = state.retiredKeypairs;

    // Fresh biometric gate → the EXISTING device secret. Reuses the single-prompt unlock path (no new
    // native call); a cancel/failure rejects here, leaving the identity untouched (still unlocked).
    const deviceSecret = await secret.unlockDeviceSecret();

    // Re-wrap the old active key under the device secret (light params via the injected wrapPrivateKey)
    // so the retired copy keeps the SAME at-rest protection, and record its PUBLIC fingerprint.
    const oldWrapped = await crypto.wrapPrivateKey(oldActive, deviceSecret);
    const oldFingerprint = await crypto.fingerprint(oldActivePk);

    // Generate + wrap the NEW active keypair.
    const newIdentity = await crypto.generateIdentity();
    const newPublicKey = crypto.exportPublicKey(newIdentity);
    const newWrapped = await crypto.wrapPrivateKey(newIdentity, deviceSecret);

    const retiredEntry: RetiredKeyEntry = {
      wrapped: oldWrapped,
      publicKeyString: oldActivePk,
      fingerprint: oldFingerprint,
      retiredAtMs: now(),
    };
    const newRetired = prependRetired(await store.loadRetiredKeys(), retiredEntry);

    // Persist retained-first (see CRASH-SAFETY above): retired blob, THEN the active pointer.
    await store.saveRetiredKeys(newRetired);
    await store.saveWrappedIdentity(newWrapped);

    // Flip in-memory state: new active, old active becomes the newest retired keypair. We already
    // hold both unwrapped, so there is no re-unwrap and no additional biometric prompt.
    setState({
      status: "unlocked",
      identity: newIdentity,
      publicKeyString: newPublicKey,
      retiredKeypairs: [oldActive, ...priorRetiredKeypairs],
    });
    return newPublicKey;
  }

  return {
    getState: () => state,
    init,
    setupNew,
    importIdentity,
    unlock,
    lock,
    wipe,
    rotate,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
