import {
  encodePayload,
  type Fingerprint,
  fingerprint,
  importPublicKey,
  type MessageBindingContext,
  type PublicKeyString,
  seal,
} from "@aesmsg/crypto";
import { postMessage } from "@/src/api/client";
import { bytesToBase64 } from "@/src/lib/base64";
import { generateLinkId } from "@/src/lib/link-id";
import { recordSentLink } from "@/src/links/sent-links-store";

// Browser port of apps/mobile/src/create/create-and-seal.ts. The ordered sequence below
// (importPublicKey → fingerprint → generateLinkId → v2 MessageBindingContext → encodePayload → seal
// → postMessage → recordSentLink) is INTEROP-CRITICAL: it produces byte-identical ciphertext to the
// mobile app, so a webapp-sealed message opens on a mobile recipient's device and vice-versa.
//
// SP2 is text-only (D5): `encodePayload({ text, attachments: [] })`. The empty-attachments envelope
// is byte-identical to what mobile emits for a text-only message; SP5 will feed a non-empty array.

export interface CreateAndSealInput {
  recipientPublicKeyString: string;
  message: string;
  /** The single expiry Date used for BOTH the sealed AAD (expiresAtMs) and the uploaded expiresAt. */
  expiresAt: Date;
  /** Positive int, or -1 for unlimited. */
  maxOpens: number;
  /** Optional local-only label for the sender's link tracking (never uploaded). */
  label?: string | null;
}

export interface CreateAndSealOutput {
  id: string;
  /** The server-returned shareable link (aesmsg.com/l/<id>). */
  url: string;
  recipientFingerprint: Fingerprint;
}

export interface CreateAndSealOptions {
  /** External cancel signal — aborts the upload. */
  signal?: AbortSignal;
}

export async function createAndSeal(
  input: CreateAndSealInput,
  options: CreateAndSealOptions = {},
): Promise<CreateAndSealOutput> {
  // 1. Validate + parse the recipient key FIRST — a bad key throws here, before any network call.
  const recipient = await importPublicKey(input.recipientPublicKeyString);
  const recipientPk = input.recipientPublicKeyString as PublicKeyString;

  // 2. Fingerprint derived LOCALLY for display + the local record only; never sent to the server
  //    (recipient fingerprint is no longer stored server-side — metadata-leakage mitigation).
  const recipientFingerprint = await fingerprint(recipientPk);

  // 3. 16-char base64url link id (matches the server's LINK_ID_REGEX + the mobile generator).
  const id = generateLinkId();
  const expiresAtMs = input.expiresAt.getTime();

  // 4. v2 binding context — createdAtMs OMITTED so encodeAad deterministically selects AAD v2. The
  //    server stores/returns no createdAt for new links, so an SP3/mobile recipient rebuilds the v2
  //    AAD without it. Including createdAtMs would seal a v1 AAD the recipient could never rebuild.
  const context: MessageBindingContext = {
    linkId: id,
    recipientPublicKey: recipientPk,
    expiresAtMs,
    maxOpens: input.maxOpens,
  };

  // 5. Seal the v0x02 payload envelope (with its length-hiding pad trailer) — not raw text bytes.
  const plaintext = encodePayload({ text: input.message, attachments: [] });

  // 6. seal cross-checks that `recipient` and `context.recipientPublicKey` name the same X25519 key
  //    (throws RecipientMismatchError otherwise) and returns the wire ciphertext blob.
  const ciphertext = await seal(plaintext, recipient, context);

  // 7. Upload only ciphertext + minimal metadata. The server returns the one-time revocation token
  //    and the shareable url here — captured for the local record + the return value.
  const { url, revocationToken } = await postMessage(
    {
      id,
      ciphertext: bytesToBase64(ciphertext as unknown as Uint8Array),
      expiresAt: input.expiresAt.toISOString(),
      maxOpens: input.maxOpens,
    },
    options.signal ? { signal: options.signal } : {},
  );

  // 8. Record the link locally AFTER a successful POST — sender-derivable metadata only, plus the
  //    secret revocation token. Best-effort: a storage failure must NOT deny the user the link they
  //    just created (the POST already succeeded — the link exists server-side).
  try {
    await recordSentLink({
      id,
      recipientFingerprint,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      maxOpens: input.maxOpens,
      label: input.label ?? null,
      revocationToken,
      // Persist the server-returned url so the links list/details copy affordances use the exact
      // shareable link the server minted — never a locally-reconstructed one that could drift from
      // the server's AESMSG_PUBLIC_LINK_ORIGIN.
      url,
    });
  } catch {
    // Swallow: local history is secondary; the caller still gets the shareable link.
  }

  // 9. Shareable link = the server-returned url (the aesmsg.com bouncer host, NOT app.aesmsg.com).
  return { id, url, recipientFingerprint };
}
