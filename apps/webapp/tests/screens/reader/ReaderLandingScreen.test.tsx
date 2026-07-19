import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderLandingScreen } from "@/src/screens/reader/ReaderLandingScreen";

const ID = "abcdefghijkl0123";
const FORBIDDEN = /military-grade|unbreakable|impossible to hack/i;

describe("<ReaderLandingScreen />", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the link id in a font-mono element and an Open message button", () => {
    render(<ReaderLandingScreen id={ID} onOpen={vi.fn()} />);
    const idEl = screen.getByText(ID);
    expect(idEl).toHaveClass("font-mono");
    expect(screen.getByRole("button", { name: /open message/i })).toBeInTheDocument();
  });

  it("performs ZERO network on mount (link-preview safety)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ReaderLandingScreen id={ID} onOpen={vi.fn()} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls onOpen exactly once on the first tap (double-tap guarded)", () => {
    const onOpen = vi.fn();
    render(<ReaderLandingScreen id={ID} onOpen={onOpen} />);
    const button = screen.getByRole("button", { name: /open message/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows the static view-once caution and no forbidden marketing copy", () => {
    render(<ReaderLandingScreen id={ID} onOpen={vi.fn()} />);
    expect(screen.getByText(/opened only once/i)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(FORBIDDEN);
  });
});
