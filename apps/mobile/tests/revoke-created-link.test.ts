import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";

// expo-constants statically imports react-native (Flow syntax), unparseable under Node vitest.
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { aesmsgApiBaseUrl: "https://send.test", aesmsgLinkOrigin: "https://links.test" },
    },
  },
}));

// revoke-created-link → use-sent-links → sent-links-store → @/src/storage → native modules. The
// helper is fully DI'd (we pass our own deps), so stub the store to keep the import side-effect-free.
vi.mock("@/src/links/sent-links-store", () => ({
  listSentLinks: vi.fn(async () => []),
  recordSentLink: vi.fn(async () => {}),
  getSentLink: vi.fn(async () => null),
  deleteSentLink: vi.fn(async () => {}),
  __deleteSentLinksStoreForTests: vi.fn(async () => {}),
}));

import { ApiError } from "@/src/api/client";
import { revokeCreatedLink } from "@/src/create/revoke-created-link";
import type { SentLinkRecord } from "@/src/links/sent-links-store";
import type { SentLinksDeps } from "@/src/links/use-sent-links";

const ID = "abcdEFGH12345678";

function record(over: Partial<SentLinkRecord> = {}): SentLinkRecord {
  return {
    id: ID,
    recipientFingerprint: "AM-AAAA-1111" as Fingerprint,
    createdAt: "2026-05-31T10:00:00.000Z",
    expiresAt: "2026-06-03T10:00:00.000Z",
    maxOpens: 1,
    label: null,
    revocationToken: "tok-secret",
    schemaVersion: 1,
    ...over,
  };
}

interface Spies {
  getSentLink: ReturnType<typeof vi.fn>;
  revokeLink: ReturnType<typeof vi.fn>;
  deleteSentLink: ReturnType<typeof vi.fn>;
}

function makeDeps(over: Partial<Spies> = {}): { deps: SentLinksDeps; spies: Spies } {
  const spies: Spies = {
    getSentLink: over.getSentLink ?? vi.fn(async () => record()),
    revokeLink: over.revokeLink ?? vi.fn(async () => {}),
    deleteSentLink: over.deleteSentLink ?? vi.fn(async () => {}),
  };
  const deps: SentLinksDeps = {
    listSentLinks: vi.fn(async () => []),
    listMessages: vi.fn(async () => ({ results: [] })),
    getSentLink: spies.getSentLink,
    revokeLink: spies.revokeLink,
    deleteSentLink: spies.deleteSentLink,
  };
  return { deps, spies };
}

describe("revokeCreatedLink", () => {
  it("revokes with the record's secret token and drops the local record (reuses revokeTrackedLink)", async () => {
    const { deps, spies } = makeDeps();
    const result = await revokeCreatedLink(ID, deps);

    expect(result).toBe("revoked");
    // The token from the local record authenticates the revoke — the whole point of BE-1 / R2.
    expect(spies.revokeLink).toHaveBeenCalledWith(ID, "tok-secret");
    expect(spies.deleteSentLink).toHaveBeenCalledWith(ID);
    expect(spies.deleteSentLink).toHaveBeenCalledTimes(1);
  });

  it("revokes un-tokened for a legacy record with no token", async () => {
    const { deps, spies } = makeDeps({
      getSentLink: vi.fn(async () => record({ revocationToken: null })),
    });
    const result = await revokeCreatedLink(ID, deps);

    expect(result).toBe("revoked");
    expect(spies.revokeLink).toHaveBeenCalledWith(ID, null);
  });

  it("treats a 404 (already gone) as success and still cleans up the local record", async () => {
    const { deps, spies } = makeDeps({
      revokeLink: vi.fn(async () => {
        throw new ApiError(404);
      }),
    });
    const result = await revokeCreatedLink(ID, deps);

    expect(result).toBe("revoked");
    // revokeTrackedLink skips its own delete when revoke throws — revokeCreatedLink cleans up.
    expect(spies.deleteSentLink).toHaveBeenCalledWith(ID);
    expect(spies.deleteSentLink).toHaveBeenCalledTimes(1);
  });

  it("treats a 410 (gone) as success", async () => {
    const { deps } = makeDeps({
      revokeLink: vi.fn(async () => {
        throw new ApiError(410);
      }),
    });
    expect(await revokeCreatedLink(ID, deps)).toBe("revoked");
  });

  it("still resolves 'revoked' on a 404 even if the local cleanup delete fails", async () => {
    const { deps } = makeDeps({
      revokeLink: vi.fn(async () => {
        throw new ApiError(404);
      }),
      deleteSentLink: vi.fn(async () => {
        throw new Error("storage write failed");
      }),
    });
    expect(await revokeCreatedLink(ID, deps)).toBe("revoked");
  });

  it("returns 'error' on a server fault (5xx) and keeps the link live (no local delete)", async () => {
    const { deps, spies } = makeDeps({
      revokeLink: vi.fn(async () => {
        throw new ApiError(500);
      }),
    });
    const result = await revokeCreatedLink(ID, deps);

    expect(result).toBe("error");
    // The link is still live — the tracking record must NOT be dropped.
    expect(spies.deleteSentLink).not.toHaveBeenCalled();
  });

  it("returns 'error' on an offline / transport failure", async () => {
    const { deps } = makeDeps({
      revokeLink: vi.fn(async () => {
        throw new TypeError("Network request failed");
      }),
    });
    expect(await revokeCreatedLink(ID, deps)).toBe("error");
  });
});
