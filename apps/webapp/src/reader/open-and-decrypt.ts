import {
  type Ciphertext,
  decodePayload,
  exportPublicKey,
  type Fingerprint,
  fingerprint,
  type IdentityKeypair,
  type MessageBindingContext,
  open,
  type PayloadAttachment,
} from "@aesmsg/crypto";
import { openMessage } from "@/src/api/client";
import { base64ToBytes } from "@/src/lib/base64";

// Browser port of apps/mobile/src/reader/fetch-and-open.ts — the interop-critical open + decrypt.
// It reproduces the mobile sequence byte-for-byte, with the one deliberate divergence pinned in the
// plan (D2): NO metadata GET. Mobile GETs metadata first only to render a pre-open landing; the
// webapp landing is intentionally metadata-free (zero-network-before-action), and the decrypt needs
// ONLY the open response — so the reader's whole network footprint is exactly one POST /open.
//
// The AAD reconstruction here MUST stay identical to mobile + to SP2's seal, or a webapp/mobile
// message will not open: new links store no createdAt (createdAt: null) → the v2 AAD is rebuilt
// WITHOUT createdAtMs, matching the seal that OMITS it. Legacy v1 links return a createdAt string →
// the v1 AAD includes createdAtMs. Deterministic version selection, no fallback.
//
// Key-rotation fallback (mobile's decryptWithKeyFallback over retired keys) is OUT OF SCOPE — an
// SP1/SP2 web identity has exactly one active key; a DecryptionError is terminal.

export interface OpenAndDecryptOutput {
  text: string;
  attachments: PayloadAttachment[];
  /** The recipient's OWN fingerprint, derived locally — NEVER trusted from the server. */
  recipientFingerprint: Fingerprint;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}

/**
 * CONSUMES ONE OPEN, then decrypts locally. POST /open (the single open-consuming call) → rebuild
 * the binding context from the recipient's own public key + the open response → HPKE open() →
 * decodePayload. A successful open() proves the message was sealed for THIS identity.
 */
export async function openAndDecrypt(
  id: string,
  identity: IdentityKeypair,
): Promise<OpenAndDecryptOutput> {
  const response = await openMessage(id);

  const ownPublicKey = exportPublicKey(identity);

  // Deterministic AAD version (D2): v2 links return createdAt === null → omit createdAtMs; legacy v1
  // links return a createdAt string → bind it. No fallback.
  const baseContext = {
    linkId: id,
    recipientPublicKey: ownPublicKey,
    expiresAtMs: new Date(response.expiresAt).getTime(),
    maxOpens: response.maxOpens,
  };
  const context: MessageBindingContext =
    response.createdAt !== null
      ? { ...baseContext, createdAtMs: new Date(response.createdAt).getTime() }
      : baseContext;

  const ciphertext = base64ToBytes(response.ciphertext) as unknown as Ciphertext;
  const plaintextBytes = await open(ciphertext, identity, context);
  const payload = decodePayload(plaintextBytes);

  // The recipient fingerprint is the reader's OWN, derived locally — the server returns none.
  const recipientFingerprint = await fingerprint(ownPublicKey);

  return {
    text: payload.text,
    attachments: payload.attachments,
    recipientFingerprint,
    opensCount: response.opensCount,
    maxOpens: response.maxOpens,
    status: response.status,
  };
}
