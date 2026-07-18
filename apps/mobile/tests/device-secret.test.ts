import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BiometricRejectedError,
  BiometricUnavailableError,
  createDeviceSecret,
  deleteDeviceSecret,
  unlockDeviceSecret,
} from "@/src/identity/device-secret";

// Native modules cannot load under Node vitest, so expo-secure-store and expo-local-authentication
// are mocked. WHEN_UNLOCKED_THIS_DEVICE_ONLY MUST be present because SECURE_OPTIONS reads it at
// module-load time. SecurityLevel MUST be present because ensureBiometricCapable compares against
// SecurityLevel.BIOMETRIC_STRONG at runtime.
//
// THE GATE'S CONTRACT: expo-secure-store's requireAuthentication path requires a *STRONG* (Class 3)
// biometric — it gates on canAuthenticate(BIOMETRIC_STRONG). isEnrolledAsync only proves a *WEAK*
// biometric, so a weak-only device (Samsung face unlock, no fingerprint) passed the old gate yet the
// Keystore write rejected with a raw "No biometrics are currently enrolled". The gate now keys on
// getEnrolledLevelAsync() === BIOMETRIC_STRONG, which is exactly what the write needs.
const { WHEN_UNLOCKED_THIS_DEVICE_ONLY, SecurityLevel } = vi.hoisted(() => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}));

vi.mock("expo-local-authentication", () => ({
  getEnrolledLevelAsync: vi.fn(),
  authenticateAsync: vi.fn(),
  SecurityLevel,
}));

const SecureStore = await import("expo-secure-store");
const LocalAuthentication = await import("expo-local-authentication");

const setItemAsync = vi.mocked(SecureStore.setItemAsync);
const getItemAsync = vi.mocked(SecureStore.getItemAsync);
const deleteItemAsync = vi.mocked(SecureStore.deleteItemAsync);
const getEnrolledLevelAsync = vi.mocked(LocalAuthentication.getEnrolledLevelAsync);
const authenticateAsync = vi.mocked(LocalAuthentication.authenticateAsync);

// SecurityLevel is a plain number map in the mock; cast each level to the real enum type.
const asLevel = (n: number) => n as unknown as LocalAuthentication.SecurityLevel;
const STRONG = asLevel(SecurityLevel.BIOMETRIC_STRONG);
const WEAK = asLevel(SecurityLevel.BIOMETRIC_WEAK);
const SECRET = asLevel(SecurityLevel.SECRET);
const NONE = asLevel(SecurityLevel.NONE);

const DEVICE_SECRET_KEY = "aesmsg.device-secret";

describe("device-secret", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) so a per-test mockRejectedValue on setItemAsync does not
    // leak into the next case — clearAllMocks keeps implementations, only wiping call history.
    vi.resetAllMocks();
    // Happy-path default: a STRONG biometric is enrolled and authentication succeeds.
    getEnrolledLevelAsync.mockResolvedValue(STRONG);
    authenticateAsync.mockResolvedValue({ success: true } as Awaited<
      ReturnType<typeof LocalAuthentication.authenticateAsync>
    >);
  });

  describe("createDeviceSecret", () => {
    it("returns a non-empty base64 secret and persists it once behind hardware access control", async () => {
      const secret = await createDeviceSecret();

      // Non-empty and decodable as base64 (the secret is opaque 32-byte entropy, b64-encoded).
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThan(0);
      expect(() => globalThis.atob(secret)).not.toThrow();

      expect(setItemAsync).toHaveBeenCalledTimes(1);
      const [key, value, options] = setItemAsync.mock.calls[0] ?? [];
      expect(key).toBe(DEVICE_SECRET_KEY);
      expect(value).toBe(secret);
      // The hardware access-control invariant: write requires biometric + this-device-only.
      expect(options).toMatchObject({
        requireAuthentication: true,
        keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    });

    it("produces a different secret on each call (CSPRNG entropy)", async () => {
      const a = await createDeviceSecret();
      const b = await createDeviceSecret();
      expect(a).not.toBe(b);
    });

    it.each([
      ["no biometric hardware (NONE)", NONE],
      ["device credential only, no biometric (SECRET)", SECRET],
      ["a WEAK biometric only — e.g. Samsung face unlock (WEAK)", WEAK],
    ])("throws BiometricUnavailableError without writing storage when the enrolled level is %s", async (_label, level) => {
      getEnrolledLevelAsync.mockResolvedValue(level);

      await expect(createDeviceSecret()).rejects.toBeInstanceOf(BiometricUnavailableError);
      // Short-circuit BEFORE the native write — the write is what leaks the raw native rejection.
      expect(setItemAsync).not.toHaveBeenCalled();
    });

    it("re-brands a raw native biometric rejection from the Keystore write instead of leaking it", async () => {
      // Gate reports STRONG, but a vendor skin / weak-vs-strong race still rejects the write raw.
      setItemAsync.mockRejectedValue(
        new Error(
          "Call to function 'ExpoSecureStore.setValueWithKeyAsync' has been rejected. → Caused by: Could not Authenticate the user: No biometrics are currently enrolled",
        ),
      );

      await expect(createDeviceSecret()).rejects.toBeInstanceOf(BiometricUnavailableError);
    });

    it("passes a non-biometric storage failure through unchanged (no mislabelling)", async () => {
      const diskError = new Error("Keystore is full");
      setItemAsync.mockRejectedValue(diskError);

      await expect(createDeviceSecret()).rejects.toBe(diskError);
    });

    it("does not prompt for biometric authentication on write", async () => {
      // Creating a requireAuthentication item does not authenticate; the prompt happens on read
      // (unlock). The pre-flight must stay a capability check, never an extra Face ID prompt.
      await createDeviceSecret();

      expect(authenticateAsync).not.toHaveBeenCalled();
    });
  });

  describe("unlockDeviceSecret", () => {
    it("returns the stored secret via a SINGLE biometric prompt — the gated read, not a second authenticateAsync (SEC-8)", async () => {
      getItemAsync.mockResolvedValue("c3RvcmVkLXNlY3JldA==");

      const secret = await unlockDeviceSecret();

      expect(secret).toBe("c3RvcmVkLXNlY3JldA==");
      // The double-prompt fix: unlock must NOT call LocalAuthentication.authenticateAsync. The
      // requireAuthentication read below is itself the one and only biometric prompt.
      expect(authenticateAsync).not.toHaveBeenCalled();
      // The STRONG-level capability gate still runs (non-prompting) before the read.
      expect(getEnrolledLevelAsync).toHaveBeenCalledTimes(1);
      // Exactly one gated read, carrying the same hardware access-control options used on write.
      expect(getItemAsync).toHaveBeenCalledTimes(1);
      const [readKey, readOptions] = getItemAsync.mock.calls[0] ?? [];
      expect(readKey).toBe(DEVICE_SECRET_KEY);
      expect(readOptions).toMatchObject({
        requireAuthentication: true,
        keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    });

    it("throws BiometricUnavailableError (no prompt, no read) when no STRONG biometric is enrolled", async () => {
      getEnrolledLevelAsync.mockResolvedValue(WEAK);

      await expect(unlockDeviceSecret()).rejects.toBeInstanceOf(BiometricUnavailableError);
      // The STRONG gate must precede the gated read (which is the prompt).
      expect(authenticateAsync).not.toHaveBeenCalled();
      expect(getItemAsync).not.toHaveBeenCalled();
    });

    it("maps a cancelled / failed biometric on the gated read to BiometricRejectedError", async () => {
      // The prompt now lives inside the requireAuthentication read; a cancel/fail rejects it.
      getItemAsync.mockRejectedValue(
        new Error("Could not Authenticate the user: authentication was canceled"),
      );

      await expect(unlockDeviceSecret()).rejects.toBeInstanceOf(BiometricRejectedError);
    });

    it("propagates a non-auth storage failure from the read untouched (no mislabelling as a cancel)", async () => {
      const diskError = new Error("Keystore is unavailable");
      getItemAsync.mockRejectedValue(diskError);

      await expect(unlockDeviceSecret()).rejects.toBe(diskError);
    });

    it("throws when biometric succeeds but no secret is stored", async () => {
      getItemAsync.mockResolvedValue(null);

      await expect(unlockDeviceSecret()).rejects.toThrow("No device secret stored");
      expect(getItemAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteDeviceSecret", () => {
    it("deletes the stored secret by key exactly once", async () => {
      await deleteDeviceSecret();

      expect(deleteItemAsync).toHaveBeenCalledTimes(1);
      const [key] = deleteItemAsync.mock.calls[0] ?? [];
      expect(key).toBe(DEVICE_SECRET_KEY);
    });
  });
});
