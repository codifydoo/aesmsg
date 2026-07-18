import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";

// expo-constants (SDK 56) statically imports react-native, whose Flow syntax cannot be parsed
// under Node vitest, so it MUST be mocked. link-display builds shareable links from LINK_ORIGIN
// (aesmsgLinkOrigin), so provide it; aesmsgApiBaseUrl is the API host (unused by this module).
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { aesmsgApiBaseUrl: "https://send.test", aesmsgLinkOrigin: "https://links.test" },
    },
  },
}));

import {
  deriveLinkStatus,
  formatCreatedAtLabel,
  formatExpiresLabel,
  formatTimeLabel,
  toDisplayLink,
} from "@/src/links/link-display";
import type { ReconciledLink } from "@/src/links/link-reconciliation";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

const NOW = new Date("2026-05-31T12:00:00.000Z").getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function baseRecord(over: Partial<SentLinkRecord> & { id: string }): SentLinkRecord {
  return {
    recipientFingerprint: "AM-AAAA-1111" as Fingerprint,
    createdAt: "2026-05-31T10:00:00.000Z",
    expiresAt: new Date(NOW + 3 * DAY).toISOString(),
    maxOpens: 3,
    label: "Q3 board deck",
    schemaVersion: 1,
    ...over,
  };
}

function reconciled(over: Partial<ReconciledLink> & { record: SentLinkRecord }): ReconciledLink {
  return {
    serverStatus: "active",
    opensCount: 0,
    maxOpens: over.record.maxOpens,
    expiresAt: over.record.expiresAt,
    ...over,
  };
}

describe("deriveLinkStatus", () => {
  it("gone -> revoked when no opens were consumed (purged before any open)", () => {
    const r = reconciled({
      record: baseRecord({ id: "a" }),
      serverStatus: "gone",
      opensCount: null,
    });
    expect(deriveLinkStatus(r, NOW)).toBe("revoked");
  });

  it("gone -> expired when the local expiry is already past (timed out, not revoked)", () => {
    const rec = baseRecord({ id: "a", expiresAt: new Date(NOW - HOUR).toISOString() });
    const r = reconciled({
      record: rec,
      serverStatus: "gone",
      opensCount: null,
      expiresAt: rec.expiresAt,
    });
    expect(deriveLinkStatus(r, NOW)).toBe("expired");
  });

  it("active with opens consumed -> opened", () => {
    const r = reconciled({
      record: baseRecord({ id: "a" }),
      serverStatus: "active",
      opensCount: 2,
    });
    expect(deriveLinkStatus(r, NOW)).toBe("opened");
  });

  it("active, unopened, inside its proportional window -> expiring", () => {
    // 5h-lifetime link (created 4h ago, expires in 1h): the amber window is the last 20% (1h), and
    // 1h remaining sits right at its edge → expiring.
    const created = new Date(NOW - 4 * HOUR).toISOString();
    const exp = new Date(NOW + HOUR).toISOString();
    const r = reconciled({
      record: baseRecord({ id: "a", createdAt: created, expiresAt: exp }),
      serverStatus: "active",
      opensCount: 0,
      expiresAt: exp,
    });
    expect(deriveLinkStatus(r, NOW)).toBe("expiring");
  });

  it("active, unopened, expiry far away -> available", () => {
    const exp = new Date(NOW + 3 * DAY).toISOString();
    const r = reconciled({
      record: baseRecord({ id: "a", expiresAt: exp }),
      serverStatus: "active",
      opensCount: 0,
      expiresAt: exp,
    });
    expect(deriveLinkStatus(r, NOW)).toBe("available");
  });

  it("proportional window: a fresh SHORT link is NOT born amber; a fresh LONG link is not either", () => {
    // 10-minute link, just created: window is the floored 2min, so 10min remaining reads available
    // (the old fixed 24h window would have made this amber from birth).
    const shortExp = new Date(NOW + 10 * 60_000).toISOString();
    const shortLink = reconciled({
      record: baseRecord({ id: "s", createdAt: new Date(NOW).toISOString(), expiresAt: shortExp }),
      serverStatus: "active",
      opensCount: 0,
      expiresAt: shortExp,
    });
    expect(deriveLinkStatus(shortLink, NOW)).toBe("available");

    // 7-day link, just created: window clamps to 24h, and 7d remaining is far outside it.
    const longExp = new Date(NOW + 7 * DAY).toISOString();
    const longLink = reconciled({
      record: baseRecord({ id: "l", createdAt: new Date(NOW).toISOString(), expiresAt: longExp }),
      serverStatus: "active",
      opensCount: 0,
      expiresAt: longExp,
    });
    expect(deriveLinkStatus(longLink, NOW)).toBe("available");
  });

  it("proportional window: a SHORT link near its end goes amber (final-minute heads-up)", () => {
    // 10-minute link with 1 minute left: inside the 2min floored window → expiring.
    const created = new Date(NOW - 9 * 60_000).toISOString();
    const exp = new Date(NOW + 60_000).toISOString();
    const r = reconciled({
      record: baseRecord({ id: "s2", createdAt: created, expiresAt: exp }),
      serverStatus: "active",
      opensCount: 0,
      expiresAt: exp,
    });
    expect(deriveLinkStatus(r, NOW)).toBe("expiring");
  });

  it("proportional window: a LONG link only goes amber inside the clamped 24h ceiling", () => {
    const created = new Date(NOW - (7 * DAY - 11 * HOUR)).toISOString(); // 7d lifetime, 11h left
    const exp = new Date(NOW + 11 * HOUR).toISOString();
    const r = reconciled({
      record: baseRecord({ id: "l2", createdAt: created, expiresAt: exp }),
      serverStatus: "active",
      opensCount: 0,
      expiresAt: exp,
    });
    expect(deriveLinkStatus(r, NOW)).toBe("expiring");
  });

  it("unknown (server unreachable) -> unknown, NEVER revoked even with a future expiry (FE-4/R4)", () => {
    const exp = new Date(NOW + 3 * DAY).toISOString();
    const r = reconciled({
      record: baseRecord({ id: "a", expiresAt: exp }),
      serverStatus: "unknown",
      opensCount: null,
      expiresAt: exp,
    });
    const status = deriveLinkStatus(r, NOW);
    expect(status).toBe("unknown");
    expect(status).not.toBe("revoked");
  });
});

describe("label formatters", () => {
  it("formatTimeLabel reuses the relative-time helper (2h ago style with ' ago' suffix)", () => {
    expect(formatTimeLabel(new Date(NOW - 2 * HOUR).toISOString(), NOW)).toBe("2h ago");
    expect(formatTimeLabel(new Date(NOW - 30_000).toISOString(), NOW)).toBe("Now");
  });

  it("formatExpiresLabel renders a future remaining-time, 'Revoked', or 'Expired'", () => {
    const active = reconciled({
      record: baseRecord({
        id: "a",
        expiresAt: new Date(NOW + 3 * HOUR + 42 * 60_000).toISOString(),
      }),
      serverStatus: "active",
      opensCount: 0,
      expiresAt: new Date(NOW + 3 * HOUR + 42 * 60_000).toISOString(),
    });
    expect(formatExpiresLabel(active, NOW)).toBe("in 3h 42m");

    const revoked = reconciled({
      record: baseRecord({ id: "a" }),
      serverStatus: "gone",
      opensCount: null,
    });
    expect(formatExpiresLabel(revoked, NOW)).toBe("Revoked");

    const expRec = baseRecord({ id: "a", expiresAt: new Date(NOW - HOUR).toISOString() });
    const expired = reconciled({
      record: expRec,
      serverStatus: "gone",
      opensCount: null,
      expiresAt: expRec.expiresAt,
    });
    expect(formatExpiresLabel(expired, NOW)).toBe("Expired");

    // Offline/unknown: expiry is deterministic from the local clock, so show the scheduled
    // remaining time — never the "Revoked" alarm.
    const unknownExp = new Date(NOW + 3 * HOUR + 42 * 60_000).toISOString();
    const unknown = reconciled({
      record: baseRecord({ id: "a", expiresAt: unknownExp }),
      serverStatus: "unknown",
      opensCount: null,
      expiresAt: unknownExp,
    });
    const unknownLabel = formatExpiresLabel(unknown, NOW);
    expect(unknownLabel).toBe("in 3h 42m");
    expect(unknownLabel).not.toBe("Revoked");
  });

  it("formatCreatedAtLabel renders an absolute date/time string", () => {
    const label = formatCreatedAtLabel("2026-05-31T10:00:00.000Z");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("toDisplayLink", () => {
  it("assembles the presentational Link from a reconciled record", () => {
    const exp = new Date(NOW + 3 * HOUR).toISOString();
    const rec = baseRecord({
      id: "disp000000000000",
      expiresAt: exp,
      label: "Q3 board deck",
      maxOpens: 3,
    });
    const r = reconciled({
      record: rec,
      serverStatus: "active",
      opensCount: 1,
      expiresAt: exp,
      maxOpens: 3,
    });

    const link = toDisplayLink(r, NOW);
    expect(link.id).toBe("disp000000000000");
    expect(link.to).toBe("Q3 board deck");
    expect(link.status).toBe("opened"); // opensCount > 0
    expect(link.opensUsed).toBe(1);
    expect(link.opensMax).toBe(3);
    expect(link.time).toBe(formatTimeLabel(rec.createdAt, NOW));
    // No contacts supplied → neutral "Unknown recipient" + the fingerprint truncated to two groups.
    expect(link.recipient.name).toBe("Unknown recipient");
    expect(link.recipient.shortFingerprint).toBe("AAAA 1111");
    expect(link.recipient.verified).toBe(false);
    expect(link.url).toContain("disp000000000000");
  });

  it("resolves the recipient card from the contacts directory (name + verified + truncated fp)", () => {
    const exp = new Date(NOW + 3 * HOUR).toISOString();
    const rec = baseRecord({
      id: "resolved00000000",
      recipientFingerprint: "AM-AAAA-1111" as Fingerprint,
      expiresAt: exp,
    });
    const r = reconciled({ record: rec, serverStatus: "active", opensCount: 0, expiresAt: exp });

    const link = toDisplayLink(r, NOW, [
      {
        label: "Elena Rodriguez",
        fingerprint: "AM-AAAA-1111" as Fingerprint,
        verified: true,
        previousFingerprints: [],
      },
    ]);
    expect(link.recipient.name).toBe("Elena Rodriguez");
    expect(link.recipient.verified).toBe(true);
    expect(link.recipient.shortFingerprint).toBe("AAAA 1111");
  });

  it("falls back to a generic title and ∞ max when label is null / maxOpens is -1 (unlimited)", () => {
    const exp = new Date(NOW + 3 * DAY).toISOString();
    const rec = baseRecord({ id: "unlim00000000000", label: null, maxOpens: -1, expiresAt: exp });
    const r = reconciled({
      record: rec,
      serverStatus: "active",
      opensCount: 0,
      expiresAt: exp,
      maxOpens: -1,
    });

    const link = toDisplayLink(r, NOW);
    expect(link.to).toBe("Secure link");
    expect(link.opensMax).toBeNull();
  });
});
