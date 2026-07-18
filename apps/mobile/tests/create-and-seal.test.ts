import { decodePayload, exportPublicKey, generateIdentity, open } from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// The API host and the shareable-link host are intentionally DISTINCT: network calls go to
// aesmsgApiBaseUrl, but the minted /l/:id link must use aesmsgLinkOrigin (the universal-link host).
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { aesmsgApiBaseUrl: "https://send.test", aesmsgLinkOrigin: "https://links.test" },
    },
  },
}));

// Prevent native-module loading: create-and-seal now imports sent-links-store (which reaches the
// encrypted storage layer). Mock it away so this test stays node-env clean.
vi.mock("@/src/links/sent-links-store", () => ({
  recordSentLink: vi.fn(async () => {}),
  __deleteSentLinksStoreForTests: vi.fn(async () => {}),
}));

import type { CreateMessageRequest } from "@/src/api/client";
import { createAndSeal } from "@/src/create/create-and-seal";
import { base64ToBytes } from "@/src/lib/base64";

describe("createAndSeal", () => {
  afterEach(() => vi.restoreAllMocks());

  it("seals to the recipient, posts ciphertext, returns a web link; recipient can open it", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);

    let posted: CreateMessageRequest | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      posted = JSON.parse(String((init as RequestInit).body)) as CreateMessageRequest;
      return new Response(JSON.stringify({ id: posted.id }), { status: 201 });
    });

    const out = await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "meet me at the bridge 🔐",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      maxOpens: 1,
    });

    // returns a shareable link pointing at the LINK_ORIGIN host, NOT the API host — proving the
    // link is built from aesmsgLinkOrigin, not aesmsgApiBaseUrl.
    expect(out.url).toBe(`https://links.test/l/${out.id}`);
    expect(out.id).toMatch(/^[A-Za-z0-9_-]{16}$/);

    // the recipient opens the posted ciphertext with the SAME binding context the server reports
    if (!posted) throw new Error("fetch mock did not capture the posted request body");
    const ciphertext = base64ToBytes(posted.ciphertext) as unknown as Parameters<typeof open>[0];
    const plaintext = await open(ciphertext, recipient, {
      linkId: out.id,
      recipientPublicKey: recipientKey,
      createdAtMs: posted.createdAtMs,
      expiresAtMs: new Date(posted.expiresAt).getTime(),
      maxOpens: posted.maxOpens,
    });
    expect(decodePayload(plaintext).text).toBe("meet me at the bridge 🔐");
  });

  it("rejects an invalid recipient key before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      createAndSeal({
        recipientPublicKeyString: "not-a-key",
        message: "x",
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 1,
      }),
    ).rejects.toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("seals a supplied attachment so the recipient can decode it", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);

    let posted: CreateMessageRequest | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      posted = JSON.parse(String((init as RequestInit).body)) as CreateMessageRequest;
      return new Response(JSON.stringify({ id: posted.id }), { status: 201 });
    });

    const out = await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "see attached",
      expiresAt: new Date(Date.now() + 60_000),
      maxOpens: 1,
      attachment: {
        filename: "Signed NDA.pdf",
        mimetype: "application/pdf",
        bytes: new Uint8Array([1, 2, 3, 4]),
        size: 4,
      },
    });

    if (!posted) throw new Error("fetch mock did not capture the posted request body");
    const ciphertext = base64ToBytes(posted.ciphertext) as unknown as Parameters<typeof open>[0];
    const plaintext = await open(ciphertext, recipient, {
      linkId: out.id,
      recipientPublicKey: recipientKey,
      createdAtMs: posted.createdAtMs,
      expiresAtMs: new Date(posted.expiresAt).getTime(),
      maxOpens: posted.maxOpens,
    });
    const payload = decodePayload(plaintext);
    expect(payload.text).toBe("see attached");
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe("Signed NDA.pdf");
    expect(payload.attachments[0].mimetype).toBe("application/pdf");
    expect([...payload.attachments[0].bytes]).toEqual([1, 2, 3, 4]);
  });
});
