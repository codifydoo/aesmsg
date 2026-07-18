import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  type IdentityKeypair,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSettings } from "@/src/settings/settings-context";
import { wipeEncryptedStorage } from "@/src/storage";
import { resolveAutoLockMs, shouldLockOnAppState } from "./auto-lock";
import { allPrivateKeysForDecrypt } from "./decrypt-keys";
import { createDeviceSecret, deleteDeviceSecret, unlockDeviceSecret } from "./device-secret";
import {
  createIdentityMachine,
  type IdentityActions,
  type IdentityMachine,
  type IdentityState,
} from "./identity-machine";
import { createIdleLockTimer, type IdleLockTimer } from "./idle-lock-timer";
import { MOBILE_KDF_PARAMS, needsRewrap } from "./kdf-policy";
import {
  deleteRetiredKeys,
  deleteWrappedIdentity,
  hasStoredIdentity,
  loadRetiredKeys,
  loadWrappedIdentity,
  saveRetiredKeys,
  saveWrappedIdentity,
} from "./secure-store";

// Thin React wrapper over the pure identity-machine. The machine owns all transition logic; this
// provider just instantiates it with the production modules, mirrors its state into React, and
// drives init + auto-lock from React lifecycle. The unwrapped keypair lives in the machine's
// memory (mirrored into state) only; lock()/background drops it.
export type { IdentityActions, IdentityState } from "./identity-machine";

interface IdentityContextValue {
  state: IdentityState;
  actions: IdentityActions;
  /**
   * Report a user interaction (touch / navigation) so the inactivity auto-lock timer is reset.
   * Wired from an app-root touch observer (App.tsx). A no-op when the timer is disabled ("never")
   * or not yet armed. Stable across renders; safe to call on every touch.
   */
  signalActivity: () => void;
  /** The ACTIVE keypair while unlocked (used for all new sends/receives); null otherwise. */
  activeKeypair: IdentityKeypair | null;
  /**
   * The ordered set of private keys the reader should try when decrypting: active first, then the
   * RETAINED retired keys (newest→oldest) so pre-rotation "legacy" links still open. Empty unless
   * unlocked. See identity/decrypt-keys.ts `decryptWithKeyFallback` for the reader's usage.
   */
  getAllPrivateKeysForDecrypt: () => IdentityKeypair[];
}

// `IdentityState` and `IdentityActions` are imported as type-only above and used in the
// IdentityContextValue shape below; the `export type` line re-publishes them for consumers
// (use-identity.ts) so the existing import surface is unchanged.

const IdentityContext = createContext<IdentityContextValue | null>(null);

function createProductionMachine(): IdentityMachine {
  return createIdentityMachine({
    crypto: {
      generateIdentity,
      // Mobile wraps under light KDF params; needsRewrap drives the lazy heavy→light migration.
      // See kdf-policy.ts for the 256-bit-device-secret rationale and the params themselves.
      wrapPrivateKey: (id, secret) => wrapPrivateKey(id, secret, MOBILE_KDF_PARAMS),
      unwrapPrivateKey,
      exportPublicKey,
      fingerprint,
      needsRewrap,
    },
    secret: { createDeviceSecret, unlockDeviceSecret, deleteDeviceSecret },
    store: {
      hasStoredIdentity,
      saveWrappedIdentity,
      loadWrappedIdentity,
      deleteWrappedIdentity,
      loadRetiredKeys,
      saveRetiredKeys,
      deleteRetiredKeys,
      wipeStorage: wipeEncryptedStorage,
    },
  });
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  // One machine instance for the provider's lifetime.
  const machineRef = useRef<IdentityMachine | null>(null);
  if (machineRef.current === null) machineRef.current = createProductionMachine();
  const machine = machineRef.current;

  const [state, setState] = useState<IdentityState>(machine.getState);

  // Mirror machine state into React, and kick off init once.
  useEffect(() => {
    const unsubscribe = machine.subscribe(setState);
    // Sync any state already produced before subscription, then load from disk.
    setState(machine.getState());
    void machine.init();
    return unsubscribe;
  }, [machine]);

  // Auto-lock: drop the in-memory private key when the app is backgrounded. We intentionally lock
  // ONLY on "background" (not "inactive" — see shouldLockOnAppState). This is a DEDICATED identity
  // listener, separate from usePrivacyShield's obscure listener; the two concerns (key lifetime vs.
  // screen obscuring) must not be merged.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (shouldLockOnAppState(next)) machine.lock();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [machine]);

  // Inactivity auto-lock: re-lock the machine after the persisted appLockTimeout of no INTERACTION.
  // SEPARATE from the background-lock above — that drops the key the instant the app backgrounds; this
  // covers the case where the app is left foregrounded-but-idle. "never" disables the timer entirely.
  //
  // The timer RESETS on every user interaction (signalActivity, driven by the app-root touch observer
  // in App.tsx) as well as on the AppState "active" transition, so active use never triggers a lock —
  // only genuine idleness does. The reset/expire lifecycle lives in the pure createIdleLockTimer so it
  // is unit-testable in Node; timerRef exposes the live timer to signalActivity without a re-render.
  const { settings } = useSettings();
  const timerRef = useRef<IdleLockTimer | null>(null);

  // Stable interaction signal. Reads the live timer through the ref so it never changes identity
  // (no re-renders on touch) and is a no-op while the timer is disabled ("never") or not yet armed.
  const signalActivity = useCallback(() => {
    timerRef.current?.reset();
  }, []);

  useEffect(() => {
    const ms = resolveAutoLockMs(settings.appLockTimeout);
    if (ms === null) {
      timerRef.current = null;
      return; // "never" — no inactivity timer
    }

    const timer = createIdleLockTimer({
      now: () => Date.now(),
      setTimeout: (fn, delay) => setTimeout(fn, delay),
      clearTimeout: (handle) => clearTimeout(handle),
      onExpire: () => machine.lock(),
      timeoutMs: ms,
    });
    timerRef.current = timer;
    timer.reset(); // arm on mount (app is foreground)

    const onChange = (next: AppStateStatus) => {
      // Re-arm when we return to the foreground; stop while backgrounded (background-lock owns that
      // path, and a stopped timer must not fire against a backgrounded/locked app).
      if (next === "active") timer.reset();
      else timer.stop();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => {
      timer.stop();
      timerRef.current = null;
      sub.remove();
    };
  }, [machine, settings.appLockTimeout]);

  // Re-arm the idle countdown whenever the machine (re)enters "unlocked". After an idle lock the
  // timer has fired-and-stopped; unlocking from the re-auth screen must start a fresh window so the
  // next idle period locks again (the unlock tap itself also resets via signalActivity).
  useEffect(() => {
    if (state.status === "unlocked") timerRef.current?.reset();
  }, [state.status]);

  const value = useMemo<IdentityContextValue>(
    () => ({
      state,
      actions: {
        setupNew: () => machine.setupNew(),
        importIdentity: (identity) => machine.importIdentity(identity),
        unlock: () => machine.unlock(),
        lock: () => machine.lock(),
        wipe: () => machine.wipe(),
        rotate: () => machine.rotate(),
      },
      signalActivity,
      activeKeypair: state.status === "unlocked" ? state.identity : null,
      // Reads the current state snapshot each call (recreated on every state change via the dep
      // below), so the reader always sees the latest active + retired key set.
      getAllPrivateKeysForDecrypt: () => allPrivateKeysForDecrypt(state),
    }),
    [state, machine, signalActivity],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used within <IdentityProvider>");
  return ctx;
}
