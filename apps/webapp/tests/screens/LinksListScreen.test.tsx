import type { Fingerprint } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { secureLinkUrl } from "@/src/links/link-url";
import { recordSentLink } from "@/src/links/sent-links-store";
import { LinksListScreen } from "@/src/screens/LinksListScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/links",
}));

const FP = "AM-1111-2222-3333-4444-5555-6666-7777-8888" as Fingerprint;
const writeText = vi.fn().mockResolvedValue(undefined);

type ListResult =
  | { id: string; status: "gone" }
  | { id: string; status: "active"; expiresAt: string; maxOpens: number; opensCount: number };

function stubList(results: ListResult[] | "reject") {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (!String(url).includes("/api/messages/list")) throw new Error(`unexpected fetch ${url}`);
    if (results === "reject") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

async function seed(
  id: string,
  expiresAt: string,
  label: string | null,
  createdAt: string,
  // The server-returned url. Defaults to the canonical form; pass `null` to simulate a legacy record
  // written before the `url` field existed (readers then fall back to secureLinkUrl(id)).
  url: string | null = `https://aesmsg.com/l/${id}`,
) {
  await recordSentLink({
    id,
    recipientFingerprint: FP,
    createdAt,
    expiresAt,
    maxOpens: 3,
    label,
    revocationToken: `tok-${id}`,
    url,
  });
}

describe("<LinksListScreen />", () => {
  beforeEach(async () => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await __deleteDbForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders a chip per reconciled status", async () => {
    const now = Date.now();
    const soon = new Date(now + 30 * 60_000).toISOString();
    const later = new Date(now + 2 * 86_400_000).toISOString();
    const future = new Date(now + 86_400_000).toISOString();
    await seed("aaaaaaaaaaaaaaaa", later, "Active link", "2026-07-18T10:00:00.000Z");
    await seed("bbbbbbbbbbbbbbbb", soon, "Expiring link", "2026-07-18T11:00:00.000Z");
    await seed("cccccccccccccccc", future, "Revoked link", "2026-07-18T12:00:00.000Z");

    stubList([
      { id: "aaaaaaaaaaaaaaaa", status: "active", expiresAt: later, maxOpens: 3, opensCount: 0 },
      { id: "bbbbbbbbbbbbbbbb", status: "active", expiresAt: soon, maxOpens: 3, opensCount: 1 },
      { id: "cccccccccccccccc", status: "gone" },
    ]);

    render(<LinksListScreen />);

    await waitFor(() => expect(screen.getByText("Active link")).toBeVisible());
    // Scope status assertions to the table so the stat-card + filter-chip "Active"/"Revoked" labels
    // (outside the table) don't collide.
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Active$/)).toBeVisible();
    expect(table.getByText(/expiring soon/i)).toBeVisible();
    expect(table.getByText(/^Revoked$/)).toBeVisible();
  });

  it("copies the server-returned url stored on the record (preferred over the constant)", async () => {
    const now = Date.now();
    const later = new Date(now + 2 * 86_400_000).toISOString();
    // A stored url that a locally-reconstructed link could NOT produce — proves the row copies the
    // record's own url, not secureLinkUrl(id) rebuilt from the webapp constant.
    const storedUrl = "https://links.acme.example/l/aaaaaaaaaaaaaaaa";
    await seed("aaaaaaaaaaaaaaaa", later, "Only link", "2026-07-18T10:00:00.000Z", storedUrl);
    stubList([
      { id: "aaaaaaaaaaaaaaaa", status: "active", expiresAt: later, maxOpens: 3, opensCount: 0 },
    ]);

    render(<LinksListScreen />);
    await waitFor(() => expect(screen.getByText("Only link")).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(storedUrl);
  });

  it("falls back to the reconstructed secureLinkUrl for a legacy record with no stored url", async () => {
    const now = Date.now();
    const later = new Date(now + 2 * 86_400_000).toISOString();
    await seed("aaaaaaaaaaaaaaaa", later, "Legacy link", "2026-07-18T10:00:00.000Z", null);
    stubList([
      { id: "aaaaaaaaaaaaaaaa", status: "active", expiresAt: later, maxOpens: 3, opensCount: 0 },
    ]);

    render(<LinksListScreen />);
    await waitFor(() => expect(screen.getByText("Legacy link")).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(secureLinkUrl("aaaaaaaaaaaaaaaa"));
  });

  it("shows the empty state when there are no tracked links", async () => {
    stubList([]);
    render(<LinksListScreen />);
    await waitFor(() => expect(screen.getByText(/no secure links yet/i)).toBeVisible());
  });

  it("still renders rows from local metadata when the live-status fetch fails", async () => {
    const now = Date.now();
    const later = new Date(now + 2 * 86_400_000).toISOString();
    await seed("aaaaaaaaaaaaaaaa", later, "Offline link", "2026-07-18T10:00:00.000Z");
    stubList("reject");

    render(<LinksListScreen />);
    // No crash; the row renders from local metadata as last-known active.
    await waitFor(() => expect(screen.getByText("Offline link")).toBeVisible());
    expect(within(screen.getByRole("table")).getByText(/^Active$/)).toBeVisible();
  });
});
