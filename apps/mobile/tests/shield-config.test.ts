import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrivacyShieldController } from "@/src/shield/privacy-shield-controller";
import { createClipboardAutoClear } from "@/src/shield/shield-logic";

// The shield logic was parameterised so persisted settings can drive it:
//   - createClipboardAutoClear now takes a configurable delay (clipboardClearSeconds * 1000).
//   - createPrivacyShieldController skips screen-capture prevention when blockScreens is false, and
//     reports never-obscured when obscureEnabled (blurPreview) is false.
// All framework-agnostic, so it's unit-tested in Node (no RN renderer).

describe("createClipboardAutoClear (configurable delay)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make(clearMs: number) {
    return createClipboardAutoClear({
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h),
      clearMs,
    });
  }

  it("fires after the configured delay, not the old 60s default", async () => {
    const autoClear = make(30_000);
    const fn = vi.fn();
    autoClear.schedule(fn);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("defaults to 60_000ms when no clearMs is supplied (back-compat with the reader's old call)", async () => {
    const autoClear = createClipboardAutoClear({
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h),
    });
    const fn = vi.fn();
    autoClear.schedule(fn);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("createPrivacyShieldController (blockScreens + obscureEnabled)", () => {
  function fakeDeps(overrides: Partial<{ blockScreens: boolean; obscureEnabled: boolean }> = {}) {
    const prevent = vi.fn(async () => {});
    const allow = vi.fn(async () => {});
    let listener: ((s: string) => void) | null = null;
    const onObscuredChange = vi.fn();
    const controller = createPrivacyShieldController({
      ScreenCapture: { preventScreenCaptureAsync: prevent, allowScreenCaptureAsync: allow },
      AppState: {
        addEventListener: (_t, l) => {
          listener = l as (s: string) => void;
          return { remove: vi.fn() };
        },
      },
      onObscuredChange,
      blockScreens: overrides.blockScreens ?? true,
      obscureEnabled: overrides.obscureEnabled ?? true,
    });
    return { prevent, allow, onObscuredChange, controller, fire: (s: string) => listener?.(s) };
  }

  it("calls preventScreenCaptureAsync on start when blockScreens is true", () => {
    const { prevent, controller } = fakeDeps({ blockScreens: true });
    controller.start();
    expect(prevent).toHaveBeenCalledTimes(1);
  });

  it("does NOT call preventScreenCaptureAsync when blockScreens is false", () => {
    const { prevent, controller } = fakeDeps({ blockScreens: false });
    controller.start();
    expect(prevent).not.toHaveBeenCalled();
  });

  it("obscures on non-active states when obscureEnabled is true", () => {
    const { onObscuredChange, controller, fire } = fakeDeps({ obscureEnabled: true });
    controller.start();
    fire("background");
    expect(onObscuredChange).toHaveBeenLastCalledWith(true);
    fire("active");
    expect(onObscuredChange).toHaveBeenLastCalledWith(false);
  });

  it("never reports obscured when obscureEnabled is false (blur preview off)", () => {
    const { onObscuredChange, controller, fire } = fakeDeps({ obscureEnabled: false });
    controller.start();
    fire("background");
    expect(onObscuredChange).toHaveBeenLastCalledWith(false);
    fire("inactive");
    expect(onObscuredChange).toHaveBeenLastCalledWith(false);
  });
});
