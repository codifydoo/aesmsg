import { createHash, randomBytes } from "node:crypto";

// Authenticated revocation (BE-1 / R2).
//
// At create time the server mints a high-entropy secret revocation token, returns it to the creator
// ONCE (in the 201 body), and persists ONLY its SHA-256 hash. Revoke requires presenting the token
// in a request HEADER (never the body — the no-body invariant for /revoke stays). The server hashes
// the presented token and hands the store only the hash; the raw token never touches the store, so a
// leaked store can't revoke. Because the token is 192 bits of CSPRNG output, plain SHA-256 (no salt /
// KDF) is sufficient — there is nothing to brute-force.

/** Header carrying the secret revocation token on POST /api/messages/:id/revoke. */
export const REVOCATION_TOKEN_HEADER = "x-aesmsg-revocation-token";

/** Mint a 192-bit CSPRNG revocation token, base64url-encoded. Shown to the creator exactly once. */
export function mintRevocationToken(): string {
  return randomBytes(24).toString("base64url");
}

/** SHA-256 hex of the token. Only this is persisted; the raw token is never stored. */
export function hashRevocationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
