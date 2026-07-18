import * as ScreenCapture from "expo-screen-capture";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { createPrivacyShieldController } from "./privacy-shield-controller";
import { createClipboardAutoClear } from "./shield-logic";

export interface PrivacyShieldOptions {
  /** Blur/obscure the screen when not foregrounded (Settings → Blur app preview). Default true. */
  blurPreview?: boolean;
  /** Block screenshots / recording while mounted (Settings → Block screenshots). Default true. */
  blockScreens?: boolean;
}

// Privacy shield for screens showing decrypted content:
//  - block screenshots / screen recording while mounted (Android FLAG_SECURE; iOS best-effort)
//  - report when the app is not foregrounded so callers can render an opaque cover
//    (defends against the OS app-switcher snapshot)
//
// Thin wrapper: the imperative ScreenCapture + AppState lifecycle lives in
// createPrivacyShieldController and the timer in createClipboardAutoClear — both
// framework-agnostic and unit-tested in Node. The controller's AppState listener is DELIBERATELY
// SEPARATE from the identity auto-lock listener (identity-context.tsx): the shield is a cosmetic
// obscure on any non-active state; the lock drops the in-memory key on background only.
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
      ...(clearMs !== undefined ? { clearMs } : {}),
    }),
  );
  useEffect(() => () => autoClear.current.cancel(), []);
  return {
    scheduleClear(clearFn: () => void) {
      autoClear.current.schedule(clearFn);
    },
  };
}
