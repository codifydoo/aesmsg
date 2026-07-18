import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";

// expo-constants statically imports react-native (Flow syntax), unparseable under Node vitest.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "" } } },
}));

// sent-links-store → @/src/storage → expo-secure-store/expo-file-system/legacy, which pull in
// react-native (Flow syntax). Since loadAndReconcile is fully DI'd, we never need the real store
// in this test — stub it out to keep the import side-effect-free.
vi.mock("@/src/links/sent-links-store", () => ({
  listSentLinks: vi.fn(async () => []),
  recordSentLink: vi.fn(async () => {}),
  getSentLink: vi.fn(async () => null),
  deleteSentLink: vi.fn(async () => {}),
  __deleteSentLinksStoreForTests: vi.fn(async () => {}),
}));

import { ApiError } from "@/src/api/client";
import type { SentLinkRecord } from "@/src/links/sent-links-store";
import {
  loadAndReconcile,
  revokeTrackedLink,
  revokeTrackedLinkOutcome,
  type SentLinksDeps,
  sentLinksLoadFlags,
} from "@/src/links/use-sent-links";

const NOW = new Date("2026-05-31T12:00:00.000Z").getTime();
const DAY = 24 * 3_600_000;

function rec(over: Partial<SentLinkRecord> & { id: string }): SentLinkRecord {
  return {
    recipientFingerprint: "AM-AAAA-1111" as Fingerprint,
    createdAt: "2026-05-31T10:00:00.000Z",
    expiresAt: new Date(NOW + 3 * DAY).toISOString(),
    maxOpens: 3,
    label: "deck",
    schemaVersion: 1,
    ...over,
  };
}

describe("loadAndReconcile", () => {
  it("loads local records, fetches their ids, reconciles, and returns display links newest-first", async () => {
    const newer = rec({ id: "newer00000000000", createdAt: "2026-05-31T11:00:00.000Z" });
    const older = rec({ id: "older00000000000", createdAt: "2026-05-30T11:00:00.000Z" });
    const listSentLinks = vi.fn(async () => [newer, older]); // store already sorts newest-first
    const listMessages = vi.fn(async (ids: string[]) => ({
      results: ids.map((id) => ({
        id,
        status: "active" as const,
        expiresAt: new Date(NOW + 3 * DAY).toISOString(),
        maxOpens: 3,
        opensCount: 0,
      })),
    }));

    const deps: SentLinksDeps = {
      listSentLinks,
      listMessages,
      getSentLink: vi.fn(async () => null),
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
    };
    const { links, serverReachable } = await loadAndReconcile(deps, NOW);

    expect(listMessages).toHaveBeenCalledWith(["newer00000000000", "older00000000000"]);
    expect(links.map((l) => l.id)).toEqual(["newer00000000000", "older00000000000"]);
    expect(links[0]?.status).toBe("available");
    expect(serverReachable).toBe(true);
  });

  it("returns no links (server reachable) without calling listMessages when there are no local records", async () => {
    const listMessages = vi.fn();
    const deps: SentLinksDeps = {
      listSentLinks: vi.fn(async () => []),
      listMessages,
      getSentLink: vi.fn(async () => null),
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
    };
    expect(await loadAndReconcile(deps, NOW)).toEqual({ links: [], serverReachable: true });
    expect(listMessages).not.toHaveBeenCalled();
  });

  it("offline (fetch throws): future links render 'unknown', NEVER 'revoked', and flags unreachable", async () => {
    const r = rec({ id: "offline000000000" }); // expiry is NOW + 3 days (future)
    const deps: SentLinksDeps = {
      listSentLinks: vi.fn(async () => [r]),
      listMessages: vi.fn(async () => {
        throw new Error("network down");
      }),
      getSentLink: vi.fn(async () => null),
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
    };

    const { links, serverReachable } = await loadAndReconcile(deps, NOW);
    expect(links).toHaveLength(1);
    // A failed fetch is not evidence of revocation: a still-live link reads as "unknown", not red.
    expect(links[0]?.status).toBe("unknown");
    expect(links[0]?.status).not.toBe("revoked");
    expect(serverReachable).toBe(false);
  });

  it("offline (fetch throws): a locally past-expiry link still reads 'expired' from the clock alone", async () => {
    const past = rec({ id: "pastexpiry000000", expiresAt: new Date(NOW - DAY).toISOString() });
    const deps: SentLinksDeps = {
      listSentLinks: vi.fn(async () => [past]),
      listMessages: vi.fn(async () => {
        throw new Error("network down");
      }),
      getSentLink: vi.fn(async () => null),
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
    };

    const { links, serverReachable } = await loadAndReconcile(deps, NOW);
    expect(links[0]?.status).toBe("expired"); // deterministic local expiry, not the server
    expect(serverReachable).toBe(false);
  });
});

// The token-authenticated revoke path (BE-1 / R2). Pure + DI so it is node-testable without a React
// renderer — the hook's revokeAndDelete is a thin wrapper over this.
describe("revokeTrackedLink", () => {
  function depsWith(record: SentLinkRecord | null) {
    return {
      listSentLinks: vi.fn(async () => []),
      listMessages: vi.fn(async () => ({ results: [] })),
      getSentLink: vi.fn(async () => record),
      revokeLink: vi.fn(async () => {}),
      deleteSentLink: vi.fn(async () => {}),
    } satisfies SentLinksDeps;
  }

  it("looks up the record, revokes with its token, then deletes the local record", async () => {
    const record = rec({ id: "hastoken00000000", revocationToken: "revtok-secret-abc" });
    const deps = depsWith(record);

    await revokeTrackedLink(deps, "hastoken00000000");

    expect(deps.getSentLink).toHaveBeenCalledWith("hastoken00000000");
    expect(deps.revokeLink).toHaveBeenCalledWith("hastoken00000000", "revtok-secret-abc");
    expect(deps.deleteSentLink).toHaveBeenCalledWith("hastoken00000000");
  });

  it("a legacy record with no token revokes un-tokened (null) — legacy server rows honor it", async () => {
    const record = rec({ id: "legacytoken00000" }); // no revocationToken field
    const deps = depsWith(record);

    await revokeTrackedLink(deps, "legacytoken00000");

    expect(deps.revokeLink).toHaveBeenCalledWith("legacytoken00000", null);
    expect(deps.deleteSentLink).toHaveBeenCalledWith("legacytoken00000");
  });

  it("a missing local record (getSentLink → null) still attempts an un-tokened revoke", async () => {
    const deps = depsWith(null);

    await revokeTrackedLink(deps, "missingrec000000");

    expect(deps.revokeLink).toHaveBeenCalledWith("missingrec000000", null);
    expect(deps.deleteSentLink).toHaveBeenCalledWith("missingrec000000");
  });

  it("cancels the link's scheduled 'expiring soon' reminder on a successful revoke", async () => {
    const record = rec({ id: "withreminder0000", reminderNotificationId: "notif-xyz" });
    const cancelReminder = vi.fn(async () => {});
    const deps: SentLinksDeps = { ...depsWith(record), cancelReminder };

    await revokeTrackedLink(deps, "withreminder0000");

    expect(cancelReminder).toHaveBeenCalledWith("notif-xyz");
    expect(deps.deleteSentLink).toHaveBeenCalledWith("withreminder0000");
  });

  it("does not attempt a reminder cancel for a record that scheduled none", async () => {
    const record = rec({ id: "noreminder000000" }); // no reminderNotificationId
    const cancelReminder = vi.fn(async () => {});
    const deps: SentLinksDeps = { ...depsWith(record), cancelReminder };

    await revokeTrackedLink(deps, "noreminder000000");

    expect(cancelReminder).not.toHaveBeenCalled();
  });
});

// The Links-tab revoke outcome: folds already-gone (404/410) into success, everything else → error.
describe("revokeTrackedLinkOutcome", () => {
  function depsWith(record: SentLinkRecord | null, revokeLink: () => Promise<void>) {
    return {
      listSentLinks: vi.fn(async () => []),
      listMessages: vi.fn(async () => ({ results: [] })),
      getSentLink: vi.fn(async () => record),
      revokeLink: vi.fn(revokeLink),
      deleteSentLink: vi.fn(async () => {}),
    } satisfies SentLinksDeps;
  }

  it("returns 'revoked' on a confirmed revoke and deletes the local record", async () => {
    const deps = depsWith(rec({ id: "ok00000000000000", revocationToken: "tok" }), async () => {});

    expect(await revokeTrackedLinkOutcome(deps, "ok00000000000000")).toBe("revoked");
    expect(deps.deleteSentLink).toHaveBeenCalledWith("ok00000000000000");
  });

  it("folds an already-gone (410) revoke into 'revoked' and cleans up the orphaned record", async () => {
    const deps = depsWith(rec({ id: "gone000000000000" }), async () => {
      throw new ApiError(410);
    });

    expect(await revokeTrackedLinkOutcome(deps, "gone000000000000")).toBe("revoked");
    // revokeTrackedLink skips its delete when the revoke throws, so the outcome cleans up here.
    expect(deps.deleteSentLink).toHaveBeenCalledWith("gone000000000000");
  });

  it("returns 'error' on a real failure and leaves the record intact (never deletes)", async () => {
    const deps = depsWith(rec({ id: "netfail000000000" }), async () => {
      throw new Error("network down");
    });

    expect(await revokeTrackedLinkOutcome(deps, "netfail000000000")).toBe("error");
    expect(deps.deleteSentLink).not.toHaveBeenCalled();
  });

  it("returns 'error' on a non-already-gone ApiError (e.g. 500), keeping the link live", async () => {
    const deps = depsWith(rec({ id: "server5xx0000000" }), async () => {
      throw new ApiError(500);
    });

    expect(await revokeTrackedLinkOutcome(deps, "server5xx0000000")).toBe("error");
    expect(deps.deleteSentLink).not.toHaveBeenCalled();
  });
});

// Recipient-card resolution threaded through the load pipeline via the optional listContacts dep.
describe("loadAndReconcile — recipient resolution", () => {
  function activeServer(id: string) {
    return {
      results: [
        {
          id,
          status: "active" as const,
          expiresAt: new Date(NOW + 3 * DAY).toISOString(),
          maxOpens: 3,
          opensCount: 0,
        },
      ],
    };
  }

  it("resolves a link's recipient card from the injected contacts directory", async () => {
    const r = rec({ id: "hascontact000000", recipientFingerprint: "AM-AAAA-1111" as Fingerprint });
    const deps: SentLinksDeps = {
      listSentLinks: vi.fn(async () => [r]),
      listMessages: vi.fn(async () => activeServer(r.id)),
      getSentLink: vi.fn(async () => null),
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
      listContacts: vi.fn(async () => [
        {
          label: "Dana Lin",
          fingerprint: "AM-AAAA-1111" as Fingerprint,
          verified: true,
          previousFingerprints: [],
        },
      ]),
    };

    const { links } = await loadAndReconcile(deps, NOW);
    expect(links[0]?.recipient.name).toBe("Dana Lin");
    expect(links[0]?.recipient.verified).toBe(true);
    expect(links[0]?.recipient.shortFingerprint).toBe("AAAA 1111");
  });

  it("degrades to 'Unknown recipient' when the contacts read throws (never blocks the list)", async () => {
    const r = rec({ id: "contactfail00000" });
    const deps: SentLinksDeps = {
      listSentLinks: vi.fn(async () => [r]),
      listMessages: vi.fn(async () => activeServer(r.id)),
      getSentLink: vi.fn(async () => null),
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
      listContacts: vi.fn(async () => {
        throw new Error("contacts blob unreadable");
      }),
    };

    const { links } = await loadAndReconcile(deps, NOW);
    expect(links).toHaveLength(1);
    expect(links[0]?.recipient.name).toBe("Unknown recipient");
  });

  it("with no contacts dep at all, links still resolve to 'Unknown recipient'", async () => {
    const r = rec({ id: "nocontactsdep000" });
    const deps: SentLinksDeps = {
      listSentLinks: vi.fn(async () => [r]),
      listMessages: vi.fn(async () => activeServer(r.id)),
      getSentLink: vi.fn(async () => null),
      revokeLink: vi.fn(),
      deleteSentLink: vi.fn(),
    };

    const { links } = await loadAndReconcile(deps, NOW);
    expect(links[0]?.recipient.name).toBe("Unknown recipient");
  });
});

// The flag pair the hook's refresh() applies on every settled load. Pinned here (node-testable,
// no React renderer) because the hook's error/offline reset lives in this pure derivation.
describe("sentLinksLoadFlags — refresh() error/offline invariant", () => {
  it("a reachable load clears both error and offline", () => {
    expect(sentLinksLoadFlags({ ok: true, serverReachable: true })).toEqual({
      error: false,
      offline: false,
    });
  });

  it("an unreachable (offline) load sets offline but not error", () => {
    expect(sentLinksLoadFlags({ ok: true, serverReachable: false })).toEqual({
      error: false,
      offline: true,
    });
  });

  it("a local-store throw sets error AND resets offline (so both are never stale-true at once)", () => {
    // Regression guard: previously the catch path set `error` but never reset `offline`, so a store
    // throw after a prior offline load left both flags true. sentLinksLoadFlags always resets offline.
    const flags = sentLinksLoadFlags({ ok: false });
    expect(flags).toEqual({ error: true, offline: false });
    expect(flags.error && flags.offline).toBe(false);
  });
});
