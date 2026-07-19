// Opaque, metadata-free reader copy. Dependency-free ON PURPOSE (no React import) so the exact
// approved strings can be asserted in Node/browser vitest, and mirrors apps/mobile/src/reader/copy.ts.
//
// SECURITY INVARIANT: these strings surface on the failure / gone screens, which must leak NO
// server-derived metadata — no fingerprint, id, status, open count, or expiry. They are constants,
// never interpolated with anything from the API.

// Single opaque message for revoked / expired / max-opens-reached / never-existed. The exact
// wording is fixed by CLAUDE.md — never reveal which of those a link is. EXACT string.
export const LINK_UNAVAILABLE_COPY = "This secure link is no longer available.";

// Failed-decrypt body. States there is no recovery; carries no server-derived metadata. Wrong key /
// wrong identity is unrecoverable on this device — no fallback, no "are you sure".
export const DECRYPTION_FAILED_COPY =
  "This message could not be decrypted with your identity. It was sealed for a different key. " +
  "There is no recovery.";

// Structural "this is not a aesmsg link" terminal (a 400, a bad id, or a malformed envelope). A
// structural signal, not a metadata leak.
export const INVALID_PAYLOAD_TITLE = "This doesn't look like a valid secure message";
export const INVALID_PAYLOAD_BODY = "The link may be incomplete or wasn't created by aesmsg.";

// Transport-failure terminal (retryable — no open was consumed). The reassurance uses the calm/safe
// tone, never an alarming red, because nothing was decrypted and the link is intact.
export const NETWORK_ERROR_TITLE = "Couldn't fetch the encrypted message";
export const NETWORK_ERROR_HINT = "No open was consumed.";
