import { exportPublicKey, generateIdentity } from "@aesmsg/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The API host and the shareable-link host are intentionally DISTINCT: the minted /l/:id link
// must use aesmsgLinkOrigin (the universal-link host), not aesmsgApiBaseUrl.
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { aesmsgApiBaseUrl: "https://send.test", aesmsgLinkOrigin: "https://links.test" },
    },
  },
}));

// Capture sent-links recording without touching the encrypted store under node-env.
const { recordSentLinkMock } = vi.hoisted(() => ({ recordSentLinkMock: vi.fn(async () => {}) }));
vi.mock("@/src/links/sent-links-store", () => ({
  recordSentLink: recordSentLinkMock,
  // The global setup (tests/setup.ts) calls __deleteSentLinksStoreForTests on every module that
  // exports it; stub it here so vitest doesn't error on the unknown export.
  __deleteSentLinksStoreForTests: vi.fn(async () => {}),
}));

import { createAndSeal } from "@/src/create/create-and-seal";

describe("createAndSeal records the sent link", () => {
  beforeEach(() => recordSentLinkMock.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it("calls recordSentLink with sender-derivable metadata + the revocation token after a successful POST", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);
    // The server returns the secret revocation token (BE-1 / R2) in the 201 body.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const posted = JSON.parse(String((init as RequestInit).body)) as { id: string };
      return new Response(
        JSON.stringify({ id: posted.id, revocationToken: "revtok-abc123def456" }),
        { status: 201 },
      );
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const out = await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "hush",
      expiresAt,
      maxOpens: 3,
      label: "Q3 board deck",
    });

    expect(recordSentLinkMock).toHaveBeenCalledTimes(1);
    const rec = recordSentLinkMock.mock.calls[0]?.[0];
    expect(rec).toMatchObject({
      id: out.id,
      recipientFingerprint: out.recipientFingerprint,
      expiresAt: expiresAt.toISOString(),
      maxOpens: 3,
      label: "Q3 board deck",
      // The token captured from the create response is persisted so the link can be revoked later.
      revocationToken: "revtok-abc123def456",
    });
    expect(typeof rec.createdAt).toBe("string");
    // createdAt must be a valid ISO timestamp the reconciler can parse.
    expect(Number.isNaN(new Date(rec.createdAt).getTime())).toBe(false);
    // plaintext must never be recorded.
    expect(JSON.stringify(rec)).not.toContain("hush");
  });

  it("does NOT record when the POST fails (no orphan tracking record)", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    await expect(
      createAndSeal({
        recipientPublicKeyString: recipientKey,
        message: "secret",
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 1,
      }),
    ).rejects.toBeTruthy();
    expect(recordSentLinkMock).not.toHaveBeenCalled();
  });

  it("still resolves with the link output when recordSentLink rejects (best-effort recording)", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const posted = JSON.parse(String((init as RequestInit).body)) as { id: string };
      return new Response(JSON.stringify({ id: posted.id }), { status: 201 });
    });
    recordSentLinkMock.mockRejectedValueOnce(new Error("encrypted-storage write failed"));

    const expiresAt = new Date(Date.now() + 60_000);
    const out = await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "important secret",
      expiresAt,
      maxOpens: 1,
    });

    // The link was created server-side — caller must receive it regardless of recording failure.
    expect(out.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(out.url).toBe(`https://links.test/l/${out.id}`);
    expect(out.recipientFingerprint).toBeTruthy();
  });

  it("records label as null when none is supplied", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const posted = JSON.parse(String((init as RequestInit).body)) as { id: string };
      return new Response(JSON.stringify({ id: posted.id }), { status: 201 });
    });

    await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "x",
      expiresAt: new Date(Date.now() + 60_000),
      maxOpens: 1,
    });

    expect(recordSentLinkMock.mock.calls[0]?.[0].label).toBeNull();
  });
});
