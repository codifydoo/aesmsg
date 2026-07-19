import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { usePrivacyShield } from "@/src/reader/use-privacy-shield";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

describe("usePrivacyShield", () => {
  afterEach(() => {
    // Restore the real visibilityState getter for other suites.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  it("is not obscured while the document is visible", () => {
    setVisibility("visible");
    const { result } = renderHook(() => usePrivacyShield());
    expect(result.current.isObscured).toBe(false);
  });

  it("is obscured on the very FIRST render when the tab is already hidden at mount", () => {
    // Seeds from the real visibilityState (not a blind `false`), so decrypted text can't paint for a
    // frame when the decrypt resolves while the tab is already backgrounded.
    setVisibility("hidden");
    const { result } = renderHook(() => usePrivacyShield());
    expect(result.current.isObscured).toBe(true);
  });

  it("obscures when the document becomes hidden and reveals when visible again", () => {
    setVisibility("visible");
    const { result } = renderHook(() => usePrivacyShield());

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.isObscured).toBe(true);

    act(() => {
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.isObscured).toBe(false);
  });

  it("obscures on window blur and re-derives from visibility on focus", () => {
    setVisibility("visible");
    const { result } = renderHook(() => usePrivacyShield());

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current.isObscured).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current.isObscured).toBe(false);
  });
});
