import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

// The device secret replaces the web app's user passphrase: it's the input to
// wrapPrivateKey/unwrapPrivateKey. It is generated once at setup, stored in the hardware
// keystore (Keychain / Android Keystore) gated behind biometric auth, and released only
// after a successful biometric prompt. It never leaves the device.
const DEVICE_SECRET_KEY = "aesmsg.device-secret";

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export class BiometricUnavailableError extends Error {
  constructor() {
    super("Biometric authentication is unavailable on this device");
    this.name = "BiometricUnavailableError";
  }
}

export class BiometricRejectedError extends Error {
  constructor() {
    super("Biometric authentication was cancelled or failed");
    this.name = "BiometricRejectedError";
  }
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // base64 — the device secret is opaque entropy, encoding is irrelevant to wrapPrivateKey.
  return globalThis.btoa(binary);
}

// Capability gate only — verifies the device can actually hold a biometric-protected item.
// No prompt: creating a requireAuthentication item does not authenticate (that happens on read).
//
// MUST check the STRONG level, not isEnrolledAsync(). expo-secure-store's requireAuthentication path
// gates the Keystore key on canAuthenticate(BIOMETRIC_STRONG) (Class 3) and otherwise rejects the
// write with a raw "No biometrics are currently enrolled". isEnrolledAsync() only proves a WEAK
// (Class 2) biometric — so a WEAK-only device (e.g. Samsung face unlock with no fingerprint) or a
// device-credential-only (PIN/pattern) setup passes isEnrolledAsync() yet the write still fails.
// getEnrolledLevelAsync() reports the strongest available class, so requiring BIOMETRIC_STRONG is
// exactly the condition under which the write succeeds. (iOS Face ID / Touch ID both report STRONG,
// so this does not over-restrict.)
//
// KNOWN LIMITATION (deferred slice): on a device WITHOUT a strong biometric this throws
// BiometricUnavailableError, so identity setup DEAD-ENDS there (surfacing the branded enrollment hint
// from gate-error.ts rather than the raw native rejection). The honest fix that lets such devices
// onboard is the optional-biometric + passphrase/PIN fallback — a SEPARATE follow-up slice. Do NOT
// "fix" the dead-end by relaxing requireAuthentication below: that would silently weaken the private
// key's protection class.
async function ensureBiometricCapable(): Promise<void> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level !== LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) {
    throw new BiometricUnavailableError();
  }
}

// expo-secure-store's Android requireAuthentication path can still reject the Keystore write with a
// raw native message when no usable biometric backs the key (AuthenticationHelper.assertBiometricsSupport:
// "No biometrics are currently enrolled" / "No hardware available for biometric authentication"). We
// pre-flight with ensureBiometricCapable(), but vendor skins and weak-vs-strong races can slip a raw
// rejection through; detect those so createDeviceSecret can re-brand them rather than leak the raw
// native string into the UI. Non-biometric failures (storage, etc.) must NOT match — they propagate
// untouched so they are not mislabelled as an enrollment problem.
function isBiometricNativeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /biometric|enrolled/i.test(message);
}

// The unlock read (requireAuthentication) IS the biometric prompt (see unlockDeviceSecret). When the
// user cancels or fails it, expo-secure-store rejects with a native message that mentions
// authentication / cancellation / biometrics. Map those to BiometricRejectedError so the UI shows the
// branded "cancelled or failed" copy; anything not auth-shaped (keystore/storage faults) propagates
// untouched rather than being mislabelled as a user cancel.
function isBiometricAuthRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /biometric|enrolled|authenticat|cancel/i.test(message);
}

export async function createDeviceSecret(): Promise<string> {
  // Pre-flight the gate so a device without a STRONG biometric fails with a branded, explainable
  // BiometricUnavailableError instead of SecureStore's raw native "No biometrics are currently
  // enrolled" rejection. requireAuthentication: true is non-negotiable here — the private key
  // must stay biometric-gated — so this surfaces a clear error rather than relaxing the gate.
  //
  // Consequence (deferred slice — see ensureBiometricCapable above): on a device without a strong
  // biometric this throw makes setupNew() fail before any identity is persisted. That dead-end is
  // owned by the deferred passphrase/PIN fallback slice; this does NOT weaken the gate to work around it.
  await ensureBiometricCapable();
  const secret = randomSecret();
  try {
    await SecureStore.setItemAsync(DEVICE_SECRET_KEY, secret, SECURE_OPTIONS);
  } catch (error) {
    // Defense in depth: the gate above already verified a STRONG biometric, but device-specific
    // quirks can still make the native write reject for a biometric reason. Re-brand those so the raw
    // native string never reaches the UI; let unrelated failures (storage, etc.) propagate untouched.
    if (isBiometricNativeError(error)) throw new BiometricUnavailableError();
    throw error;
  }
  return secret;
}

export async function unlockDeviceSecret(): Promise<string> {
  // SINGLE-PROMPT UNLOCK (SEC-8). The device secret was written with requireAuthentication: true, so
  // reading it via SecureStore.getItemAsync is ITSELF biometric-gated and shows exactly one Face ID /
  // fingerprint prompt. The old code additionally called LocalAuthentication.authenticateAsync first,
  // producing a SECOND, redundant prompt for one logical unlock. We drop that separate prompt: the
  // gated read is the unlock. ensureBiometricCapable() stays as a NON-prompting STRONG-level (Class 3)
  // capability gate so a weak-only / biometric-less device fails with a branded
  // BiometricUnavailableError before the read, exactly as on the write path — security is unchanged
  // (still requireAuthentication + STRONG-gated), only the duplicate prompt is removed.
  await ensureBiometricCapable();
  let secret: string | null;
  try {
    secret = await SecureStore.getItemAsync(DEVICE_SECRET_KEY, SECURE_OPTIONS);
  } catch (error) {
    // A cancelled / failed biometric on the gated read is the recipient equivalent of the old
    // authenticateAsync failure — surface it as BiometricRejectedError. Non-auth faults propagate.
    if (isBiometricAuthRejection(error)) throw new BiometricRejectedError();
    throw error;
  }
  if (!secret) throw new Error("No device secret stored");
  return secret;
}

export async function deleteDeviceSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_SECRET_KEY, SECURE_OPTIONS);
}
