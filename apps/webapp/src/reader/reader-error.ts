import { ApiError, MalformedResponseError } from "@/src/api/client";

// Maps a thrown reader error — from the open POST or the LOCAL decrypt/decode — onto exactly one of
// the reader's terminal screens. Ported from apps/mobile/src/reader/reader-error.ts. Kept free of
// React AND of @aesmsg/crypto (a DecryptionError / InvalidFormatError is matched structurally by
// Error.name) so the whole decision is unit-testable in plain Node/browser.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// SECURITY INVARIANT — the classifier must never leak which a "no longer available" link is.
// The server deliberately collapses revoked / expired / max-opens-exhausted / never-existed into a
// SINGLE status (410 no_longer_available; 404 for the same). There is therefore NO trustworthy
// signal telling a recipient "this was opened out" vs "this expired" vs "this was revoked", and we
// must not invent one. Consequently:
//   • every 410 / 404 → "gone" → the single opaque LinkUnavailable screen (NEVER split), and
//   • an "already-opened" outcome is provably NEVER produced (the webapp ships no such screen).
// A 400 (bad_request) is a STRUCTURAL "this is not a aesmsg link" signal, not a metadata leak, so it
// safely maps to "invalid". A genuine transport failure or transient status (429/5xx, or a raw fetch
// rejection with no HTTP status at all) reached no valid 2xx, consumed no open, and is retryable →
// "network". (A malformed 2xx body is the exception — see the MalformedResponseError note below.)
//
// ONE INTENTIONAL DIVERGENCE FROM MOBILE'S classifyReaderError: mobile lumps a post-open
// InvalidFormatError into its failed/network path; the webapp routes it to the dedicated "invalid"
// (InvalidPayload) screen. A malformed-envelope signal is structural, not metadata, so this leaks
// nothing while giving the recipient the accurate "not a valid secure message" terminal.
//
// A MalformedResponseError needs the same treatment for a DIFFERENT reason: it is thrown ONLY after a
// 2xx (validateOpenMessageResponse runs on the parsed 200 body), so by the time we see it the server
// has ALREADY consumed this view-once open. Routing it to the retryable "network" bucket would show
// the recipient copy that promises no open was consumed and a Retry that would burn a second open. So
// a malformed 200 is a NON-retryable, structural "not a valid secure message" → "invalid". (The
// create/list classifier, classifyApiError, still treats it as "network" — those calls consume no open
// and a retry is safe; the divergence is deliberate and reader-specific.)

export type ReaderOutcome = "gone" | "invalid" | "network" | "failed";

// True for a DecryptionError (or its BadPassphraseError subclass) detected WITHOUT importing
// @aesmsg/crypto. This is the wrong-key / no-recovery path, only reachable after a 200 open.
function isDecryptionFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "DecryptionError" || err.name === "BadPassphraseError";
}

// True for a malformed payload envelope (@aesmsg/crypto's InvalidFormatError from decodePayload),
// matched by name so this module never imports the crypto package.
function isInvalidFormat(err: unknown): boolean {
  return err instanceof Error && err.name === "InvalidFormatError";
}

/**
 * Classify a thrown reader error into one opaque terminal outcome. Only a genuine `ApiError` (with a
 * server-confirmed status) is trusted to read its status; anything else — a raw transport error, a
 * non-Error throwable, or a look-alike object — degrades to the safe, retryable "network" bucket
 * (no open consumed). Pure + side-effect free.
 */
export function classifyReaderError(err: unknown): ReaderOutcome {
  // Wrong key (local decrypt after a 200) — no recovery. Checked FIRST: a DecryptionError is not an
  // ApiError, so the branch below would otherwise misread it as a transport failure.
  if (isDecryptionFailure(err)) return "failed";

  // Malformed envelope after a successful decrypt → structural "not a valid secure message".
  if (isInvalidFormat(err)) return "invalid";

  // A structurally-malformed 200 body (thrown ONLY after res.ok, i.e. after the open was consumed) is
  // NON-retryable and structural → "invalid". Checked BEFORE the transport fall-through so it is never
  // misfiled as retryable "network" (whose copy claims no open was consumed).
  if (err instanceof MalformedResponseError) return "invalid";

  if (err instanceof ApiError) {
    // 410/404 collapse to the single opaque "gone" — never split (would leak revoked vs expired vs
    // opened-out). 400 is a structural "not a aesmsg link" → "invalid". Everything else a server can
    // return (429 rate-limit, 5xx) reached the server but consumed no open → retryable "network".
    if (err.status === 410 || err.status === 404) return "gone";
    if (err.status === 400) return "invalid";
    return "network";
  }

  // No trusted HTTP status (raw fetch rejection, non-Error throwable, or a look-alike): a transport
  // failure. Nothing was decrypted and no open was consumed.
  return "network";
}
