import type { AppStateStatus } from "react-native";
import type { AppLockTimeout } from "@/src/settings/settings-format";
import { appLockTimeoutMs } from "@/src/settings/settings-format";

// Pure decision: should an AppState transition drop the in-memory private key?
//
// We lock ONLY on "background" — the app has actually been backgrounded. We deliberately do NOT
// lock on "inactive": iOS fires "inactive" transiently during the biometric prompt, Control
// Center, the app switcher peek, and incoming-call banners. Locking on "inactive" would race the
// biometric unlock and produce a lock/unlock loop. The privacy shield (usePrivacyShield) covers
// the visual "obscure on not-active" concern separately; this helper governs key lifetime only.
export function shouldLockOnAppState(next: AppStateStatus): boolean {
  return next === "background";
}

// The inactivity timeout (ms) after which the app re-locks, or null to disable. Thin re-export of the
// settings mapping, kept here so identity-context imports a single auto-lock surface. "never" => null.
export function resolveAutoLockMs(timeout: AppLockTimeout): number | null {
  return appLockTimeoutMs(timeout);
}
