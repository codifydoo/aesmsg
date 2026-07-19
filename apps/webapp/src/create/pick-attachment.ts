// Sender-side attachment picking for the web compose flow (port of apps/mobile/src/create/
// pick-attachment.ts, adapted to the browser File API). The size policy + File → ComposeAttachment
// mapping live here, extracted from the React layer so they are unit-testable without a renderer.
//
// FREE-tier cap only: aesmsg Pro is deferred on web (spec §8), so there is NO 25 MiB PRO path — the
// web cap is the FREE cap, full stop. A single 10 MiB attachment pads to ~10.25 MiB plaintext →
// ~10.25 MiB ciphertext (well under the API's 26 MiB ciphertext cap) → ~13.7 MiB body (well under the
// 37 MiB body cap); comfortable headroom (D11 budget math). Picked bytes stay in memory only — they
// are sealed into the payload envelope and never written to storage or uploaded outside the sealed
// ciphertext.

/** Hard cap per attachment — the FREE tier value (mirrors FREE_ATTACHMENT_BYTES in mobile). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** A file the user selected, plaintext in memory, ready to seal into the payload envelope. */
export interface ComposeAttachment {
  readonly filename: string;
  readonly mimetype: string;
  readonly bytes: Uint8Array;
  readonly size: number;
}

export type SizeCheck = { readonly ok: true } | { readonly ok: false; readonly size: number };

/** True (ok) when `size` is within the cap; otherwise reports the offending size for the UI. */
export function validateAttachmentSize(
  size: number,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): SizeCheck {
  return size > maxBytes ? { ok: false, size } : { ok: true };
}

/** Human size for the file card + over-limit copy: MB (1 decimal) at/above 1 MiB, else KB. */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const DEFAULT_MIME = "application/octet-stream";

/** Strip any directory segments — the payload envelope stores basenames only. */
function basename(name: string): string {
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1] || name;
}

export type PickResult =
  | { readonly kind: "picked"; readonly attachment: ComposeAttachment }
  | { readonly kind: "too-large"; readonly filename: string; readonly size: number };

/**
 * Map a browser File to a ComposeAttachment, enforcing the FREE cap. A too-large file returns a
 * `too-large` result the UI surfaces — it is NEVER sealed. The metadata size is checked first (avoids
 * reading a huge file just to reject it), then the actual byte length after read.
 */
export async function fileToAttachment(
  file: File,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): Promise<PickResult> {
  const filename = basename(file.name) || "attachment.bin";
  if (!validateAttachmentSize(file.size, maxBytes).ok) {
    return { kind: "too-large", filename, size: file.size };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validateAttachmentSize(bytes.length, maxBytes).ok) {
    return { kind: "too-large", filename, size: bytes.length };
  }
  return {
    kind: "picked",
    attachment: {
      filename,
      mimetype: file.type || DEFAULT_MIME,
      bytes,
      size: bytes.length,
    },
  };
}
