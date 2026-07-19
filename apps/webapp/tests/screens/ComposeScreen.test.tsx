import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import {
  __resetContactsForTests,
  addContact,
  getContact,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";
import { __resetPendingRecipientForTests } from "@/src/create/compose-handoff";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { useIdentity } from "@/src/identity/use-identity";
import { ComposeScreen } from "@/src/screens/ComposeScreen";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/new",
}));

async function contactKey(): Promise<PublicKeyString> {
  return exportPublicKey(await generateIdentity());
}

interface Captured {
  url: string;
  body: string;
}

function stubFetch(): Captured[] {
  const captured: Captured[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const body = String((init as RequestInit).body);
    captured.push({ url: String(url), body });
    const posted = JSON.parse(body) as { id: string };
    return new Response(
      JSON.stringify({
        id: posted.id,
        url: `https://aesmsg.com/l/${posted.id}`,
        revocationToken: "t",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });
  return captured;
}

describe("<ComposeScreen />", () => {
  beforeEach(async () => {
    replace.mockClear();
    push.mockClear();
    await __deleteDbForTests();
    await __resetContactsForTests();
    __resetPendingRecipientForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps submit disabled until a valid recipient key is entered", async () => {
    render(<ComposeScreen />);
    expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/recipient public key/i), {
      target: { value: "not-a-key" },
    });
    await waitFor(() =>
      expect(screen.getByText(/doesn't look like an aesmsg public key/i)).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeDisabled();
  });

  it("shows the derived AM- fingerprint for a valid pasted key", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const fp = await fingerprint(pk);
    render(<ComposeScreen />);

    fireEvent.change(screen.getByLabelText(/recipient public key/i), { target: { value: pk } });
    expect(await screen.findByText(fp)).toBeVisible();
    expect(screen.getByText(/valid key/i)).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeEnabled(),
    );
  });

  it("shows an inline error for a custom expiry in the past", async () => {
    render(<ComposeScreen />);
    fireEvent.click(screen.getByRole("button", { name: /^custom…$/i }));
    fireEvent.change(screen.getByLabelText(/custom expiry date and time/i), {
      target: { value: "2020-01-01T00:00" },
    });
    expect(screen.getByText(/in the past/i)).toBeVisible();
  });

  it("seals with no plaintext in the request body and transitions to the link-created view", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const captured = stubFetch();
    render(<ComposeScreen />);

    fireEvent.change(screen.getByLabelText(/recipient public key/i), { target: { value: pk } });
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "TOP-SECRET-COMPOSE-MARKER" },
    });
    fireEvent.click(screen.getByRole("button", { name: /3 views/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: /encrypt & create link/i }));

    expect(await screen.findByRole("heading", { name: /link created/i })).toBeVisible();
    expect(screen.getByText(/https:\/\/aesmsg\.com\/l\//)).toBeVisible();

    expect(captured).toHaveLength(1);
    const request = captured[0];
    if (!request) throw new Error("no request captured");
    expect(request.url).toContain("/api/messages");
    expect(request.body).not.toContain("TOP-SECRET-COMPOSE-MARKER");
    const posted = JSON.parse(request.body) as { maxOpens: number };
    expect(posted.maxOpens).toBe(3);
  });

  it("contains no forbidden marketing copy", () => {
    const { container } = render(<ComposeScreen />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/unbreakable|military-grade|impossible to hack/i);
  });

  it("seals to a verified saved contact's public key (same seam as a pasted key)", async () => {
    const pk = await contactKey();
    const fp = await fingerprint(pk);
    const c = await addContact({ label: "Verified Val", publicKey: pk });
    await setContactVerified(c.id, true);
    const captured = stubFetch();
    render(<ComposeScreen />);

    fireEvent.click(screen.getByRole("tab", { name: /saved contacts/i }));
    fireEvent.click(await screen.findByText("Verified Val"));
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "SEAL-TO-CONTACT" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /encrypt & create link/i }));

    // The link-created view shows the recipient fingerprint derived from THAT contact's key.
    expect(await screen.findByRole("heading", { name: /link created/i })).toBeVisible();
    expect(screen.getByText(fp)).toBeVisible();
    expect(captured).toHaveLength(1);
    expect(captured[0]?.body).not.toContain("SEAL-TO-CONTACT");
  });

  it("BLOCKS a key-changed contact: no seal without an explicit acknowledgment", async () => {
    const changed = await addContact({ label: "Changed Cho", publicKey: await contactKey() });
    await updateContactKey(changed.id, await contactKey()); // derived status → "changed"
    const captured = stubFetch();
    render(<ComposeScreen />);

    fireEvent.click(screen.getByRole("tab", { name: /saved contacts/i }));
    fireEvent.click(await screen.findByText("Changed Cho"));

    // The amber gate appears and the submit is blocked — createAndSeal (the only thing that POSTs)
    // has NOT run.
    const gate = await screen.findByRole("alertdialog", { name: /contact key changed/i });
    expect(gate.className).toContain("border-warning");
    expect(gate.className).not.toContain("bg-error");
    expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeDisabled();
    expect(captured).toHaveLength(0);

    // Only an explicit "Send anyway (unsafe)" adopts the recipient; a subsequent submit then seals.
    fireEvent.click(screen.getByRole("button", { name: /send anyway \(unsafe\)/i }));
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "OVERRIDE-MARKER" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /encrypt & create link/i }));

    expect(await screen.findByRole("heading", { name: /link created/i })).toBeVisible();
    expect(captured).toHaveLength(1);
    expect(captured[0]?.body).not.toContain("OVERRIDE-MARKER");
  });

  it("routes a key-changed contact to verification WITHOUT mutating the stored contact record", async () => {
    const changed = await addContact({ label: "Changed Cho", publicKey: await contactKey() });
    await updateContactKey(changed.id, await contactKey());
    const before = await getContact(changed.id);
    const captured = stubFetch();
    render(<ComposeScreen />);

    fireEvent.click(screen.getByRole("tab", { name: /saved contacts/i }));
    fireEvent.click(await screen.findByText("Changed Cho"));
    fireEvent.click(await screen.findByRole("button", { name: /verify fingerprint/i }));

    expect(push).toHaveBeenCalledWith(`/contacts/detail?id=${encodeURIComponent(changed.id)}`);
    expect(captured).toHaveLength(0);
    // The compose gate's Verify route commits nothing — the stored contact is byte-identical.
    expect(await getContact(changed.id)).toEqual(before);
  });

  it("recovers from a stranded key-changed gate by switching to the Paste tab (seals to the PASTED key)", async () => {
    const changed = await addContact({ label: "Changed Cho", publicKey: await contactKey() });
    await updateContactKey(changed.id, await contactKey()); // derived status → "changed"
    const pastedPk = await contactKey();
    const pastedFp = await fingerprint(pastedPk);
    const captured = stubFetch();
    render(<ComposeScreen />);

    fireEvent.click(screen.getByRole("tab", { name: /saved contacts/i }));
    fireEvent.click(await screen.findByText("Changed Cho"));

    // In contact mode the gate strands submit (no visible control in the Paste tab otherwise).
    await screen.findByRole("alertdialog", { name: /contact key changed/i });
    expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeDisabled();

    // Switching to the Paste tab clears the stranded gate; a valid pasted key re-enables submit.
    fireEvent.click(screen.getByRole("tab", { name: /paste key/i }));
    fireEvent.change(screen.getByLabelText(/recipient public key/i), {
      target: { value: pastedPk },
    });
    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "PASTE-RECOVERY" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /encrypt & create link/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /encrypt & create link/i }));

    // Sealed to the PASTED key's fingerprint, not the changed contact's.
    expect(await screen.findByRole("heading", { name: /link created/i })).toBeVisible();
    expect(screen.getByText(pastedFp)).toBeVisible();
    expect(captured).toHaveLength(1);
    expect(captured[0]?.body).not.toContain("PASTE-RECOVERY");
  });
});

let gateCtx: IdentityContextValue;
function GateProbe() {
  gateCtx = useIdentity();
  return null;
}

describe("<RequireUnlocked />", () => {
  beforeEach(async () => {
    replace.mockClear();
    await __deleteDbForTests();
  });

  it("redirects to /onboarding when there is no identity", async () => {
    render(
      <IdentityProvider>
        <RequireUnlocked>
          <div>gated content</div>
        </RequireUnlocked>
      </IdentityProvider>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
    expect(screen.queryByText("gated content")).not.toBeInTheDocument();
  });

  it("renders children once the identity is unlocked", async () => {
    render(
      <IdentityProvider>
        <GateProbe />
        <RequireUnlocked>
          <div>gated content</div>
        </RequireUnlocked>
      </IdentityProvider>,
    );
    await waitFor(() => expect(gateCtx.state).toBe("no_identity"));
    await act(async () => {
      await gateCtx.setupNew("correct horse battery staple");
    });
    expect(await screen.findByText("gated content")).toBeVisible();
  });
});
