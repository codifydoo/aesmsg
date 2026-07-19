import { exportPublicKey, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { useIdentity } from "@/src/identity/use-identity";
import { ComposeScreen } from "@/src/screens/ComposeScreen";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/new",
}));

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
    await __deleteDbForTests();
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
