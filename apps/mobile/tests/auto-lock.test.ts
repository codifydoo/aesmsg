import { describe, expect, it } from "vitest";
import { shouldLockOnAppState } from "@/src/identity/auto-lock";

// The AppState->lock decision must lock the identity ONLY when the app is actually backgrounded.
// "inactive" fires transiently during the biometric prompt / Control Center / app-switcher peek;
// locking on it would race the unlock and loop. "active" must obviously never lock.
describe("shouldLockOnAppState", () => {
  it("locks on 'background'", () => {
    expect(shouldLockOnAppState("background")).toBe(true);
  });

  it("does NOT lock on 'inactive' (biometric prompt / Control Center transient)", () => {
    expect(shouldLockOnAppState("inactive")).toBe(false);
  });

  it("does NOT lock on 'active'", () => {
    expect(shouldLockOnAppState("active")).toBe(false);
  });
});
