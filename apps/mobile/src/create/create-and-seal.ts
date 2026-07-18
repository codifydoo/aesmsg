import {
  encodePayload,
  type Fingerprint,
  fingerprint,
  importPublicKey,
  type MessageBindingContext,
  type PayloadAttachment,
  type PublicKeyString,
  seal,
} from "@aesmsg/crypto";
import { LINK_ORIGIN, postMessage } from "@/src/api/client";
import type { EncryptingPhase } from "@/src/create/encrypting-steps";
import type { ComposeAttachment } from "@/src/create/pick-attachment";
import { bytesToBase64 } from "@/src/lib/base64";
import { generateLinkId } from "@/src/lib/link-id";
import { recordSentLink } from "@/src/links/sent-links-store";

export interface CreateAndSealInput {
  recipientPublicKeyString: string;
  message: string;
  expiresAt: Date;
  maxOpens: number;
  /** Optional human label for the sender's local link tracking (never sent to the server). */
  label?: string | null;
  /** Optional single attachment, sealed inside the payload envelope alongside the text. */
  attachment?: ComposeAttachment | null;
}

export interface CreateAndSealOutput {
  id: string;
  url: string;
  recipientFingerprint: Fingerprint;
}

export interface CreateAndSealOptions {
  /**
   * Fires as the seal pipeline crosses each real phase boundary (prepare → encrypt → upload) so the
   * Encrypting overlay can reflect the ACTUAL active phase. "upload" fires only once the upload is
   * about to run — never before — so the UI never claims to be uploading while it is still sealing.
   */
  onPhase?: (phase: EncryptingPhase) => void;
  /** External cancel signal (the "Cancel" button on the Encrypting overlay). Aborts the upload. */
  signal?: AbortSignal;
  /** Upload timeout in ms; omitted → the client's DEFAULT_UPLOAD_TIMEOUT_MS. */
  timeoutMs?: number;
}

export async function createAndSeal(
  input: CreateAndSealInput,
  options: CreateAndSealOptions = {},
): Promise<CreateAndSealOutput> {
  options.onPhase?.("prepare");
  // Validate + parse the recipient key FIRST — a bad key throws here, before any network call.
  const recipient = await importPublicKey(input.recipientPublicKeyString);
  const recipientPk = input.recipientPublicKeyString as PublicKeyString;
  // Derived locally for the caller's return value only; never sent to the server (recipient_fp
  // is no longer stored — metadata-leakage mitigation).
  const recipientFingerprint = await fingerprint(recipientPk);

  const id = generateLinkId();
  const expiresAtMs = input.expiresAt.getTime();

  // v2 binding context: createdAtMs omitted so seal() uses the v2 AAD (nothing for the server
  // to store).
  const context: MessageBindingContext = {
    linkId: id,
    recipientPublicKey: recipientPk,
    expiresAtMs,
    maxOpens: input.maxOpens,
  };

  const attachments: PayloadAttachment[] = input.attachment
    ? [
        {
          filename: input.attachment.filename,
          mimetype: input.attachment.mimetype,
          bytes: input.attachment.bytes,
        },
      ]
    : [];
  const plaintext = encodePayload({ text: input.message, attachments });
  options.onPhase?.("encrypt");
  const ciphertext = await seal(plaintext, recipient, context);

  // Only now, with the ciphertext in hand, does the upload actually begin — so the overlay's
  // "Uploading ciphertext" step is honest (never shown before this point).
  options.onPhase?.("upload");
  // The server returns the secret revocation token (BE-1 / R2) exactly once, here. Capture it and
  // persist it with the local record — it is the ONLY way to revoke this link later.
  const { revocationToken } = await postMessage(
    {
      id,
      ciphertext: bytesToBase64(ciphertext as unknown as Uint8Array),
      expiresAt: input.expiresAt.toISOString(),
      maxOpens: input.maxOpens,
    },
    {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.timeoutMs != null ? { timeoutMs: options.timeoutMs } : {}),
    },
  );

  // Record the link locally for the Links tab AFTER a successful POST (so a failed upload leaves no
  // orphan tracking row). Sender-derivable metadata only — id, recipient fingerprint, expiry,
  // max-opens, createdAt, optional local label, and the secret revocation token (persisted only in
  // the encrypted-at-rest sent-links blob). Plaintext is never recorded.
  // Best-effort: a storage failure (e.g. encrypted-storage write error) must NOT deny the user the
  // link they just created. The POST already succeeded — the link exists server-side.
  try {
    await recordSentLink({
      id,
      recipientFingerprint,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      maxOpens: input.maxOpens,
      label: input.label ?? null,
      revocationToken,
    });
  } catch {
    // Swallow: local history is secondary; the caller still gets the shareable link.
  }

  // The link must point at the WEB host so a recipient without the app falls back to the web
  // reader, and a recipient with the app deep-links in. LINK_ORIGIN is the universal-link host
  // (aesmsg.com) — NOT BASE_URL, which is the API host the app cannot intercept.
  return { id, url: `${LINK_ORIGIN}/l/${id}`, recipientFingerprint };
}
