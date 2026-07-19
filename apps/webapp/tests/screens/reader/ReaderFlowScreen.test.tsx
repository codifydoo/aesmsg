import {
  encodePayload,
  exportPublicKey,
  generateIdentity,
  type IdentityKeypair,
  importPublicKey,
  type MessageBindingContext,
  type PublicKeyString,
  seal,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { saveIdentity } from "@/src/identity/identity-store";
import { useIdentity } from "@/src/identity/use-identity";
import { bytesToBase64 } from "@/src/lib/base64";
import { DECRYPTION_FAILED_COPY, LINK_UNAVAILABLE_COPY } from "@/src/reader/copy";
import { ReaderFlowScreen } from "@/src/screens/reader/ReaderFlowScreen";

const ID = "abcdefghijkl0123";
const PASSPHRASE = "correct horse battery staple";

// The dev `?id=` fallback is how these browser-mode tests inject the link id: the harness URL never
// matches `/l/<id>`, so the flow falls through to useSearchParams (mocked below).
let currentSearch = `id=${ID}`;
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/l",
}));

let ctx: IdentityContextValue;
function Probe() {
  ctx = useIdentity();
  return null;
}

function renderReader() {
  return render(
    <IdentityProvider>
      <Suspense>
        <ReaderFlowScreen />
      </Suspense>
      <Probe />
    </IdentityProvider>,
  );
}

/** Build the OpenMessageResponse body for a v2 message sealed to `pk`, and stub fetch to return it. */
async function mockOpenReturns(pk: PublicKeyString, text: string) {
  const expiresAtMs = Date.now() + 60 * 60 * 1000;
  const context: MessageBindingContext = {
    linkId: ID,
    recipientPublicKey: pk,
    expiresAtMs,
    maxOpens: 1,
  };
  const sealed = await seal(
    encodePayload({ text, attachments: [] }),
    await importPublicKey(pk),
    context,
  );
  const body = {
    ciphertext: bytesToBase64(sealed as unknown as Uint8Array),
    createdAt: null,
    expiresAt: new Date(expiresAtMs).toISOString(),
    opensCount: 1,
    maxOpens: 1,
    status: "active" as const,
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

/** Seed a stored (locked) identity and return its keypair so the test can seal to its public key. */
async function seedLockedIdentity(): Promise<IdentityKeypair> {
  const rid = await generateIdentity();
  const wrapped = await wrapPrivateKey(rid, PASSPHRASE);
  await saveIdentity({
    id: "primary",
    publicKeyString: exportPublicKey(rid),
    wrapped,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  });
  return rid;
}

async function waitForLanding() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /open message/i })).toBeInTheDocument(),
  );
}

describe("<ReaderFlowScreen />", () => {
  beforeEach(async () => {
    currentSearch = `id=${ID}`;
    await __deleteDbForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ZERO NETWORK before user action — mount + landing fire no fetch/XHR/beacon/Image/EventSource (§10)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    const xhrSend = vi.spyOn(XMLHttpRequest.prototype, "send");
    const beacon = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const imageCtor = vi.fn();
    const eventSourceCtor = vi.fn();
    vi.stubGlobal("Image", imageCtor);
    vi.stubGlobal("EventSource", eventSourceCtor);

    renderReader();
    await waitForLanding();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(xhrSend).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(imageCtor).not.toHaveBeenCalled();
    expect(eventSourceCtor).not.toHaveBeenCalled();
  });

  it("unlocked: a single tap issues EXACTLY ONE POST /open (no metadata GET) and renders the plaintext", async () => {
    renderReader();
    await waitFor(() => expect(ctx.state).toBe("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    const pk = ctx.publicKeyString as PublicKeyString;
    const fetchSpy = await mockOpenReturns(pk, "SP3-FLOW-SECRET");

    await waitForLanding();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /open message/i }));

    await waitFor(() => expect(screen.getByText("SP3-FLOW-SECRET")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain(`/api/messages/${ID}/open`);
    expect((init as RequestInit | undefined)?.method).toBe("POST");
    // No metadata GET: the ONLY call was the POST /open above.
    expect(screen.getByText(/decrypted on this device/i)).toBeInTheDocument();
  });

  it("locked: tap shows inline unlock WITHOUT a POST, then auto-continues to decrypt after unlock", async () => {
    const rid = await seedLockedIdentity();
    renderReader();
    await waitFor(() => expect(ctx.state).toBe("locked"));
    const fetchSpy = await mockOpenReturns(exportPublicKey(rid), "AFTER-UNLOCK");

    await waitForLanding();
    fireEvent.click(screen.getByRole("button", { name: /open message/i }));

    // Inline unlock is shown and NO open was consumed yet (D3 — never burn a view before unlock).
    await waitFor(() => expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/passphrase/i), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => expect(screen.getByText("AFTER-UNLOCK")).toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("no_identity: tap explains the missing identity and NEVER POSTs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderReader();
    await waitFor(() => expect(ctx.state).toBe("no_identity"));

    await waitForLanding();
    fireEvent.click(screen.getByRole("button", { name: /open message/i }));

    await waitFor(() =>
      expect(screen.getByText(/no identity on this browser/i)).toBeInTheDocument(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("410 → LinkUnavailable showing EXACTLY the opaque copy and no server-derived detail", async () => {
    renderReader();
    await waitFor(() => expect(ctx.state).toBe("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "gone" }), {
        status: 410,
        headers: { "content-type": "application/json" },
      }),
    );

    await waitForLanding();
    fireEvent.click(screen.getByRole("button", { name: /open message/i }));

    await waitFor(() => expect(screen.getByText(LINK_UNAVAILABLE_COPY)).toBeInTheDocument());
    // Never reveal which of revoked/expired/exhausted — no status code, no reason word.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("410");
    expect(body).not.toMatch(/revoked|expired|exhausted/i);
  });

  it("400 → InvalidPayload", async () => {
    renderReader();
    await waitFor(() => expect(ctx.state).toBe("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "bad" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await waitForLanding();
    fireEvent.click(screen.getByRole("button", { name: /open message/i }));

    await waitFor(() =>
      expect(screen.getByText(/doesn't look like a valid secure message/i)).toBeInTheDocument(),
    );
  });

  it("network error → NetworkError with a working Retry that re-issues the POST", async () => {
    renderReader();
    await waitFor(() => expect(ctx.state).toBe("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));

    await waitForLanding();
    fireEvent.click(screen.getByRole("button", { name: /open message/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument(),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });

  it("wrong key → DecryptionFailed with NO retry affordance", async () => {
    renderReader();
    await waitFor(() => expect(ctx.state).toBe("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    // Seal to a DIFFERENT identity so the unlocked reader key cannot decrypt it.
    const stranger = await generateIdentity();
    await mockOpenReturns(exportPublicKey(stranger), "not for you");

    await waitForLanding();
    fireEvent.click(screen.getByRole("button", { name: /open message/i }));

    await waitFor(() => expect(screen.getByText(DECRYPTION_FAILED_COPY)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /try again|retry/i })).not.toBeInTheDocument();
  });

  it("bad id in the URL → InvalidPayload with ZERO network", async () => {
    currentSearch = ""; // no id anywhere
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderReader();

    await waitFor(() =>
      expect(screen.getByText(/doesn't look like a valid secure message/i)).toBeInTheDocument(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("attachments present → the secure reader shows the calm notice and does not crash", async () => {
    renderReader();
    await waitFor(() => expect(ctx.state).toBe("no_identity"));
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    const pk = ctx.publicKeyString as PublicKeyString;
    const expiresAtMs = Date.now() + 60 * 60 * 1000;
    const sealed = await seal(
      encodePayload({
        text: "with file",
        attachments: [
          { filename: "secret.pdf", mimetype: "application/pdf", bytes: new Uint8Array([9, 9]) },
        ],
      }),
      await importPublicKey(pk),
      { linkId: ID, recipientPublicKey: pk, expiresAtMs, maxOpens: 1 },
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ciphertext: bytesToBase64(sealed as unknown as Uint8Array),
          createdAt: null,
          expiresAt: new Date(expiresAtMs).toISOString(),
          opensCount: 1,
          maxOpens: 1,
          status: "active",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await waitForLanding();
    fireEvent.click(screen.getByRole("button", { name: /open message/i }));

    await waitFor(() => expect(screen.getByText("with file")).toBeInTheDocument());
    expect(screen.getByText(/1 attachment/i)).toBeInTheDocument();
    expect(screen.getByText(/isn't supported yet/i)).toBeInTheDocument();
  });
});
