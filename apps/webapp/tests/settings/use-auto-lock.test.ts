import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoLock } from "@/src/settings/use-auto-lock";

describe("useAutoLock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls lock after the timeout elapses with no activity", async () => {
    const lock = vi.fn();
    renderHook(() => useAutoLock(1000, lock));
    expect(lock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on activity (pointerdown)", async () => {
    const lock = vi.fn();
    renderHook(() => useAutoLock(1000, lock));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    // 600ms more since the reset — still under 1000, so no lock yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(lock).not.toHaveBeenCalled();

    // Another 400ms crosses the 1000ms window from the reset → lock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("never locks when the timeout is null ('never')", async () => {
    const lock = vi.fn();
    renderHook(() => useAutoLock(null, lock));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000);
    });
    expect(lock).not.toHaveBeenCalled();
  });
});
