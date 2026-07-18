import type { AppStateStatus } from "react-native";

// Framework-agnostic privacy-shield logic, extracted from usePrivacyShield so the 60s clipboard
// timer and the AppState->obscure mapping can be unit-tested in plain Node (no React renderer, no
// react-native module load — only the AppStateStatus *type* is imported, which erases at runtime).

// Pure mapping: the cosmetic privacy cover is shown whenever the app is not foregrounded. This is
// SEPARATE from the identity auto-lock decision (shouldLockOnAppState locks on "background" only):
// the shield obscures on ANY non-active state ("inactive" + "background") to defeat the OS
// app-switcher snapshot, while never dropping the in-memory key on the transient "inactive".
export function isObscured(state: AppStateStatus): boolean {
  return state !== "active";
}

// Which surface is mounting a privacy shield:
//  - "app"     — the app-root shield. Obscures the app-switcher snapshot APP-WIDE (every screen),
//                but NEVER applies FLAG_SECURE globally (screenshotting non-plaintext screens is
//                allowed). Only reader/compose block screenshots.
//  - "compose" — the composer, where the plaintext secret is typed.
//  - "reader"  — the secure reader, where decrypted plaintext is shown.
export type ShieldSurface = "app" | "compose" | "reader";

// The two user-facing shield preferences a surface reads.
export interface ShieldSettings {
  /** Settings → "Blur app preview": obscure the app-switcher snapshot. */
  blurPreview: boolean;
  /** Settings → "Block screenshots": FLAG_SECURE / prevent screen capture on plaintext screens. */
  blockScreens: boolean;
}

export interface ShieldConfig {
  blurPreview: boolean;
  blockScreens: boolean;
}

// Central policy for what a given surface's shield should do, so the app-root, compose, and reader
// all derive their usePrivacyShield options from ONE tested rule instead of ad-hoc inline booleans:
//   - blurPreview follows the user's setting everywhere (the app-switcher cover is app-wide).
//   - blockScreens (FLAG_SECURE / preventScreenCapture) applies ONLY on the plaintext surfaces
//     (compose + reader) and is NEVER turned on app-wide — the app-root shield obscures the snapshot
//     but must not FLAG_SECURE the whole app. Note: this uses expo-screen-capture's PREVENTION
//     (FLAG_SECURE) only — never the screenshot-DETECTION listener, which needs READ_MEDIA_IMAGES on
//     Android and was deliberately blocked in prior work.
export function shieldConfig(surface: ShieldSurface, settings: ShieldSettings): ShieldConfig {
  return {
    blurPreview: settings.blurPreview,
    blockScreens: surface === "app" ? false : settings.blockScreens,
  };
}

export interface TimerDeps {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  // Auto-clear delay in ms. Defaults to CLIPBOARD_CLEAR_MS (60s) when omitted, preserving the prior
  // behavior for callers that don't yet thread a persisted clipboardClearSeconds.
  clearMs?: number;
}

export interface ClipboardAutoClear {
  // Schedule `fn` to run 60s from now. A second schedule before the first fires REPLACES it
  // (debounce): only the most recent scheduled fn ever runs, 60s after the last schedule call.
  schedule(fn: () => void): void;
  // Cancel any pending timer so nothing fires (used on unmount).
  cancel(): void;
}

export const CLIPBOARD_CLEAR_MS = 60_000;

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
