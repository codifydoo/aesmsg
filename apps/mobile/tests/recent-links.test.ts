import { describe, expect, it } from "vitest";
import { recentLinkChip, toRecentLinks } from "@/src/home/recent-links";
import type { Link } from "@/src/links/links-data";

// recent-links is pure (no React/store), so the slice + status->Chip mapping is unit-tested here
// per the node-env / no-React-renderer convention — HomeScreen stays presentational.

function link(over: Pick<Link, "id" | "status"> & Partial<Link>): Link {
  return {
    id: over.id,
    to: over.to ?? "Secure link",
    recipient: { name: "Secure link", shortFingerprint: "AM-0000", verified: false },
    createdAt: over.createdAt ?? "Jan 1, 12:00",
    time: over.time ?? "2h ago",
    status: over.status,
    opensUsed: 0,
    opensMax: null,
    url: "https://aesmsg.to/l/x",
    expiresLabel: "in 3h",
  };
}

describe("toRecentLinks", () => {
  it("maps a Link to a Home row (title=to, sub=time, status passthrough)", () => {
    const rows = toRecentLinks([
      link({ id: "a", to: "Q3 deck → Elena", time: "2h ago", status: "available" }),
    ]);
    expect(rows).toEqual([
      { id: "a", title: "Q3 deck → Elena", sub: "2h ago", status: "available" },
    ]);
  });

  it("keeps only the first `limit` links (default 3) preserving input order", () => {
    const links = ["a", "b", "c", "d"].map((id) => link({ id, status: "available" }));
    expect(toRecentLinks(links).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(toRecentLinks(links, 2).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns [] for no links", () => {
    expect(toRecentLinks([])).toEqual([]);
  });

  it("returns [] when limit is 0", () => {
    const links = ["a", "b"].map((id) => link({ id, status: "available" }));
    expect(toRecentLinks(links, 0)).toEqual([]);
  });
});

describe("recentLinkChip", () => {
  it("fills only the available (green check) chip", () => {
    expect(recentLinkChip("available")).toEqual({
      tone: "green",
      icon: "check_circle",
      label: "Available",
      fill: true,
    });
  });

  it("renders the other statuses as outline chips with their Links-tab tones", () => {
    expect(recentLinkChip("expiring")).toEqual({
      tone: "amber",
      icon: "schedule",
      label: "Expiring soon",
      fill: false,
    });
    expect(recentLinkChip("opened")).toEqual({
      tone: "violet",
      icon: "visibility",
      label: "Opened",
      fill: false,
    });
    expect(recentLinkChip("revoked")).toEqual({
      tone: "error",
      icon: "block",
      label: "Revoked",
      fill: false,
    });
    expect(recentLinkChip("expired")).toEqual({
      tone: "neutral",
      icon: "history",
      label: "Expired",
      fill: false,
    });
    // Offline/unreachable: Home shows a calm neutral chip too — never the red "Revoked" alarm.
    expect(recentLinkChip("unknown")).toEqual({
      tone: "neutral",
      icon: "cloud_off",
      label: "Status unknown",
      fill: false,
    });
  });
});
