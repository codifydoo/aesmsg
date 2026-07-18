import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { IdentityProvider } from "@/src/identity/identity-context";
import { hasIdentity } from "@/src/identity/identity-store";
import { useIdentity } from "@/src/identity/use-identity";
import { SetPassphraseScreen } from "@/src/screens/SetPassphraseScreen";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const STRONG = "Tr0ub4dour&3xplorer-Vault";

function StateProbe() {
  const { state } = useIdentity();
  return <div data-testid="state">{state}</div>;
}

function renderScreen() {
  return render(
    <IdentityProvider>
      <SetPassphraseScreen />
      <StateProbe />
    </IdentityProvider>,
  );
}

describe("<SetPassphraseScreen />", () => {
  beforeEach(async () => {
    replace.mockClear();
    await __deleteDbForTests();
  });

  it("renders both fields and the no-recovery info card", () => {
    renderScreen();
    expect(screen.getByLabelText(/^passphrase$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm passphrase/i)).toBeInTheDocument();
    expect(screen.getByText(/no recovery by design/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be recovered/i)).toBeInTheDocument();
  });

  it("keeps submit disabled and shows guidance for a below-minimum passphrase", () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/^passphrase$/i), { target: { value: "short1" } });
    expect(screen.getByRole("button", { name: /create identity/i })).toBeDisabled();
    expect(screen.getByText(/more character/i)).toBeInTheDocument();
  });

  it("shows a mismatch error when confirm differs", () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/^passphrase$/i), { target: { value: STRONG } });
    const confirm = screen.getByLabelText(/confirm passphrase/i);
    fireEvent.change(confirm, { target: { value: `${STRONG}x` } });
    fireEvent.blur(confirm);
    expect(screen.getByText(/don't match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create identity/i })).toBeDisabled();
  });

  it("enables submit for a strong matching passphrase and creates the identity on click", async () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/^passphrase$/i), { target: { value: STRONG } });
    fireEvent.change(screen.getByLabelText(/confirm passphrase/i), { target: { value: STRONG } });

    const submit = screen.getByRole("button", { name: /create identity/i });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("unlocked"));
    expect(await hasIdentity("primary")).toBe(true);
    expect(replace).toHaveBeenCalledWith("/identity");
  });
});
