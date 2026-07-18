import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time equality of two hex-encoded hashes (BE-1 / R2).
 *
 * Both operands are SHA-256 hex digests of a revocation token (the stored one and the SHA-256 of the
 * token presented on revoke). Comparing hashes rather than raw tokens is already preimage-resistant,
 * but the comparison still runs in constant time so a timing side channel can't probe the stored
 * hash byte-by-byte. A length mismatch (or empty input) returns false without invoking the
 * byte-wise compare — in practice both are always 32-byte digests, so this branch is defensive only.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
