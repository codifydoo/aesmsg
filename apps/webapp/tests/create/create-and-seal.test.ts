import { decodePayload, exportPublicKey, generateIdentity, open } from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the sent-links store so these tests exercise the seal/upload core without IndexedDB, and so
// the best-effort-persistence test can force a storage failure.
vi.mock("@/src/links/sent-links-store", () => ({
  recordSentLink: vi.fn(async () => {}),
}));

import type { CreateMessageRequest } from "@/src/api/client";
import { createAndSeal } from "@/src/create/create-and-seal";
import { base64ToBytes } from "@/src/lib/base64";
import { recordSentLink } from "@/src/links/sent-links-store";

/** Stub fetch to capture the create request body and echo a valid create response. */
function stubCreate(): () => CreateMessageRequest | null {
  let posted: CreateMessageRequest | null = null;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    posted = JSON.parse(String((init as RequestInit).body)) as CreateMessageRequest;
    return new Response(
      JSON.stringify({
        id: posted.id,
        url: `https://aesmsg.com/l/${posted.id}`,
        revocationToken: "rev-token",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });
  return () => posted;
}

describe("createAndSeal", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uploads NO plaintext — exactly {id,ciphertext,expiresAt,maxOpens}, no secret marker", async () => {
    const recipient = await generateIdentity();
    let capturedBody = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      capturedBody = String((init as RequestInit).body);
      const posted = JSON.parse(capturedBody) as CreateMessageRequest;
      return new Response(
        JSON.stringify({
          id: posted.id,
          url: `https://aesmsg.com/l/${posted.id}`,
          revocationToken: "t",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });

    await createAndSeal({
      recipientPublicKeyString: exportPublicKey(recipient),
      message: "SUPER-SECRET-MARKER",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      maxOpens: 1,
      label: "a private label",
    });

    expect(capturedBody).not.toContain("SUPER-SECRET-MARKER");
    expect(capturedBody).not.toContain("a private label");
    const keys = Object.keys(JSON.parse(capturedBody) as Record<string, unknown>).sort();
    expect(keys).toEqual(["ciphertext", "expiresAt", "id", "maxOpens"]);
  });

  it("seals a v0x01 wire blob and uploads the same expiry/maxOpens it was given", async () => {
    const recipient = await generateIdentity();
    const getPosted = stubCreate();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const out = await createAndSeal({
      recipientPublicKeyString: exportPublicKey(recipient),
      message: "hi",
      expiresAt,
      maxOpens: 3,
    });

    const posted = getPosted();
    if (!posted) throw new Error("fetch mock captured no body");
    const blob = base64ToBytes(posted.ciphertext);
    expect(blob[0]).toBe(0x01); // WIRE_VERSION
    expect(blob[1]).toBe(0x01); // SUITE_X25519_AES256GCM
    expect(posted.expiresAt).toBe(expiresAt.toISOString());
    expect(posted.maxOpens).toBe(3);
    expect(out.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(out.url).toBe(`https://aesmsg.com/l/${out.id}`);
    // The server-returned url is persisted on the local record so the links UI copies the exact
    // shareable link the server minted rather than a locally-reconstructed one.
    expect(vi.mocked(recordSentLink)).toHaveBeenCalledWith(
      expect.objectContaining({ id: out.id, url: out.url }),
    );
  });

  it("WIRE INTEROP: a webapp-sealed blob opens with @aesmsg/crypto under the exact v2 context", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);
    const getPosted = stubCreate();
    const message = "meet me at the bridge 🔐 secrets=42";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const out = await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message,
      expiresAt,
      maxOpens: 1,
    });

    const posted = getPosted();
    if (!posted) throw new Error("fetch mock captured no body");
    const ciphertext = base64ToBytes(posted.ciphertext) as unknown as Parameters<typeof open>[0];
    // Reconstruct the SAME v2 binding context an SP3/mobile recipient would — NO createdAtMs.
    const plaintext = await open(ciphertext, recipient, {
      linkId: out.id,
      recipientPublicKey: recipientKey,
      expiresAtMs: new Date(posted.expiresAt).getTime(),
      maxOpens: posted.maxOpens,
    });
    expect(decodePayload(plaintext).text).toBe(message);
  });

  it("rejects an invalid recipient key BEFORE any network call", async () => {
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

  it("still resolves with the link when the best-effort local record write fails", async () => {
    const recipient = await generateIdentity();
    stubCreate();
    vi.mocked(recordSentLink).mockRejectedValueOnce(new Error("storage down"));

    const out = await createAndSeal({
      recipientPublicKeyString: exportPublicKey(recipient),
      message: "resilient",
      expiresAt: new Date(Date.now() + 60_000),
      maxOpens: 1,
    });
    expect(out.url).toBe(`https://aesmsg.com/l/${out.id}`);
  });
});
