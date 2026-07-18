import { describe, expect, it, vi } from "vitest";
import {
  type AppStateSubscription,
  createPrivacyShieldController,
  type PrivacyShieldDeps,
} from "@/src/shield/privacy-shield-controller";

// The controller owns the privacy shield's imperative lifecycle (ScreenCapture prevent/allow + the
// AppState subscribe/remove) that usePrivacyShield previously held inside useEffects and could not
// be exercised under the Node runner (there is NO React renderer in this workspace, by design). By
// injecting fakes for ScreenCapture/AppState we close that coverage gap without a renderer.

interface Harness {
  deps: PrivacyShieldDeps;
  preventScreenCaptureAsync: ReturnType<typeof vi.fn>;
  allowScreenCaptureAsync: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  subscription: AppStateSubscription & { remove: ReturnType<typeof vi.fn> };
  onObscuredChange: ReturnType<typeof vi.fn>;
  // The "change" callback captured when the controller subscribes; lets a test drive AppState.
  fireChange: (state: string) => void;
}

function makeHarness(): Harness {
  const preventScreenCaptureAsync = vi.fn().mockResolvedValue(undefined);
  const allowScreenCaptureAsync = vi.fn().mockResolvedValue(undefined);
  const subscription = { remove: vi.fn() };
  let captured: ((state: string) => void) | null = null;
  const addEventListener = vi.fn((_type: "change", listener: (state: string) => void) => {
    captured = listener;
    return subscription;
  });
  const onObscuredChange = vi.fn();

  return {
    deps: {
      // The controller only calls these methods; the structural shapes are intentionally minimal.
      ScreenCapture: {
        preventScreenCaptureAsync,
        allowScreenCaptureAsync,
      } as unknown as PrivacyShieldDeps["ScreenCapture"],
      AppState: { addEventListener } as unknown as PrivacyShieldDeps["AppState"],
      onObscuredChange,
    },
    preventScreenCaptureAsync,
    allowScreenCaptureAsync,
    addEventListener,
    subscription,
    onObscuredChange,
    fireChange: (state) => {
      if (captured === null) throw new Error("AppState 'change' listener was never registered");
      captured(state);
    },
  };
}

describe("createPrivacyShieldController", () => {
  it("start() blocks screen capture once and subscribes to AppState once", () => {
    const h = makeHarness();
    const controller = createPrivacyShieldController(h.deps);

    controller.start();

    expect(h.preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(h.addEventListener).toHaveBeenCalledTimes(1);
    expect(h.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("obscures (true) on 'background' — defeats the OS app-switcher snapshot", () => {
    const h = makeHarness();
    createPrivacyShieldController(h.deps).start();

    h.fireChange("background");

    expect(h.onObscuredChange).toHaveBeenCalledTimes(1);
    expect(h.onObscuredChange).toHaveBeenLastCalledWith(true);
  });

  it("obscures (true) on 'inactive' — covers the transient app-switcher peek / biometric prompt", () => {
    const h = makeHarness();
    createPrivacyShieldController(h.deps).start();

    h.fireChange("inactive");

    expect(h.onObscuredChange).toHaveBeenCalledTimes(1);
    expect(h.onObscuredChange).toHaveBeenLastCalledWith(true);
  });

  it("un-obscures (false) on 'active' — foregrounded", () => {
    const h = makeHarness();
    createPrivacyShieldController(h.deps).start();

    h.fireChange("active");

    expect(h.onObscuredChange).toHaveBeenCalledTimes(1);
    expect(h.onObscuredChange).toHaveBeenLastCalledWith(false);
  });

  it("stop() re-allows screen capture once and removes the AppState subscription once", () => {
    const h = makeHarness();
    const controller = createPrivacyShieldController(h.deps);
    controller.start();

    controller.stop();

    expect(h.allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(h.subscription.remove).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected preventScreenCaptureAsync (iOS best-effort) without throwing", () => {
    const h = makeHarness();
    h.preventScreenCaptureAsync.mockRejectedValueOnce(new Error("no FLAG_SECURE on iOS"));
    const controller = createPrivacyShieldController(h.deps);

    expect(() => controller.start()).not.toThrow();
    expect(h.addEventListener).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected allowScreenCaptureAsync without throwing", () => {
    const h = makeHarness();
    h.allowScreenCaptureAsync.mockRejectedValueOnce(new Error("teardown race"));
    const controller = createPrivacyShieldController(h.deps);
    controller.start();

    expect(() => controller.stop()).not.toThrow();
    expect(h.subscription.remove).toHaveBeenCalledTimes(1);
  });
});
