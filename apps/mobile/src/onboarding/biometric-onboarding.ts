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
