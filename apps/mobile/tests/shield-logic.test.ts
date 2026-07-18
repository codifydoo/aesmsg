import type { AppStateStatus } from "react-native";
import { describe, expect, it } from "vitest";
import { isObscured, type ShieldSettings, shieldConfig } from "@/src/shield/shield-logic";

// The privacy-shield policy was extracted into two pure functions so the app-switcher obscure
// decision and the per-surface FLAG_SECURE policy can be exercised in Node (no RN renderer, only the
// AppStateStatus *type* is imported, which erases at runtime). isObscured drives the cosmetic cover;
// shieldConfig decides what each surface's usePrivacyShield options are.

describe("isObscured (app-switcher obscure decision)", () => {
  it("does NOT obscure while foregrounded", () => {
    expect(isObscured("active")).toBe(false);
  });

  it("obscures on the transient 'inactive' (defeats the app-switcher snapshot)", () => {
    // "inactive" must obscure even though the identity key is NOT dropped on it — the two concerns
    // are separate (shield obscures on any non-active state; the lock drops the key on background).
    expect(isObscured("inactive" as AppStateStatus)).toBe(true);
  });

  it("obscures when backgrounded", () => {
    expect(isObscured("background")).toBe(true);
  });
});

describe("shieldConfig (per-surface FLAG_SECURE policy)", () => {
  const bothOn: ShieldSettings = { blurPreview: true, blockScreens: true };
  const bothOff: ShieldSettings = { blurPreview: false, blockScreens: false };

  it("app surface: NEVER blocks screenshots, even when Block-screenshots is on", () => {
    // The app-root shield obscures the app-switcher snapshot app-wide but must not FLAG_SECURE the
    // whole app — screenshotting non-plaintext screens stays allowed. blurPreview still follows.
    expect(shieldConfig("app", bothOn)).toEqual({ blurPreview: true, blockScreens: false });
  });

  it("app surface: blurPreview follows the user's setting (off → off)", () => {
    expect(shieldConfig("app", bothOff)).toEqual({ blurPreview: false, blockScreens: false });
  });

  it("compose surface: blocks screenshots when Block-screenshots is on (plaintext is typed here)", () => {
    expect(shieldConfig("compose", bothOn)).toEqual({ blurPreview: true, blockScreens: true });
  });

  it("compose surface: honours Block-screenshots OFF", () => {
    expect(shieldConfig("compose", bothOff)).toEqual({ blurPreview: false, blockScreens: false });
  });

  it("compose surface: blockScreens tracks the setting independently of blurPreview", () => {
    expect(shieldConfig("compose", { blurPreview: false, blockScreens: true })).toEqual({
      blurPreview: false,
      blockScreens: true,
    });
  });

  it("reader surface: blocks screenshots when Block-screenshots is on (decrypted plaintext shown)", () => {
    expect(shieldConfig("reader", bothOn)).toEqual({ blurPreview: true, blockScreens: true });
  });

  it("reader surface: honours Block-screenshots OFF", () => {
    expect(shieldConfig("reader", bothOff)).toEqual({ blurPreview: false, blockScreens: false });
  });
});
