import { exportPublicKey, generateIdentity, wrapPrivateKey } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { saveIdentity } from "@/src/identity/identity-store";
import { useIdentity } from "@/src/identity/use-identity";
import { UnlockScreen } from "@/src/screens/UnlockScreen";

const PASSPHRASE = "correct horse battery staple";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

let ctx: IdentityContextValue;
function Probe() {
  ctx = useIdentity();
  return <div data-testid="state">{ctx.state}</div>;
}

/** Seed a stored (locked) identity directly, wrapped under DEFAULT_WRAP_KDF_PARAMS (m=64 MiB). */
async function seedIdentity() {
  const id = await generateIdentity();
  const wrapped = await wrapPrivateKey(id, PASSPHRASE);
  await saveIdentity({
    id: "primary",
    publicKeyString: exportPublicKey(id),
    wrapped,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  });
}

function renderScreen() {
  return render(
    <IdentityProvider>
      <UnlockScreen />
      <Probe />
    </IdentityProvider>,
  );
}

describe("<UnlockScreen />", () => {
  beforeEach(async () => {
    replace.mockClear();
    await __deleteDbForTests();
  });

  it("shows an opaque error and stays locked on a wrong passphrase", async () => {
    await seedIdentity();
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("locked"));

    fireEvent.change(screen.getByLabelText(/passphrase/i), { target: { value: "wrong-guess" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() =>
      expect(screen.getByText(/that passphrase didn't work/i)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("state")).toHaveTextContent("locked");
  });

  it("unlocks with the correct passphrase and routes to the identity screen", async () => {
    await seedIdentity();
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("locked"));

    fireEvent.change(screen.getByLabelText(/passphrase/i), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("unlocked"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/identity"));
  });

  it("wipe-and-start-over confirms then wipes the identity", async () => {
    await seedIdentity();
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("locked"));

    fireEvent.click(screen.getByRole("button", { name: /wipe and start over/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("WIPE"), { target: { value: "WIPE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /wipe private key/i }));

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("no_identity"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  // Latency smoke (spec §11 risk): the default KDF (Argon2id, m=64 MiB) must not be accidentally
  // punishing on the web path. Time a real end-to-end unlock in Chromium against a generous
  // ceiling — a regression guard, not a device benchmark. True low-end-device latency must be
  // spot-checked manually and is documented, not asserted, in CI.
  it("unlocks within a generous latency ceiling (Argon2id m=64 MiB smoke)", async () => {
    await seedIdentity();
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("locked"));

    const started = performance.now();
    await act(async () => {
      await ctx.unlock(PASSPHRASE);
    });
    const elapsedMs = performance.now() - started;

    expect(ctx.state).toBe("unlocked");
    console.info(`[unlock-latency] Argon2id unlock resolved in ${elapsedMs.toFixed(0)} ms`);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
