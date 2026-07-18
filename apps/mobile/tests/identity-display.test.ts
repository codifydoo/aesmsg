import { describe, expect, it } from "vitest";
import { IDENTITY_LABEL, keyDerivedInitials } from "@/src/identity/identity-display";

// keyDerivedInitials is pure (node-tested); useShortFingerprint is a thin React hook exercised
// on-device, not by the renderer (per the apps/mobile no-React-renderer convention).

describe("keyDerivedInitials", () => {
  it("takes the first two alphanumerics of a short fingerprint, uppercased", () => {
    expect(keyDerivedInitials("E82F 4D11")).toBe("E8");
    expect(keyDerivedInitials("a1b2")).toBe("A1");
  });

  it("skips separators / non-alphanumerics", () => {
    expect(keyDerivedInitials("  -E8 2F")).toBe("E8");
  });

  it("falls back to '?' for empty / separator-only input", () => {
    expect(keyDerivedInitials("")).toBe("?");
    expect(keyDerivedInitials("   ")).toBe("?");
    expect(keyDerivedInitials("----")).toBe("?");
  });
});

describe("IDENTITY_LABEL", () => {
  it("is the honest device label, not a fake personal name", () => {
    expect(IDENTITY_LABEL).toBe("This device");
  });
});
