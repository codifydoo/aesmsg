import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { useIdentity } from "@/src/identity/use-identity";
import { ExportBackupScreen } from "@/src/screens/ExportBackupScreen";

const PASSPHRASE = "correct horse battery staple";
const WRONG = "not the passphrase at all";

let ctx: IdentityContextValue;
function Capture() {
  ctx = useIdentity();
  return <div data-testid="state">{ctx.state}</div>;
}

const onDone = vi.fn();
function renderScreen() {
  return render(
    <IdentityProvider>
      <Capture />
      <ExportBackupScreen onDone={onDone} />
    </IdentityProvider>,
  );
}

describe("<ExportBackupScreen />", () => {
  let create: MockInstance;
  let fetchSpy: MockInstance;

  beforeEach(async () => {
    await __deleteDbForTests();
    onDone.mockClear();
    create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => vi.restoreAllMocks());

  async function setupUnlocked() {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    // Type the passphrase → the Export button enables (empty passphrase disables it).
    fireEvent.change(screen.getByLabelText(/confirm your passphrase/i), {
      target: { value: PASSPHRASE },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /export backup/i })).not.toBeDisabled(),
    );
  }

  it("blocks export on a wrong passphrase — no file is produced", async () => {
    await setupUnlocked();

    fireEvent.change(screen.getByLabelText(/confirm your passphrase/i), {
      target: { value: WRONG },
    });
    fireEvent.click(screen.getByRole("button", { name: /export backup/i }));

    await waitFor(() =>
      expect(screen.getByText(/that passphrase didn't match/i)).toBeInTheDocument(),
    );
    expect(create).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("downloads the encrypted backup after verifying the passphrase — zero network", async () => {
    await setupUnlocked();

    fireEvent.change(screen.getByLabelText(/confirm your passphrase/i), {
      target: { value: PASSPHRASE },
    });
    fireEvent.click(screen.getByRole("button", { name: /export backup/i }));

    await waitFor(() => expect(screen.getByText(/encrypted backup ready/i)).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
