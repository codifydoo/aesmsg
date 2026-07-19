import type { PayloadAttachment } from "@aesmsg/crypto";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { SecureReaderScreen } from "@/src/screens/reader/SecureReaderScreen";
import { SettingsProvider } from "@/src/settings/settings-context";
import { SETTINGS_DEFAULTS } from "@/src/settings/settings-format";
import { saveSettings } from "@/src/settings/settings-store";

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

  it("copies the exact plaintext and VERIFIED-clears after the default delay", async () => {
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
    // No SettingsProvider → the tolerant default (45s).
    expect(screen.getByRole("button", { name: /clears in 45s/i })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(readText).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(""); // verified clear (read-back matched)
  });

  it("reflects a non-default clipboard-clear duration from settings", async () => {
    await __deleteDbForTests();
    await saveSettings({ ...SETTINGS_DEFAULTS, clipboardClearSeconds: 20 });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue(TEXT);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText, readText },
      configurable: true,
    });

    render(
      <SettingsProvider>
        <SecureReaderScreen text={TEXT} attachments={[]} onDone={vi.fn()} />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    // The label recomputes from the loaded settings — retries until the async load propagates 20s.
    expect(await screen.findByRole("button", { name: /clears in 20s/i })).toBeInTheDocument();
    await __deleteDbForTests();
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

  it("renders a real per-attachment download control (not the old 'not supported' notice)", () => {
    render(<SecureReaderScreen text="hi" attachments={[attachment("a.txt")]} onDone={vi.fn()} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText(/1 attachment/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(screen.queryByText(/isn't supported yet/i)).not.toBeInTheDocument();
  });

  it("downloads an attachment via a Blob object URL and NEVER calls fetch", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<SecureReaderScreen text="" attachments={[attachment("a.txt")]} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("revokes every tracked object URL on close (no decrypted bytes linger)", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const onDone = vi.fn();

    render(<SecureReaderScreen text="hi" attachments={[attachment("a.txt")]} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    fireEvent.click(screen.getByRole("button", { name: /close and wipe/i }));

    expect(revoke).toHaveBeenCalledWith("blob:mock");
    expect(onDone).toHaveBeenCalledTimes(1);
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
    expect(screen.getAllByRole("button", { name: /download/i })).toHaveLength(2);
  });

  it("invokes onDone when Close and wipe is tapped", () => {
    const onDone = vi.fn();
    render(<SecureReaderScreen text={TEXT} attachments={[]} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /close and wipe/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
