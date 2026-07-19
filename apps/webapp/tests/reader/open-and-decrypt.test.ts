import {
  encodePayload,
  exportPublicKey,
  fingerprint,
  generateIdentity,
  importPublicKey,
  type MessageBindingContext,
  type PublicKeyString,
  seal,
} from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "@/src/lib/base64";
import { openAndDecrypt } from "@/src/reader/open-and-decrypt";

const ID = "abcdefghijkl0123";

// Seal a v2 blob to `recipientPk` under the EXACT context an SP3/mobile recipient reconstructs (no
// createdAtMs), then stub globalThis.fetch so POST /open returns it in the OpenMessageResponse shape.
// Returns the fetch spy so callers can assert the single POST.
async function stubSealedOpen(opts: {
  recipientPk: string;
  text: string;
  attachments?: { filename: string; mimetype: string; bytes: Uint8Array }[];
  maxOpens?: number;
}) {
  const maxOpens = opts.maxOpens ?? 1;
  const expiresAtMs = Date.now() + 60 * 60 * 1000;
  const context: MessageBindingContext = {
    linkId: ID,
    recipientPublicKey: opts.recipientPk as PublicKeyString,
    expiresAtMs,
    maxOpens,
  };
  const recipient = await importPublicKey(opts.recipientPk);
  const sealed = await seal(
    encodePayload({ text: opts.text, attachments: opts.attachments ?? [] }),
    recipient,
    context,
  );

  const body = {
    ciphertext: bytesToBase64(sealed as unknown as Uint8Array),
    createdAt: null,
    expiresAt: new Date(expiresAtMs).toISOString(),
    opensCount: 1,
    maxOpens,
    status: "active" as const,
  };

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    expect(String(url)).toContain(`/api/messages/${ID}/open`);
    expect((init as RequestInit).method).toBe("POST");
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return fetchSpy;
}

describe("openAndDecrypt", () => {
  afterEach(() => vi.restoreAllMocks());

  it("WIRE INTEROP: opens a v2-sealed blob under the mobile-identical AAD reconstruction", async () => {
    const rid = await generateIdentity();
    const rpk = exportPublicKey(rid);
    const fetchSpy = await stubSealedOpen({ recipientPk: rpk, text: "SP3-INTEROP" });

    const out = await openAndDecrypt(ID, rid);

    expect(out.text).toBe("SP3-INTEROP");
    expect(out.attachments).toHaveLength(0);
    // Recipient fingerprint is the reader's OWN, derived locally — never from the server.
    expect(out.recipientFingerprint).toBe(await fingerprint(rpk));
    expect(out.status).toBe("active");
    // EXACTLY ONE POST — the single open-consuming call.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects with a DecryptionError when a DIFFERENT identity opens the ciphertext", async () => {
    const rid = await generateIdentity();
    const rpk = exportPublicKey(rid);
    await stubSealedOpen({ recipientPk: rpk, text: "for someone else" });

    const wrongIdentity = await generateIdentity();
    const err = await openAndDecrypt(ID, wrongIdentity).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("DecryptionError");
  });

  it("surfaces attachments intact without crashing (bytes preserved)", async () => {
    const rid = await generateIdentity();
    const rpk = exportPublicKey(rid);
    await stubSealedOpen({
      recipientPk: rpk,
      text: "hi",
      attachments: [
        { filename: "a.txt", mimetype: "text/plain", bytes: new Uint8Array([1, 2, 3]) },
      ],
    });

    const out = await openAndDecrypt(ID, rid);
    expect(out.text).toBe("hi");
    expect(out.attachments).toHaveLength(1);
    const attachment = out.attachments[0];
    expect(attachment?.filename).toBe("a.txt");
    expect(attachment ? Array.from(attachment.bytes) : []).toEqual([1, 2, 3]);
  });

  it("propagates an ApiError from a non-2xx /open (the reader classifies it)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "gone" }), {
        status: 410,
        headers: { "content-type": "application/json" },
      }),
    );
    const identity = await generateIdentity();
    const err = await openAndDecrypt(ID, identity).catch((e) => e);
    expect((err as { name?: string }).name).toBe("ApiError");
    expect((err as { status?: number }).status).toBe(410);
  });
});
