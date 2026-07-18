import {
  type Ciphertext,
  decodePayload,
  exportPublicKey,
  fingerprint,
  type IdentityKeypair,
  type MessageBindingContext,
  open,
  type PayloadAttachment,
} from "@aesmsg/crypto";
import { type OpenMessageResponse, openMessage } from "@/src/api/client";
import { base64ToBytes } from "@/src/lib/base64";

// Mirrors apps/web/src/reader/fetch-and-open.ts: POST to consume one open, reconstruct the
// MessageBindingContext from the server's returned metadata, decrypt locally, then decode the
// payload envelope (so attachments come through alongside the text for free).
//
// FE-2 / R7: the POST and the local decrypt are split into two exported steps so the open-consuming
// call can be issued exactly once and its OPAQUE ciphertext HELD across a background lock (see
// open-coordinator.ts), then decrypted later — on resume — WITHOUT re-consuming an open. `fetchAndOpen`
// keeps the original one-shot signature for callers/tests that don't need to hold across an interrupt.
export interface FetchAndOpenInput {
  id: string;
  identity: IdentityKeypair;
}

export interface FetchAndOpenOutput {
  text: string;
  attachments: PayloadAttachment[];
  recipientFingerprint: string;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}

// Step 1 — CONSUMES one open. POSTs /open and returns the opaque ciphertext + open metadata. This is
// the only open-consuming call; the coordinator gates it to exactly one per intended read and holds
// the result across a reader unmount so an interruption never costs a second open.
export async function fetchOpenResponse(id: string): Promise<OpenMessageResponse> {
  return openMessage(id);
}

// Step 2 — CONSUMES NO open (pure-local, no network). Decrypts an already-fetched open response:
// reconstruct the binding context from the server metadata, decrypt with the recipient's private
// key, decode the payload envelope. Runs on resume against a HELD response with no second POST.
export async function decryptOpenResponse(
  response: OpenMessageResponse,
  identity: IdentityKeypair,
  id: string,
): Promise<FetchAndOpenOutput> {
  const ownPublicKey = exportPublicKey(identity);

  // Deterministic AAD version: legacy v1 links return createdAt (bound in their AAD); v2 links
  // return null, so we omit createdAtMs and open() reconstructs the v2 AAD. No fallback.
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

  const ciphertext = base64ToBytes(response.ciphertext);
  const plaintextBytes = await open(ciphertext as unknown as Ciphertext, identity, context);
  const payload = decodePayload(plaintextBytes);

  // A successful decrypt proves the message was sealed for THIS identity, so the recipient
  // fingerprint is the reader's own — derived locally, never trusted from the server.
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

// One-shot POST-then-decrypt, preserved for callers that open in a single step (no interruption
// handling). Composes the two steps above so behavior stays byte-identical.
export async function fetchAndOpen(input: FetchAndOpenInput): Promise<FetchAndOpenOutput> {
  const response = await fetchOpenResponse(input.id);
  return decryptOpenResponse(response, input.identity, input.id);
}
