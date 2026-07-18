import { BiometricUnavailableError } from "@/src/identity/device-secret";

// Shown when the device/simulator has no enrolled biometric. A requireAuthentication-protected
// item cannot be created or read without one, so point the user at enrollment instead of
// surfacing the raw native "No biometrics are currently enrolled" rejection.
export const BIOMETRIC_UNAVAILABLE_HINT =
  "Set up Face ID, Touch ID, or a fingerprint in your device settings, then try again.";

// Maps a thrown gate error to user-facing copy for the setup / unlock screens.
export function gateErrorMessage(error: unknown): string {
  if (error instanceof BiometricUnavailableError) return BIOMETRIC_UNAVAILABLE_HINT;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
