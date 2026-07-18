import type { AppStateStatus } from "react-native";
import { isObscured } from "./shield-logic";

// Framework-agnostic controller for the privacy shield's imperative lifecycle, extracted from
// usePrivacyShield so the ScreenCapture prevent/allow pairing and the AppState subscribe/remove can
// be unit-tested in plain Node (no React renderer, no react-native module load — only the
// AppStateStatus *type* is imported, which erases at runtime).
//
// The shield obscures on ANY non-active state (isObscured) to defeat the OS app-switcher snapshot.
// This is DELIBERATELY SEPARATE from the identity auto-lock listener (identity-context.tsx), which
// drops the in-memory key on "background" only.

// Minimal structural shapes of the injected native deps — only the methods the controller calls.
export interface ScreenCaptureDep {
  preventScreenCaptureAsync: () => Promise<unknown>;
  allowScreenCaptureAsync: () => Promise<unknown>;
}

export interface AppStateSubscription {
  remove: () => void;
}

export interface AppStateDep {
  addEventListener: (
    type: "change",
    listener: (state: AppStateStatus) => void,
  ) => AppStateSubscription;
}

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

export interface PrivacyShieldController {
  start(): void;
  stop(): void;
}

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
