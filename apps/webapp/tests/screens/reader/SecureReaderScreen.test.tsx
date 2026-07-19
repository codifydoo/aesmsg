import type { PayloadAttachment } from "@aesmsg/crypto";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecureReaderScreen } from "@/src/screens/reader/SecureReaderScreen";

const TEXT = "SP3-SECRET-PLAINTEXT";
const FORBIDDEN = /military-grade|unbreakable|impossible to hack/i;

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

function attachment(filename: string): PayloadAttachment {
  return { filename, mimetype: "text/plain", bytes: new Uint8Array([1, 2, 3]) };
}

describe("<SecureReaderScreen />", () => {
  beforeEach(() => setVisibility("visible"));
  afterEach(() => {
    setVisibility("visible");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the plaintext as body text (NOT font-mono) and leaks nothing to URL/title", () => {
    render(<SecureReaderScreen text={TEXT} attachments={[]} onDone={vi.fn()} />);
    const el = screen.getByText(TEXT);
    expect(el).toBeInTheDocument();
    expect(el).not.toHaveClass("font-mono");
    expect(window.location.href).not.toContain(TEXT);
    expect(document.title).not.toContain(TEXT);
    expect(document.body.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("copies the exact plaintext and VERIFIED-clears after the delay", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue(TEXT);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText, readText },
      configurable: true,
    });

    render(<SecureReaderScreen text={TEXT} attachments={[]} onDone={vi.fn()} />);
    const copyBtn = screen.getByRole("button", { name: /copy/i });

    await act(async () => {
      fireEvent.click(copyBtn);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(screen.getByRole("button", { name: /clears in 45s/i })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(readText).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(""); // verified clear (read-back matched)
  });

  it("obscures the plaintext behind an opaque cover while the tab is hidden", () => {
    render(<SecureReaderScreen text={TEXT} attachments={[]} onDone={vi.fn()} />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    expect(screen.getByTestId("privacy-cover")).toBeInTheDocument();

    act(() => {
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });

  it("shows a calm attachments notice with the count, keeps the text, and never offers a download", () => {
    render(<SecureReaderScreen text="hi" attachments={[attachment("a.txt")]} onDone={vi.fn()} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText(/1 attachment/i)).toBeInTheDocument();
    expect(screen.getByText(/isn't supported yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download|save/i })).not.toBeInTheDocument();
  });

  it("pluralizes the attachment count and does not crash on multiple attachments", () => {
    render(
      <SecureReaderScreen
        text="hi"
        attachments={[attachment("a.txt"), attachment("b.txt")]}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 attachments/i)).toBeInTheDocument();
  });

  it("invokes onDone when Close and wipe is tapped", () => {
    const onDone = vi.fn();
    render(<SecureReaderScreen text={TEXT} attachments={[]} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /close and wipe/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
