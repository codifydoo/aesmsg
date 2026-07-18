import {
  type Ciphertext,
  DecryptionError,
  encodePayload,
  exportPublicKey,
  fingerprint,
  generateIdentity,
  importPublicKey,
  type MessageBindingContext,
  seal,
} from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "@/src/lib/base64";
import { fetchAndOpen } from "@/src/reader/fetch-and-open";

// fetchAndOpen -> @/src/api/client -> expo-constants, which (SDK 56) statically imports
// react-native; its Flow syntax cannot be parsed under Node vitest, so it MUST be mocked.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "" } } },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// encodeAad hard-requires a 16-char link id and expiresAtMs strictly greater than createdAtMs,
// so every fixture pins both. Using a fixed UTC base keeps the ISO strings deterministic.
const BASE_CREATED_AT_MS = Date.UTC(2026, 4, 10, 12, 0, 0);
const BASE_EXPIRES_AT_MS = BASE_CREATED_AT_MS + 24 * 60 * 60 * 1000;
const ID = "abcdefghijkl0123"; // exactly 16 chars, matches /^[A-Za-z0-9_-]{16}$/

interface ServerBodyOverrides {
  ciphertext: string;
  recipientFingerprint?: string;
  createdAt?: string;
  expiresAt?: string;
  opensCount?: number;
  maxOpens?: number;
  status?: "active" | "revoked" | "expired";
}

// The mobile reader hits openMessage -> fetch; mock ONLY globalThis.fetch with a JSON Response in
// the exact shape OpenMessageResponse expects. Crypto stays real.
function mockOpenResponse(body: ServerBodyOverrides): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        ciphertext: body.ciphertext,
        recipientFingerprint: body.recipientFingerprint ?? "fp-abc",
        createdAt: body.createdAt ?? new Date(BASE_CREATED_AT_MS).toISOString(),
        expiresAt: body.expiresAt ?? new Date(BASE_EXPIRES_AT_MS).toISOString(),
        opensCount: body.opensCount ?? 1,
        maxOpens: body.maxOpens ?? 1,
        status: body.status ?? "active",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
}

async function sealBase64(
  plaintext: Uint8Array,
  recipientPublicKeyString: string,
  context: MessageBindingContext,
): Promise<string> {
  const recipient = await importPublicKey(recipientPublicKeyString);
  const ct = await seal(plaintext, recipient, context);
  return bytesToBase64(ct as unknown as Ciphertext as unknown as Uint8Array);
}

describe("fetchAndOpen (interop with real @aesmsg/crypto, mocked fetch)", () => {
  it("decrypts an envelope payload with text and a file attachment", async () => {
    const recipientIdentity = await generateIdentity();
    const recipientPubkey = exportPublicKey(recipientIdentity);

    const context: MessageBindingContext = {
      linkId: ID,
      recipientPublicKey: recipientPubkey,
      createdAtMs: BASE_CREATED_AT_MS,
      expiresAtMs: BASE_EXPIRES_AT_MS,
      maxOpens: 1,
    };

    const envelope = encodePayload({
      text: "see attached",
      attachments: [
        {
          filename: "report.pdf",
          mimetype: "application/pdf",
          bytes: new Uint8Array([1, 2, 3, 4]),
        },
      ],
    });
    const ciphertext = await sealBase64(envelope, recipientPubkey, context);

    mockOpenResponse({ ciphertext, recipientFingerprint: "fp-abc", maxOpens: 1, opensCount: 1 });

    const result = await fetchAndOpen({ id: ID, identity: recipientIdentity });
    expect(result.text).toBe("see attached");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.filename).toBe("report.pdf");
    expect(result.attachments[0]?.mimetype).toBe("application/pdf");
    expect(Array.from(result.attachments[0]?.bytes ?? [])).toEqual([1, 2, 3, 4]);
    // The fingerprint is the reader's own, derived locally — not the value the server sent.
    expect(result.recipientFingerprint).toBe(await fingerprint(recipientPubkey));
    expect(result.opensCount).toBe(1);
    expect(result.maxOpens).toBe(1);
    expect(result.status).toBe("active");
  });

  it("decrypts a legacy non-enveloped plaintext message (attachments fall back to [])", async () => {
    const recipientIdentity = await generateIdentity();
    const recipientPubkey = exportPublicKey(recipientIdentity);

    const context: MessageBindingContext = {
      linkId: ID,
      recipientPublicKey: recipientPubkey,
      createdAtMs: BASE_CREATED_AT_MS,
      expiresAtMs: BASE_EXPIRES_AT_MS,
      maxOpens: 1,
    };

    // Legacy Phase-1 wire: raw UTF-8 text with no payload envelope. decodePayload's strict parse
    // rejects the missing version byte and falls back to legacy text.
    const legacyBytes = new TextEncoder().encode("legacy plaintext secret");
    const ciphertext = await sealBase64(legacyBytes, recipientPubkey, context);

    mockOpenResponse({ ciphertext });

    const result = await fetchAndOpen({ id: ID, identity: recipientIdentity });
    expect(result.text).toBe("legacy plaintext secret");
    expect(result.attachments).toEqual([]);
  });

  it("rejects with DecryptionError when sealed for a different recipient (wrong identity)", async () => {
    const recipientA = await generateIdentity();
    const recipientB = await generateIdentity();

    const contextA: MessageBindingContext = {
      linkId: ID,
      recipientPublicKey: exportPublicKey(recipientA),
      createdAtMs: BASE_CREATED_AT_MS,
      expiresAtMs: BASE_EXPIRES_AT_MS,
      maxOpens: 1,
    };

    const ciphertext = await sealBase64(
      new TextEncoder().encode("for A only"),
      exportPublicKey(recipientA),
      contextA,
    );

    mockOpenResponse({ ciphertext });

    await expect(fetchAndOpen({ id: ID, identity: recipientB })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("rejects with DecryptionError when the AAD link id does not match the seal", async () => {
    const recipient = await generateIdentity();
    const recipientPubkey = exportPublicKey(recipient);
    const sealLinkId = "Xaaaaaaaaaaaaaa1"; // 16 chars
    const fetchLinkId = "Yaaaaaaaaaaaaaa1"; // 16 chars, different

    const contextSeal: MessageBindingContext = {
      linkId: sealLinkId,
      recipientPublicKey: recipientPubkey,
      createdAtMs: BASE_CREATED_AT_MS,
      expiresAtMs: BASE_EXPIRES_AT_MS,
      maxOpens: 1,
    };

    const ciphertext = await sealBase64(
      new TextEncoder().encode("sealed-with-X"),
      recipientPubkey,
      contextSeal,
    );

    mockOpenResponse({ ciphertext });

    // fetchAndOpen reconstructs the AAD from fetchLinkId, so the link id binding mismatches.
    await expect(fetchAndOpen({ id: fetchLinkId, identity: recipient })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("rejects with DecryptionError when sealed maxOpens differs from the server-reported maxOpens", async () => {
    const recipient = await generateIdentity();
    const recipientPubkey = exportPublicKey(recipient);

    const contextSeal: MessageBindingContext = {
      linkId: ID,
      recipientPublicKey: recipientPubkey,
      createdAtMs: BASE_CREATED_AT_MS,
      expiresAtMs: BASE_EXPIRES_AT_MS,
      maxOpens: 1,
    };

    const ciphertext = await sealBase64(
      new TextEncoder().encode("maxOpens bound to 1"),
      recipientPubkey,
      contextSeal,
    );

    // Server reports maxOpens: 3, so fetchAndOpen reconstructs the AAD with a different maxOpens
    // than was sealed, and the AEAD tag fails.
    mockOpenResponse({ ciphertext, maxOpens: 3 });

    await expect(fetchAndOpen({ id: ID, identity: recipient })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("rejects with DecryptionError when sealed createdAt differs from the server-reported createdAt", async () => {
    const recipient = await generateIdentity();
    const recipientPubkey = exportPublicKey(recipient);

    const contextSeal: MessageBindingContext = {
      linkId: ID,
      recipientPublicKey: recipientPubkey,
      createdAtMs: BASE_CREATED_AT_MS,
      expiresAtMs: BASE_EXPIRES_AT_MS,
      maxOpens: 1,
    };

    const ciphertext = await sealBase64(
      new TextEncoder().encode("createdAt bound"),
      recipientPubkey,
      contextSeal,
    );

    // Server reports a createdAt one minute earlier than the sealed createdAtMs, so fetchAndOpen
    // reconstructs the AAD with a different createdAtMs and the time-binding AEAD tag fails. (The
    // shifted createdAt is still < the default expiresAt, so encodeAad's ordering invariant holds.)
    const shiftedCreatedAt = new Date(BASE_CREATED_AT_MS - 60_000).toISOString();
    mockOpenResponse({ ciphertext, createdAt: shiftedCreatedAt });

    await expect(fetchAndOpen({ id: ID, identity: recipient })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("rejects with DecryptionError when sealed expiresAt differs from the server-reported expiresAt", async () => {
    const recipient = await generateIdentity();
    const recipientPubkey = exportPublicKey(recipient);

    const contextSeal: MessageBindingContext = {
      linkId: ID,
      recipientPublicKey: recipientPubkey,
      createdAtMs: BASE_CREATED_AT_MS,
      expiresAtMs: BASE_EXPIRES_AT_MS,
      maxOpens: 1,
    };

    const ciphertext = await sealBase64(
      new TextEncoder().encode("expiresAt bound"),
      recipientPubkey,
      contextSeal,
    );

    // Server reports an expiresAt one hour later than the sealed expiresAtMs, so fetchAndOpen
    // reconstructs the AAD with a different expiresAtMs and the time-binding AEAD tag fails. (The
    // shifted expiresAt stays > the default createdAt, so encodeAad's ordering invariant holds.)
    const shiftedExpiresAt = new Date(BASE_EXPIRES_AT_MS + 60 * 60 * 1000).toISOString();
    mockOpenResponse({ ciphertext, expiresAt: shiftedExpiresAt });

    await expect(fetchAndOpen({ id: ID, identity: recipient })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });
});
