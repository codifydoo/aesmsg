import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIPBOARD_CLEAR_MS,
  createClipboardAutoClear,
  isObscured,
} from "@/src/shield/shield-logic";

// usePrivacyShield itself is a React hook wired to native modules (expo-screen-capture, the
// react-native AppState listener) that cannot mount under the Node test runner (there is NO React
// renderer in this workspace, by design). So we test the framework-agnostic logic the hook was
// refactored down to in shield-logic.ts: the 60s clipboard auto-clear timer factory and the
// AppState->obscure pure mapping. The hook is a thin wrapper that injects real globals/modules into
// these and is exercised manually on device.

describe("isObscured (AppState -> cosmetic privacy cover)", () => {
  // The shield obscures on ANY non-active state to defeat the OS app-switcher snapshot. This is
  // SEPARATE from identity auto-lock (shouldLockOnAppState, which fires on "background" only): the
  // shield must also cover the transient "inactive" (Control Center / biometric prompt) without
  // dropping the in-memory key.
  it("obscures on 'background'", () => {
    expect(isObscured("background")).toBe(true);
  });

  it("obscures on 'inactive' (app-switcher peek / Control Center / biometric prompt)", () => {
    expect(isObscured("inactive")).toBe(true);
  });

  it("does NOT obscure on 'active' (foregrounded)", () => {
    expect(isObscured("active")).toBe(false);
  });
});

describe("createClipboardAutoClear (60s clipboard auto-clear timer)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeAutoClear() {
    // Inject the global fake timers so the factory's setTimeout/clearTimeout are controllable.
    return createClipboardAutoClear({
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle),
    });
  }

  // Pin the actual delay: the other timer tests advance by CLIPBOARD_CLEAR_MS, so a regression that
  // silently changed the real delay (e.g. 60s -> 30s) would pass them. This literal assertion fails
  // the gate if the clipboard auto-clear window is ever shortened or lengthened.
  it("the clipboard auto-clear delay is exactly 60_000ms (60s)", () => {
    expect(CLIPBOARD_CLEAR_MS).toBe(60_000);
  });

  it("the clear fn fires only after exactly 60_000ms, not before", async () => {
    const autoClear = makeAutoClear();
    const clearFn = vi.fn();

    autoClear.schedule(clearFn);

    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS - 1);
    expect(clearFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(clearFn).toHaveBeenCalledTimes(1);
  });

  it("the clear fn fires exactly once (no repeat after the 60s tick)", async () => {
    const autoClear = makeAutoClear();
    const clearFn = vi.fn();

    autoClear.schedule(clearFn);

    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS * 3);
    expect(clearFn).toHaveBeenCalledTimes(1);
  });

  it("debounces: a second schedule replaces the first — only the second fires, 60s after it", async () => {
    const autoClear = makeAutoClear();
    const first = vi.fn();
    const second = vi.fn();

    autoClear.schedule(first);
    // Re-schedule before the first would fire (mirrors a second Copy press).
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS - 1);
    autoClear.schedule(second);

    // Crossing the FIRST schedule's original 60s boundary must NOT fire it (it was cancelled).
    // 1ms has now elapsed since the SECOND schedule.
    await vi.advanceTimersByTimeAsync(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    // Only after a FULL 60s from the second schedule does the second fn run. We've already advanced
    // 1ms past it, so 60s - 2ms more leaves us at 59_999ms (not yet), then +1ms lands exactly on 60s.
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS - 2);
    expect(second).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("cancel() clears the pending timer so nothing fires (unmount path)", async () => {
    const autoClear = makeAutoClear();
    const clearFn = vi.fn();

    autoClear.schedule(clearFn);
    autoClear.cancel();

    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS * 2);
    expect(clearFn).not.toHaveBeenCalled();
  });

  it("cancel() with no pending timer is a no-op (safe to call repeatedly)", async () => {
    const autoClear = makeAutoClear();
    expect(() => {
      autoClear.cancel();
      autoClear.cancel();
    }).not.toThrow();
  });
});
