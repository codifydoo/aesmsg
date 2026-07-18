// Pure Pro/Free gate policy. No React, no native, no I/O — every gate is a pure function of `isPro`
// so it is unit-tested in plain Node and reused identically by the compose flow and the picker.
//
// Net-new / zero-clawback split (see the design spec): FREE keeps exactly today's behavior; PRO adds
// a larger attachment ceiling and custom expiry. Both gates are CLIENT-SIDE — the API has no identity
// and cannot tell Pro from Free, so these only shape the UI; the API's own ceiling is the hard cap.

/** Today's universal attachment cap (unchanged) — the FREE tier value. Mirrors the historical
 *  MAX_ATTACHMENT_BYTES in create/pick-attachment.ts. */
export const FREE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** PRO attachment cap. Requires the raised API/infra ceiling — the API hard cap must be >= this. */
export const PRO_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Max bytes a single attachment may be for the given tier. */
export function maxAttachmentBytes(isPro: boolean): number {
  return isPro ? PRO_ATTACHMENT_BYTES : FREE_ATTACHMENT_BYTES;
}

/** Whether the user may pick an arbitrary custom expiry date/time (Pro-only). */
export function allowsCustomExpiry(isPro: boolean): boolean {
  return isPro;
}
