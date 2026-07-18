import { type Fingerprint, fingerprint, type PublicKeyString } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { useIdentity } from "@/src/identity/use-identity";
import { IdentityScreen } from "@/src/screens/IdentityScreen";

const PASSPHRASE = "correct horse battery staple";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

let ctx: IdentityContextValue;
function Capture() {
  ctx = useIdentity();
  return <div data-testid="state">{ctx.state}</div>;
}

function renderScreen() {
  return render(
    <IdentityProvider>
      <Capture />
      <IdentityScreen />
    </IdentityProvider>,
  );
}

describe("<IdentityScreen />", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    replace.mockClear();
    await __deleteDbForTests();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  async function setupUnlocked(): Promise<{ fp: Fingerprint; pk: PublicKeyString }> {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    const pk = ctx.publicKeyString as PublicKeyString;
    const fp = await fingerprint(pk);
    return { fp, pk };
  }

  it("renders the real AM- fingerprint in a mono element", async () => {
    const { fp } = await setupUnlocked();
    expect(fp.startsWith("AM-")).toBe(true);

    const el = await screen.findByText(fp);
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass("font-mono");
  });

  it("copies the full fingerprint to the clipboard", async () => {
    const { fp } = await setupUnlocked();
    await screen.findByText(fp);

    fireEvent.click(screen.getByRole("button", { name: /copy public fingerprint/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(fp));
  });

  it("shows the public-key string and can copy it", async () => {
    const { pk } = await setupUnlocked();
    const el = await screen.findByText(pk);
    expect(el).toHaveClass("font-mono");

    fireEvent.click(screen.getByRole("button", { name: /copy public key/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(pk));
  });

  it("locks the identity from the Lock action", async () => {
    await setupUnlocked();
    fireEvent.click(screen.getByRole("button", { name: /lock identity/i }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("locked"));
  });

  it("wipes the identity through the danger-zone confirm", async () => {
    await setupUnlocked();

    fireEvent.click(screen.getByRole("button", { name: /^wipe private key$/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("WIPE"), { target: { value: "WIPE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /wipe private key/i }));

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("no_identity"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });
});
