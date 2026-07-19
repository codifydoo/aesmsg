import type { Fingerprint } from "@aesmsg/crypto";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkCreatedScreen } from "@/src/screens/LinkCreatedScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/new",
}));

const URL = "https://aesmsg.com/l/AbCd1234EfGh5678";
const FP = "AM-1111-2222-3333-4444-5555-6666-7777-8888" as Fingerprint;

const writeText = vi.fn().mockResolvedValue(undefined);

function renderScreen(onCreateAnother = vi.fn()) {
  return render(
    <LinkCreatedScreen
      url={URL}
      recipientFingerprint={FP}
      expiryLabel="24 hours"
      maxOpensLabel="1 view (burn on read)"
      onCreateAnother={onCreateAnother}
    />,
  );
}

describe("<LinkCreatedScreen />", () => {
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("renders the exact url in a font-mono element on the aesmsg.com host", () => {
    renderScreen();
    const code = screen.getByText(URL);
    expect(code).toBeVisible();
    expect(code).toHaveClass("font-mono");
    expect(URL).toContain("aesmsg.com/l/");
    expect(URL).not.toContain("app.aesmsg.com");
  });

  it("copies the full url to the clipboard", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /copy secure link/i }));
    expect(writeText).toHaveBeenCalledWith(URL);
  });

  it("reflects the passed expiry and max-opens summary", () => {
    renderScreen();
    expect(screen.getByText(/24 hours expiry/i)).toBeVisible();
    expect(screen.getByText(/1 view \(burn on read\)/i)).toBeVisible();
  });

  it("invokes onCreateAnother from the Create another action", () => {
    const onCreateAnother = vi.fn();
    renderScreen(onCreateAnother);
    fireEvent.click(screen.getByRole("button", { name: /create another/i }));
    expect(onCreateAnother).toHaveBeenCalledOnce();
  });

  it("contains no forbidden marketing copy", () => {
    const { container } = renderScreen();
    expect(container.textContent ?? "").not.toMatch(
      /unbreakable|military-grade|impossible to hack/i,
    );
  });
});
