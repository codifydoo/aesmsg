import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClipboardAutoClear } from "@/src/reader/use-clipboard-auto-clear";

const DELAY = 45_000;

function stubClipboard(value: Partial<Clipboard>) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

describe("useClipboardAutoClear", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes the exact text on copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("");
    stubClipboard({ writeText, readText } as unknown as Clipboard);

    const { result } = renderHook(() => useClipboardAutoClear(DELAY));
    const outcome = await result.current.copy("secret");

    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("secret");
  });

  it("VERIFIED clear: after the delay, reads back and clears only when the clipboard still holds our text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("secret");
    stubClipboard({ writeText, readText } as unknown as Clipboard);

    const { result } = renderHook(() => useClipboardAutoClear(DELAY));
    await result.current.copy("secret");

    await vi.advanceTimersByTimeAsync(DELAY);

    expect(readText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(""); // verified clear fired
  });

  it("does NOT clear when the clipboard was overwritten with unrelated content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("something the user copied later");
    stubClipboard({ writeText, readText } as unknown as Clipboard);

    const { result } = renderHook(() => useClipboardAutoClear(DELAY));
    await result.current.copy("secret");

    await vi.advanceTimersByTimeAsync(DELAY);

    expect(readText).toHaveBeenCalledTimes(1);
    // writeText was called once (the initial copy) — never with "".
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalledWith("");
  });

  it("reports copied-no-autoclear when readText is unavailable, and never blind-clears", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText } as unknown as Clipboard); // no readText

    const { result } = renderHook(() => useClipboardAutoClear(DELAY));
    const outcome = await result.current.copy("secret");

    expect(outcome).toBe("copied-no-autoclear");

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(writeText).toHaveBeenCalledTimes(1); // no scheduled clear
    expect(writeText).not.toHaveBeenCalledWith("");
  });

  it("does not crash or clear when readText rejects at fire-time (permission denied / unfocused)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockRejectedValue(new Error("read denied"));
    stubClipboard({ writeText, readText } as unknown as Clipboard);

    const { result } = renderHook(() => useClipboardAutoClear(DELAY));
    await result.current.copy("secret");

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(writeText).not.toHaveBeenCalledWith("");
  });

  it("returns 'failed' when writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    stubClipboard({ writeText, readText: vi.fn() } as unknown as Clipboard);

    const { result } = renderHook(() => useClipboardAutoClear(DELAY));
    expect(await result.current.copy("secret")).toBe("failed");
  });

  it("clears the pending timer on unmount (no clear fires after teardown)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("secret");
    stubClipboard({ writeText, readText } as unknown as Clipboard);

    const { result, unmount } = renderHook(() => useClipboardAutoClear(DELAY));
    await result.current.copy("secret");
    unmount();

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(readText).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalledWith("");
  });
});
