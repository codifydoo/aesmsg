import { fingerprint, type PublicKeyString } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { loadRetiredEntries } from "@/src/identity/retired-keys-store";
import { useIdentity } from "@/src/identity/use-identity";
import { decodeImageData } from "@/src/lib/qr-decode";
import { toQrMatrix } from "@/src/lib/qr-encode";
import { IdentityScreen } from "@/src/screens/IdentityScreen";
import { rasterizeMatrix } from "@/tests/helpers/rasterize";

const PASSPHRASE = "correct horse battery staple";
const WRONG = "not the passphrase at all";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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

async function setupUnlocked(): Promise<PublicKeyString> {
  renderScreen();
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("no_identity"));
  await act(async () => {
    await ctx.setupNew(PASSPHRASE);
  });
  return ctx.publicKeyString as PublicKeyString;
}

async function openRotateConfirm() {
  fireEvent.click(await screen.findByRole("button", { name: /rotate key/i }));
  await screen.findByText(/rotate your key\?/i);
}

describe("<RotateKeyScreen /> (via IdentityScreen)", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("shows the amber re-verify caution (not red) on the confirm screen", async () => {
    await setupUnlocked();
    await openRotateConfirm();

    const caution = screen.getByText(/re-verify your new fingerprint/i);
    expect(caution).toBeInTheDocument();
    // AMBER, not red: the caution container carries a warning border, never an error one.
    const container = caution.closest("div");
    expect(container?.className).toMatch(/border-warning/);
    expect(container?.className).not.toMatch(/border-error|text-error/);
    // The reassurance is emerald/success (already-received messages stay readable).
    expect(
      screen.getByText(/messages already sent to your old key can still be opened/i),
    ).toBeVisible();
  });

  it("wrong passphrase → inline error, no rotation, identity untouched", async () => {
    const oldPk = await setupUnlocked();
    await openRotateConfirm();

    fireEvent.change(screen.getByLabelText(/confirm your passphrase/i), {
      target: { value: WRONG },
    });
    fireEvent.click(screen.getByRole("button", { name: /rotate key/i }));

    await waitFor(() =>
      expect(screen.getByText(/that passphrase didn't match/i)).toBeInTheDocument(),
    );
    // Still on the confirm screen; the active key is unchanged and no retired key was created.
    expect(screen.getByText(/rotate your key\?/i)).toBeInTheDocument();
    expect(ctx.publicKeyString).toBe(oldPk);
    expect(await loadRetiredEntries()).toEqual([]);
  });

  it("correct passphrase → success screen with a NEW fingerprint + a QR that round-trips to the new key", async () => {
    const oldPk = await setupUnlocked();
    const oldFp = await fingerprint(oldPk);
    await openRotateConfirm();

    fireEvent.change(screen.getByLabelText(/confirm your passphrase/i), {
      target: { value: PASSPHRASE },
    });
    fireEvent.click(screen.getByRole("button", { name: /rotate key/i }));

    // Success screen appears with the NEW fingerprint (differs from the pre-rotation one).
    await waitFor(() => expect(screen.getByText(/key rotated/i)).toBeInTheDocument(), {
      timeout: 5000,
    });
    const newPk = ctx.publicKeyString as PublicKeyString;
    expect(newPk).not.toBe(oldPk);
    const newFp = await fingerprint(newPk);
    expect(newFp).not.toBe(oldFp);
    const fpEl = await screen.findByText(newFp);
    expect(fpEl).toHaveClass("font-mono");

    // The success QR round-trips to the new public-key string (a mobile contact could scan it).
    const svg = await waitFor(() => {
      const el = document.querySelector('svg[aria-label="Public-key QR code"]');
      if (el === null) throw new Error("QR not yet rendered");
      return el;
    });
    expect(svg).toBeInTheDocument();
    const raster = rasterizeMatrix(toQrMatrix(newPk));
    expect(decodeImageData(raster.data, raster.width, raster.height)).toBe(newPk);

    // The retired store now retains exactly the old key.
    const retired = await loadRetiredEntries();
    expect(retired.map((e) => e.publicKeyString)).toEqual([oldPk]);
  });
});
