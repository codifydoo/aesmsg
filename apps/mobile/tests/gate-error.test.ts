import { describe, expect, it, vi } from "vitest";

// gate-error imports BiometricUnavailableError from device-secret, which loads the native
// modules at import time. Mock them so the module graph resolves under Node vitest. The
// WHEN_UNLOCKED_THIS_DEVICE_ONLY sentinel is read into a module constant on load, so it must
// exist on the mock (see device-secret.test.ts for the same rationale).
const { WHEN_UNLOCKED_THIS_DEVICE_ONLY } = vi.hoisted(() => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
}));

vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}));

vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: vi.fn(),
  isEnrolledAsync: vi.fn(),
  authenticateAsync: vi.fn(),
}));

const { BiometricUnavailableError, BiometricRejectedError } = await import(
  "@/src/identity/device-secret"
);
const { BIOMETRIC_UNAVAILABLE_HINT, gateErrorMessage } = await import("@/src/keys/gate-error");

describe("gateErrorMessage", () => {
  it("maps BiometricUnavailableError to an actionable enrollment hint", () => {
    expect(gateErrorMessage(new BiometricUnavailableError())).toBe(BIOMETRIC_UNAVAILABLE_HINT);
  });

  it("passes through other Error messages verbatim", () => {
    expect(gateErrorMessage(new BiometricRejectedError())).toBe(
      "Biometric authentication was cancelled or failed",
    );
    expect(gateErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back to a generic message for non-Error throwables", () => {
    expect(gateErrorMessage("nope")).toBe("Something went wrong");
    expect(gateErrorMessage(undefined)).toBe("Something went wrong");
  });
});
