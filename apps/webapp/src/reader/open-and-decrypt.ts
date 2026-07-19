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
import { decryptWithKeyFallback } from "@/src/identity/decrypt-keys";
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
// KEY-ROTATION FALLBACK (SP5): after a rotation this device holds an ACTIVE key plus RETAINED retired
// keys. The single open POST fires exactly once (zero-network-before-action, single-open guarantee
// unchanged); the local open()+decode is then wrapped in decryptWithKeyFallback over the whole key
// set. Each retried key re-derives its OWN AAD from its OWN public key (exportPublicKey(key)), so a
// retired key rebuilds the exact legacy binding it was sealed under. A total failure stays terminal
// (DecryptionFailed, no retry, no extra open).

export interface OpenAndDecryptOutput {
  text: string;
  attachments: PayloadAttachment[];
  /** The recipient's OWN fingerprint (of the key that decrypted), derived locally — NEVER from the server. */
  recipientFingerprint: Fingerprint;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}

/**
 * CONSUMES ONE OPEN, then decrypts locally. POST /open (the single open-consuming call) → for each
 * key in the ordered set (active first, then retired), rebuild the binding context from THAT key's
 * own public key + the open response → HPKE open() → decodePayload, stopping at the first key that
 * decrypts. A successful open() proves the message was sealed for that identity key.
 */
export async function openAndDecrypt(
  id: string,
  keys: readonly IdentityKeypair[],
): Promise<OpenAndDecryptOutput> {
  const response = await openMessage(id);
  const ciphertext = base64ToBytes(response.ciphertext) as unknown as Ciphertext;
  const expiresAtMs = new Date(response.expiresAt).getTime();
  // Deterministic AAD version (D2): v2 links return createdAt === null → omit createdAtMs; legacy v1
  // links return a createdAt string → bind it. No fallback.
  const createdAtMs = response.createdAt !== null ? new Date(response.createdAt).getTime() : null;

  const decrypted = await decryptWithKeyFallback(keys, async (key) => {
    const ownPublicKey = exportPublicKey(key);
    const baseContext = {
      linkId: id,
      recipientPublicKey: ownPublicKey,
      expiresAtMs,
      maxOpens: response.maxOpens,
    };
    const context: MessageBindingContext =
      createdAtMs !== null ? { ...baseContext, createdAtMs } : baseContext;

    const plaintextBytes = await open(ciphertext, key, context);
    const payload = decodePayload(plaintextBytes);
    // The recipient fingerprint is the reader's OWN (of the key that opened it), derived locally.
    const recipientFingerprint = await fingerprint(ownPublicKey);
    return { text: payload.text, attachments: payload.attachments, recipientFingerprint };
  });

  return {
    text: decrypted.text,
    attachments: decrypted.attachments,
    recipientFingerprint: decrypted.recipientFingerprint,
    opensCount: response.opensCount,
    maxOpens: response.maxOpens,
    status: response.status,
  };
}
