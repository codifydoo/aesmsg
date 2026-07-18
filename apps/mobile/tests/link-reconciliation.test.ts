import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { type ListMessagesResponse, reconcileSentLinks } from "@/src/links/link-reconciliation";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

const NOW = new Date("2026-05-31T12:00:00.000Z").getTime();

function record(over: Partial<SentLinkRecord> & { id: string }): SentLinkRecord {
  return {
    recipientFingerprint: "AM-AAAA-1111" as Fingerprint,
    createdAt: "2026-05-31T10:00:00.000Z",
    expiresAt: "2026-06-01T10:00:00.000Z", // future relative to NOW
    maxOpens: 3,
    label: "deck",
    schemaVersion: 1,
    ...over,
  };
}

describe("reconcileSentLinks", () => {
  it("merges live server status (active) onto a local record", () => {
    const local = [record({ id: "active0000000000" })];
    const server: ListMessagesResponse = {
      results: [
        {
          id: "active0000000000",
          status: "active",
          expiresAt: "2026-06-01T10:00:00.000Z",
          maxOpens: 3,
          opensCount: 1,
        },
      ],
    };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("active");
    expect(r.opensCount).toBe(1);
    expect(r.maxOpens).toBe(3);
    expect(r.expiresAt).toBe("2026-06-01T10:00:00.000Z");
    expect(r.record.id).toBe("active0000000000");
  });

  it("marks a record the server reports as 'gone' (revoked/expired server-side) as gone", () => {
    const local = [record({ id: "revoked000000000" })];
    const server: ListMessagesResponse = {
      results: [{ id: "revoked000000000", status: "gone" }],
    };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("gone");
    expect(r.opensCount).toBeNull();
  });

  it("marks a still-future local record absent from a successful response 'unknown', NOT 'gone'", () => {
    // An id omitted from an otherwise-successful 200 is NOT an explicit gone signal — the server just
    // returned no row for it. Collapsing it to "gone" would render a false red "Revoked" for a link
    // that is still live. "gone" is reserved for an explicit { status: "gone" } or real local expiry.
    const local = [record({ id: "missing000000000" })]; // expiresAt is future vs NOW
    const server: ListMessagesResponse = { results: [] };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("unknown");
    expect(r.serverStatus).not.toBe("gone");
    expect(r.opensCount).toBeNull();
  });

  it("marks a PAST-expiry local record absent from a successful response 'gone' (local clock)", () => {
    // The absent-id → unknown rule never resurrects a genuinely expired link: local expiry still wins.
    const local = [record({ id: "missingexp000000", expiresAt: "2026-05-30T10:00:00.000Z" })];
    const server: ListMessagesResponse = { results: [] };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("gone");
  });

  it("marks a record whose local expiresAt is already past as gone, even if server says active", () => {
    // Defensive: a clock-skewed or stale server row should not resurrect an expired link locally.
    const local = [
      record({ id: "pastexpiry000000", expiresAt: "2026-05-30T10:00:00.000Z" }), // before NOW
    ];
    const server: ListMessagesResponse = {
      results: [
        {
          id: "pastexpiry000000",
          status: "active",
          expiresAt: "2026-05-30T10:00:00.000Z",
          maxOpens: 1,
          opensCount: 0,
        },
      ],
    };

    const [r] = reconcileSentLinks(local, server, NOW);
    expect(r.serverStatus).toBe("gone");
  });

  it("returns an empty array for no local records", () => {
    const server: ListMessagesResponse = { results: [] };
    expect(reconcileSentLinks([], server, NOW)).toEqual([]);
  });

  it("preserves local order and reconciles a mixed batch (active + explicit-gone + absent)", () => {
    const local = [
      record({ id: "active0000000000" }),
      record({ id: "gone000000000000" }),
      record({ id: "absent0000000000" }), // still-future, omitted from results → "unknown"
    ];
    const server: ListMessagesResponse = {
      results: [
        {
          id: "active0000000000",
          status: "active",
          expiresAt: "2026-06-01T10:00:00.000Z",
          maxOpens: 3,
          opensCount: 2,
        },
        { id: "gone000000000000", status: "gone" },
      ],
    };

    const out = reconcileSentLinks(local, server, NOW);
    // An absent still-future id resolves to "unknown" (neutral), never the red "Revoked" chip; only
    // the explicitly-gone row is "gone".
    expect(out.map((r) => `${r.record.id}:${r.serverStatus}`)).toEqual([
      "active0000000000:active",
      "gone000000000000:gone",
      "absent0000000000:unknown",
    ]);
    expect(out[0]?.opensCount).toBe(2);
  });

  // ── Offline / unreachable (serverResponse === null) — FE-4 / R4 ─────────────────
  describe("when the server is unreachable (serverResponse === null)", () => {
    it("marks a still-future link 'unknown', NEVER 'gone' (no false revoked)", () => {
      const local = [record({ id: "future0000000000" })]; // expiresAt is in the future vs NOW
      const [r] = reconcileSentLinks(local, null, NOW);
      expect(r?.serverStatus).toBe("unknown");
      expect(r?.serverStatus).not.toBe("gone");
      expect(r?.opensCount).toBeNull();
      // Falls back to the local record's expiry/max-opens (nothing came from the server).
      expect(r?.expiresAt).toBe(local[0]?.expiresAt);
      expect(r?.maxOpens).toBe(3);
    });

    it("still marks a locally past-expiry link 'gone' from the clock alone (deterministic expiry)", () => {
      const local = [record({ id: "past000000000000", expiresAt: "2026-05-30T10:00:00.000Z" })];
      const [r] = reconcileSentLinks(local, null, NOW);
      expect(r?.serverStatus).toBe("gone");
    });

    it("reconciles a mixed offline batch: future -> unknown, past-expiry -> gone, order preserved", () => {
      const local = [
        record({ id: "future0000000000" }),
        record({ id: "past000000000000", expiresAt: "2026-05-30T10:00:00.000Z" }),
      ];
      const out = reconcileSentLinks(local, null, NOW);
      expect(out.map((r) => `${r.record.id}:${r.serverStatus}`)).toEqual([
        "future0000000000:unknown",
        "past000000000000:gone",
      ]);
      // No link in an offline batch is ever "active" (liveness is unconfirmed) …
      expect(out.some((r) => r.serverStatus === "active")).toBe(false);
      // … and none is a still-future "gone" (which would render the red "Revoked" alarm).
      expect(
        out.some((r) => r.serverStatus === "gone" && new Date(r.expiresAt).getTime() > NOW),
      ).toBe(false);
    });

    it("returns [] for no local records even when offline", () => {
      expect(reconcileSentLinks([], null, NOW)).toEqual([]);
    });
  });
});
