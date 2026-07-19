import { exportPublicKey, generateIdentity, type WrappedKey } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { loadIdentity } from "@/src/identity/identity-store";
import { useIdentity } from "@/src/identity/use-identity";
import { buildBackup } from "@/src/keys/export-backup";
import { ImportBackupScreen } from "@/src/screens/ImportBackupScreen";

const PASSPHRASE = "correct horse battery staple";
const WRONG = "not the passphrase at all";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

let ctx: IdentityContextValue;
function Capture() {
  ctx = useIdentity();
  return <div data-testid="state">{ctx.state}</div>;
}

const onBack = vi.fn();
function renderScreen() {
  return render(
    <IdentityProvider>
      <Capture />
      <ImportBackupScreen onBack={onBack} />
    </IdentityProvider>,
  );
}

/** A .aesmsg File whose body is the WrappedKey envelope for a fresh identity + that identity's pk. */
async function makeBackupFile(passphrase: string): Promise<{ file: File; pk: string }> {
  const id = await generateIdentity();
  const backup = await buildBackup(id, passphrase);
  const file = new File([backup.contents], "aesmsg-identity-backup.aesmsg", {
    type: "application/octet-stream",
  });
  return { file, pk: exportPublicKey(id) };
}

function pickFile(file: File) {
  const input = screen.getByLabelText(/choose a backup file/i);
  fireEvent.change(input, { target: { files: [file] } });
}

describe("<ImportBackupScreen />", () => {
  let fetchSpy: MockInstance;

  beforeEach(async () => {
    await __deleteDbForTests();
    replace.mockClear();
    onBack.mockClear();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => vi.restoreAllMocks());

  async function renderAtNoIdentity() {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("no_identity"));
  }

  it("full round-trip: a valid backup restores → lands unlocked → routes to /identity (zero network)", async () => {
    await renderAtNoIdentity();
    const { file, pk } = await makeBackupFile(PASSPHRASE);

    pickFile(file);
    // The selected-file chip shows the filename.
    expect(screen.getByText("aesmsg-identity-backup.aesmsg")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/backup passphrase/i), {
      target: { value: PASSPHRASE },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore identity/i }));

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("unlocked"), {
      timeout: 5000,
    });
    expect(replace).toHaveBeenCalledWith("/identity");
    // The adopted identity is the backup's identity, persisted as its wrapped envelope.
    expect(ctx.publicKeyString).toBe(pk);
    expect((await loadIdentity("primary"))?.publicKeyString).toBe(pk);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("wrong passphrase → calm terminal copy, no recovery affordance, identity NOT created", async () => {
    await renderAtNoIdentity();
    const { file } = await makeBackupFile(PASSPHRASE);

    pickFile(file);
    fireEvent.change(screen.getByLabelText(/backup passphrase/i), { target: { value: WRONG } });
    fireEvent.click(screen.getByRole("button", { name: /restore identity/i }));

    await waitFor(() =>
      expect(screen.getByText(/no backup data is recoverable without it/i)).toBeInTheDocument(),
    );
    // No "forgot passphrase" recovery affordance / attempt-counter.
    expect(screen.queryByText(/forgot your passphrase|forgot passphrase|attempt \d/i)).toBeNull();
    expect(ctx.state).toBe("no_identity");
    expect(await loadIdentity("primary")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("invalid file → calm 'not a valid backup file' copy", async () => {
    await renderAtNoIdentity();
    const file = new File(["{not a valid envelope"], "junk.aesmsg", {
      type: "application/octet-stream",
    });

    pickFile(file);
    fireEvent.change(screen.getByLabelText(/backup passphrase/i), {
      target: { value: PASSPHRASE },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore identity/i }));

    await waitFor(() =>
      expect(screen.getByText(/this isn't a valid backup file/i)).toBeInTheDocument(),
    );
    expect(ctx.state).toBe("no_identity");
  });

  it("importIdentity guard: cannot import when an identity already exists (unlocked)", async () => {
    await renderAtNoIdentity();
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    expect(ctx.state).toBe("unlocked");

    const other = await generateIdentity();
    const envelope = (await buildBackup(other, PASSPHRASE)).contents as WrappedKey;
    let thrown: unknown;
    await act(async () => {
      thrown = await ctx.importIdentity(envelope, other).catch((e) => e);
    });
    expect((thrown as Error).message).toMatch(/cannot import/i);
  });
});
