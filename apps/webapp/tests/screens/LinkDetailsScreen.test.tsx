import type { Fingerprint } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVOCATION_TOKEN_HEADER } from "@/src/api/client";
import { __deleteDbForTests } from "@/src/identity/db";
import { secureLinkUrl } from "@/src/links/link-url";
import { recordSentLink } from "@/src/links/sent-links-store";
import { LinkDetailsScreen } from "@/src/screens/LinkDetailsScreen";

const ID = "aaaaaaaaaaaaaaaa";
const FP = "AM-1111-2222-3333-4444-5555-6666-7777-8888" as Fingerprint;
// A stored url a locally-reconstructed link could NOT produce — proves the screen renders the
// record's own server-returned url, not secureLinkUrl(id) rebuilt from the webapp constant.
const STORED_URL = "https://links.acme.example/l/aaaaaaaaaaaaaaaa";

let currentId = ID;
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(`id=${currentId}`),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/links/details",
}));

const writeText = vi.fn().mockResolvedValue(undefined);
let revokeHeaders: Record<string, string> | null = null;

function stubFetch({ revokeStatus = 200 }: { revokeStatus?: number } = {}) {
  revokeHeaders = null;
  const expiresAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.includes("/revoke")) {
      revokeHeaders = (init as RequestInit).headers as Record<string, string>;
      return new Response(JSON.stringify({ id: ID, status: "revoked" }), {
        status: revokeStatus,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("/api/messages/list")) {
      return new Response(
        JSON.stringify({
          results: [{ id: ID, status: "active", expiresAt, maxOpens: 3, opensCount: 1 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch ${u}`);
  });
}

async function seed(url: string | null = STORED_URL) {
  await recordSentLink({
    id: ID,
    recipientFingerprint: FP,
    createdAt: "2026-07-18T10:00:00.000Z",
    expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    maxOpens: 3,
    label: "Prod database URL",
    revocationToken: "secret-revocation-token",
    url,
  });
}

describe("<LinkDetailsScreen />", () => {
  beforeEach(async () => {
    currentId = ID;
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await __deleteDbForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the record fields, the mono server-returned secure link, and a destructive revoke action", async () => {
    await seed();
    stubFetch();
    render(<LinkDetailsScreen />);

    await waitFor(() => expect(screen.getByText("Prod database URL")).toBeVisible());
    // Prefers the record's stored server url over the reconstructed constant.
    const linkCode = screen.getByText(STORED_URL);
    expect(linkCode).toHaveClass("font-mono");
    expect(screen.getByText(FP)).toHaveClass("font-mono");
    // Only the danger-zone trigger exists while the dialog is closed. Its accessible name includes
    // the icon ligature, so match by substring.
    const revokeButton = screen.getByRole("button", { name: /revoke link/i });
    expect(revokeButton).toHaveClass("text-error");
    expect(revokeButton).toHaveClass("border-error");
  });

  it("falls back to the reconstructed secureLinkUrl for a legacy record with no stored url", async () => {
    await seed(null);
    stubFetch();
    render(<LinkDetailsScreen />);

    await waitFor(() => expect(screen.getByText("Prod database URL")).toBeVisible());
    expect(screen.getByText(secureLinkUrl(ID))).toHaveClass("font-mono");
  });

  it("shows the calm empty copy when the link isn't tracked here", async () => {
    currentId = "zzzzzzzzzzzzzzzz"; // nothing seeded for this id
    stubFetch();
    render(<LinkDetailsScreen />);
    await waitFor(() => expect(screen.getByText(/isn't tracked on this device/i)).toBeVisible());
  });

  it("confirming revoke sends the stored token header and transitions the row to revoked", async () => {
    await seed();
    stubFetch();
    render(<LinkDetailsScreen />);
    await waitFor(() => expect(screen.getByText("Prod database URL")).toBeVisible());

    // Only the trigger exists yet; clicking it opens the confirm dialog.
    fireEvent.click(screen.getByRole("button", { name: /revoke link/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeVisible();

    // Two "revoke link" buttons now exist (trigger + confirm); click the one inside the dialog.
    fireEvent.click(within(dialog).getByRole("button", { name: /revoke link/i }));
    await waitFor(() => expect(revokeHeaders).not.toBeNull());
    expect(revokeHeaders?.[REVOCATION_TOKEN_HEADER]).toBe("secret-revocation-token");
    await waitFor(() => expect(screen.getAllByText(/^Revoked$/).length).toBeGreaterThan(0));
  });

  it("cancel closes the dialog without revoking", async () => {
    await seed();
    stubFetch();
    render(<LinkDetailsScreen />);
    await waitFor(() => expect(screen.getByText("Prod database URL")).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: /revoke link/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(revokeHeaders).toBeNull();
  });
});
