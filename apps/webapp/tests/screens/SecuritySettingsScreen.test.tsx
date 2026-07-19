import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { useIdentity } from "@/src/identity/use-identity";
import { SecuritySettingsScreen } from "@/src/screens/SecuritySettingsScreen";
import { SettingsProvider } from "@/src/settings/settings-context";
import { loadSettings } from "@/src/settings/settings-store";

const PASSPHRASE = "correct horse battery staple";
const FORBIDDEN = /military-grade|unbreakable|impossible to hack/i;

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
}));

let ctx: IdentityContextValue;
function Capture() {
  ctx = useIdentity();
  return <div data-testid="state">{ctx.state}</div>;
}

function renderScreen() {
  return render(
    <SettingsProvider>
      <IdentityProvider>
        <Capture />
        <SecuritySettingsScreen />
      </IdentityProvider>
    </SettingsProvider>,
  );
}

function stubStorage(persisted: boolean, persist = true) {
  Object.defineProperty(navigator, "storage", {
    value: {
      persisted: async () => persisted,
      persist: async () => persist,
    },
    configurable: true,
  });
}

describe("<SecuritySettingsScreen />", () => {
  beforeEach(async () => {
    replace.mockClear();
    await __deleteDbForTests();
    stubStorage(false);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await __deleteDbForTests();
  });

  it("persists the app-lock timeout change", async () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/auto-lock timeout/i), { target: { value: "5m" } });
    await waitFor(async () => expect((await loadSettings()).appLockTimeout).toBe("5m"));
  });

  it("persists the clipboard auto-clear duration and reflects it in the label", async () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/clipboard auto-clear duration/i), {
      target: { value: "20" },
    });
    expect(await screen.findByText("20s")).toBeVisible();
    await waitFor(async () => expect((await loadSettings()).clipboardClearSeconds).toBe(20));
  });

  it("renders the HONEST web-tier disclosure: native guarantees + link + the screenshot gap", () => {
    const { container } = renderScreen();
    expect(screen.getByText(/signed builds/i)).toBeInTheDocument();
    expect(screen.getByText(/biometric gate/i)).toBeInTheDocument();
    expect(
      screen.getByText(/screenshot blocking is not possible in a browser/i),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /get the native app/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("aesmsg.com"));

    // Never claim web ≡ native, and never the forbidden marketing language.
    const text = container.textContent ?? "";
    expect(text).not.toContain("≡");
    expect(text).not.toMatch(/identical to the native app/i);
    expect(text).not.toMatch(FORBIDDEN);
  });

  it("does not carry server-account deletion copy (there is no account)", () => {
    const { container } = renderScreen();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/delete account/i);
    expect(text).not.toMatch(/server-side identity|erase identity from .* servers/i);
  });

  it("'Lock now' locks the identity", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("unlocked"));

    fireEvent.click(screen.getByRole("button", { name: /lock now/i }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("locked"));
  });

  it("storage persistence: shows the green persisted state", async () => {
    stubStorage(true);
    renderScreen();
    expect(
      await screen.findByText(/your keys are stored persistently on this device/i),
    ).toBeInTheDocument();
  });

  it("storage persistence: offers a request action, then confirms persistence", async () => {
    stubStorage(false, true);
    renderScreen();
    const btn = await screen.findByRole("button", { name: /request persistent storage/i });
    fireEvent.click(btn);
    expect(
      await screen.findByText(/your keys are stored persistently on this device/i),
    ).toBeInTheDocument();
  });

  it("opens the red wipe confirm dialog from the Danger Zone", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });

    fireEvent.click(screen.getByRole("button", { name: /^wipe private key$/i }));
    const dialog = await screen.findByRole("dialog");
    // The red confirm dialog gates on typing the WIPE word; its inner panel carries the error border.
    expect(within(dialog).getByText(/type wipe to confirm/i)).toBeInTheDocument();
    expect(dialog.querySelector(".border-error\\/30")).not.toBeNull();
  });
});
