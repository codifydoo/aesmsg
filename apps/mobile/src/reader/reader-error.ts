import { ApiError } from "@/src/api/client";

// Finer-grained reader-error classification for the recipient flow's terminal screens.
//
// This is an ADDITIVE companion to reader-machine's `classifyOpenError` (which stays a coarse
// gone-vs-failed predicate for backward compatibility). It maps a thrown error — from either the
// metadata GET or the open POST + local decrypt — onto exactly one of the five terminal reader
// screens the design ships (LinkUnavailable / InvalidPayload / NetworkError / DecryptionFailed /
// AlreadyOpened). Kept free of React AND of @aesmsg/crypto (a DecryptionError is matched
// structurally by Error.name) so the whole decision can be unit-tested in plain Node.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// SECURITY INVARIANT — the classifier must never leak which a "no longer available" link is.
// The server deliberately collapses revoked / expired / max-opens-consumed into a single status
// (404 on the metadata GET, 410 on the open POST). There is therefore NO trustworthy signal that
// would tell a recipient "this was opened out" vs "this expired" vs "this was revoked", and we
// must not invent one. Consequently:
//   • every 404 / 410 → "gone" → the single opaque LinkUnavailable screen, and
//   • "already-opened" is provably NEVER produced by this classifier.
// The "already-opened" outcome exists ONLY so the (presentational) AlreadyOpened screen has a
// named outcome; it stays unwired until the API exposes a sanctioned, non-leaky exhausted signal.
// A 400 (bad_request) is a *structural* "this is not a aesmsg link" signal, not a metadata
// leak, so it safely maps to "invalid". A transport failure or transient server status (429/500,
// or an error with no HTTP status at all) consumed no open and is retryable → "network".

/** Which network step the error came from. Both collapse the same way; kept for call-site clarity. */
export type ReaderPhase = "metadata" | "open";

// The opaque terminal outcomes an error can resolve to. "already-opened" is intentionally present
// for the screen mapping but is NEVER returned by classifyReaderError (see the invariant above).
export type ReaderErrorOutcome = "gone" | "invalid" | "network" | "failed" | "already-opened";

// True for a DecryptionError (or its BadPassphraseError subclass) detected WITHOUT importing
// @aesmsg/crypto: both carry an Error name ending in "DecryptionError" / "PassphraseError".
// This is the wrong-key / no-recovery path and is only reachable after a 200 open response.
function isDecryptionFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "DecryptionError" || err.name === "BadPassphraseError";
}

/**
 * Classify a thrown reader error into one of the opaque terminal outcomes. Only a genuine
 * `ApiError` (with a server-confirmed status) is trusted to read its status; anything else — a
 * raw transport error, a non-Error throwable, or a structurally-similar plain object — degrades
 * to the safe "network" bucket (no open consumed, retryable). A DecryptionError on the open phase
 * is the only path to "failed" (wrong key). Pure + side-effect free for node-env unit tests.
 */
export function classifyReaderError(err: unknown, _phase: ReaderPhase): ReaderErrorOutcome {
  // Wrong key (local decrypt after a 200) — no recovery. Checked before the ApiError branch so a
  // DecryptionError can never be misread; it is not an ApiError so the branch below would treat it
  // as a transport failure otherwise.
  if (isDecryptionFailure(err)) return "failed";

  if (err instanceof ApiError) {
    // 410/404 collapse to the single opaque "gone" — never split (would leak revoked vs expired
    // vs opened-out). 400 is a structural "not a aesmsg link" → "invalid". Everything else a
    // server can return (429 rate-limit, 5xx) reached the server but consumed no open and is
    // retryable → "network".
    if (err.status === 410 || err.status === 404) return "gone";
    if (err.status === 400) return "invalid";
    return "network";
  }

  // No trusted HTTP status (raw fetch rejection, non-Error throwable, or a look-alike object):
  // treat as a transport failure. Nothing was decrypted and no open was consumed.
  return "network";
}

// The terminal reader screens an error outcome maps to. Mirrors the design screens:
//   gone           -> 30 Link Unavailable
//   invalid        -> 33 Invalid Payload
//   network        -> 32 Network Error (with Retry)
//   failed         -> 29 Decryption Failed (wrong key, no recovery)
//   already-opened -> 31 Already Opened (presentational; not produced by classifyReaderError)
export type ReaderErrorScreen = "gone" | "invalid" | "network" | "failed" | "already-opened";

export function screenForReaderError(outcome: ReaderErrorOutcome): ReaderErrorScreen {
  return outcome;
}
