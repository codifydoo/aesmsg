import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BiometricConfirmationRejectedError,
  checkBiometricCapability,
  getBiometricOnboardingState,
  performBiometricConfirmation,
} from "@/src/onboarding/biometric-onboarding";

// expo-local-authentication cannot load under Node vitest — mock the three surfaces this module
// touches, exactly as tests/device-secret.test.ts does. No expo-secure-store here: this module
// never reads the keychain (it persists via useSettings in the wrapper, not from this pure logic).
vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: vi.fn(),
  isEnrolledAsync: vi.fn(),
  authenticateAsync: vi.fn(),
}));

const LocalAuthentication = await import("expo-local-authentication");
const hasHardwareAsync = vi.mocked(LocalAuthentication.hasHardwareAsync);
const isEnrolledAsync = vi.mocked(LocalAuthentication.isEnrolledAsync);
const authenticateAsync = vi.mocked(LocalAuthentication.authenticateAsync);

// Minimal structural settings shapes — only `biometricOnboardingSeen` is read by the selector.
const SEEN = { biometricOnboardingSeen: true } as const;
const UNSEEN = { biometricOnboardingSeen: false } as const;

describe("biometric-onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasHardwareAsync.mockResolvedValue(true);
    isEnrolledAsync.mockResolvedValue(true);
    authenticateAsync.mockResolvedValue({ success: true } as Awaited<
      ReturnType<typeof LocalAuthentication.authenticateAsync>
    >);
  });

  describe("checkBiometricCapability", () => {
    it("reports capable when hardware is present and a biometric is enrolled", async () => {
      const cap = await checkBiometricCapability();
      expect(cap).toEqual({ hasHardware: true, isEnrolled: true, capable: true });
    });

    it("reports not-capable (and does NOT throw) when there is no hardware", async () => {
      hasHardwareAsync.mockResolvedValue(false);
      const cap = await checkBiometricCapability();
      expect(cap).toEqual({ hasHardware: false, isEnrolled: true, capable: false });
    });

    it("reports not-capable (and does NOT throw) when no biometric is enrolled", async () => {
      isEnrolledAsync.mockResolvedValue(false);
      const cap = await checkBiometricCapability();
      expect(cap).toEqual({ hasHardware: true, isEnrolled: false, capable: false });
    });

    it("reports not-capable when neither hardware nor enrollment is present", async () => {
      hasHardwareAsync.mockResolvedValue(false);
      isEnrolledAsync.mockResolvedValue(false);
      const cap = await checkBiometricCapability();
      expect(cap.capable).toBe(false);
    });
  });

  describe("performBiometricConfirmation", () => {
    it("authenticates with the supplied prompt and resolves when the user confirms", async () => {
      await expect(performBiometricConfirmation("Confirm Face ID")).resolves.toBeUndefined();
      expect(authenticateAsync).toHaveBeenCalledTimes(1);
      const [opts] = authenticateAsync.mock.calls[0] ?? [];
      expect(opts?.promptMessage).toBe("Confirm Face ID");
    });

    it("throws BiometricConfirmationRejectedError when the user cancels or fails", async () => {
      authenticateAsync.mockResolvedValue({ success: false } as Awaited<
        ReturnType<typeof LocalAuthentication.authenticateAsync>
      >);
      await expect(performBiometricConfirmation("Confirm Face ID")).rejects.toBeInstanceOf(
        BiometricConfirmationRejectedError,
      );
    });

    it("does not run a capability gate before prompting (single authenticate call only)", async () => {
      await performBiometricConfirmation("Confirm Face ID");
      expect(hasHardwareAsync).not.toHaveBeenCalled();
      expect(isEnrolledAsync).not.toHaveBeenCalled();
    });
  });

  describe("getBiometricOnboardingState", () => {
    it("returns 'show' on first run (biometricOnboardingSeen === false)", () => {
      expect(getBiometricOnboardingState(UNSEEN)).toBe("show");
    });

    it("returns 'skip' once the screen has been seen", () => {
      expect(getBiometricOnboardingState(SEEN)).toBe("skip");
    });
  });
});
