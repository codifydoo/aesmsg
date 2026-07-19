import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import type { ListMessageResult } from "@/src/api/client";
import {
  type DisplayStatus,
  expiresInLabel,
  opensLabel,
  reconcileLink,
} from "@/src/links/link-status";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

const NOW = Date.parse("2026-07-18T12:00:00.000Z");
const FP = "AM-1111-2222-3333-4444-5555-6666-7777-8888" as Fingerprint;

function record(overrides: Partial<SentLinkRecord> = {}): SentLinkRecord {
  return {
    id: "AAAAAAAAAAAAAAAA",
    recipientFingerprint: FP,
    createdAt: "2026-07-18T10:00:00.000Z",
    expiresAt: "2026-07-19T12:00:00.000Z", // ~24h out by default
    maxOpens: 3,
    label: null,
    revocationToken: "tok",
    url: "https://aesmsg.com/l/AAAAAAAAAAAAAAAA",
    schemaVersion: 1,
    ...overrides,
  };
}

function active(overrides: Partial<Extract<ListMessageResult, { status: "active" }>> = {}) {
  return {
    id: "AAAAAAAAAAAAAAAA",
    status: "active" as const,
    expiresAt: "2026-07-19T12:00:00.000Z",
    maxOpens: 3,
    opensCount: 0,
    ...overrides,
  };
}

function statusOf(rec: SentLinkRecord, server: ListMessageResult | null, now = NOW): DisplayStatus {
  return reconcileLink(rec, server, now).status;
}

describe("reconcileLink", () => {
  it("active + comfortably future → active", () => {
    expect(statusOf(record(), active())).toBe("active");
  });

  it("active + within an hour of expiry → expiring (amber)", () => {
    const soon = new Date(NOW + 30 * 60_000).toISOString();
    expect(statusOf(record({ expiresAt: soon }), active({ expiresAt: soon }))).toBe("expiring");
  });

  it("active but opens have hit the cap → opened_out", () => {
    expect(statusOf(record(), active({ maxOpens: 3, opensCount: 3 }))).toBe("opened_out");
  });

  it("server gone + still-future local expiry → revoked", () => {
    expect(statusOf(record(), { id: "AAAAAAAAAAAAAAAA", status: "gone" })).toBe("revoked");
  });

  it("server gone + past local expiry → expired (never a false revoked)", () => {
    const past = new Date(NOW - 60_000).toISOString();
    expect(statusOf(record({ expiresAt: past }), { id: "AAAAAAAAAAAAAAAA", status: "gone" })).toBe(
      "expired",
    );
  });

  it("no server result (offline / absent) → last-known active, never revoked", () => {
    expect(statusOf(record(), null)).toBe("active");
  });

  it("no server result + past local expiry → expired", () => {
    const past = new Date(NOW - 60_000).toISOString();
    expect(statusOf(record({ expiresAt: past }), null)).toBe("expired");
  });

  it("carries the server's live opens/expiry when active, else the local record's", () => {
    const live = reconcileLink(record(), active({ opensCount: 2, maxOpens: 3 }), NOW);
    expect(live.opensCount).toBe(2);
    expect(live.maxOpens).toBe(3);
    const gone = reconcileLink(
      record({ maxOpens: 5 }),
      { id: "AAAAAAAAAAAAAAAA", status: "gone" },
      NOW,
    );
    expect(gone.opensCount).toBeNull();
    expect(gone.maxOpens).toBe(5);
  });
});

describe("labels", () => {
  it("expiresInLabel formats minutes / hours / days and Expired", () => {
    expect(expiresInLabel(new Date(NOW + 15 * 60_000).toISOString(), NOW)).toBe("In 15 minutes");
    expect(expiresInLabel(new Date(NOW + 5 * 3_600_000).toISOString(), NOW)).toBe("In 5 hours");
    expect(expiresInLabel(new Date(NOW + 3 * 86_400_000).toISOString(), NOW)).toBe("In 3 days");
    expect(expiresInLabel(new Date(NOW - 60_000).toISOString(), NOW)).toBe("Expired");
  });

  it("opensLabel formats known / unlimited / unknown", () => {
    expect(opensLabel(1, 3)).toBe("1/3");
    expect(opensLabel(0, -1)).toBe("0/∞");
    expect(opensLabel(null, 3)).toBe("—/3");
  });
});
