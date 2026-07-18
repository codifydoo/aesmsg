// Length-hiding padding policy for the plaintext envelope.
//
// aesmsg's AEAD (AES-256-GCM) is length-preserving: a stored ciphertext blob is exactly
// `plaintext_len + 50` bytes (2 header + 32 encapsulated key + 16 GCM tag), so an unpadded
// blob's length leaks the plaintext length to anyone who can read the store. We close that by
// padding the plaintext envelope (inside the AEAD, invisible to the server) up to a fixed
// bucket BEFORE sealing — see payload.ts (PAYLOAD_VERSION 0x02).
//
// Policy: small fixed buckets cover the common token/note/config cases; above the largest
// fixed bucket we switch to Padmé (Nikitin et al., "Reducing Metadata Leakage from Encrypted
// Files and Communication with PURBs", PETS 2019), which caps padding overhead at ~12% while
// leaking only O(log log L) bits of length — fixed small buckets would explode overhead on the
// multi-MB attachment ceiling.
//
// Pure byte math: no DOM, no network, no storage (per the @aesmsg/crypto constraint).

export const PAD_BUCKETS = [256, 1024, 4096] as const;

const LARGEST_FIXED_BUCKET = PAD_BUCKETS[PAD_BUCKETS.length - 1];

/**
 * Padmé: round `len` up to the nearest multiple of 2^lastBits, where lastBits is chosen so the
 * representable padding granularity grows with the value. Always returns a value >= len.
 * Implemented with Math (not bitwise) so it stays correct past the 2^31 signed-int boundary.
 */
function padme(len: number): number {
  // Only called for len > LARGEST_FIXED_BUCKET, so len >= 2 and the logs are well-defined.
  const exponent = Math.floor(Math.log2(len));
  const mantissaBits = Math.floor(Math.log2(exponent)) + 1;
  const lastBits = exponent - mantissaBits;
  if (lastBits <= 0) return len;
  const blockSize = 2 ** lastBits;
  return Math.ceil(len / blockSize) * blockSize;
}

/**
 * Smallest padded length >= rawLen: the first fixed bucket that fits, else Padmé.
 *
 * Callers that append a length-prefixed pad trailer must pass the *trailer-inclusive* minimum
 * length (raw body + the bytes of the pad-length field) so that
 * `padLen = targetPaddedLen(minLen) - minLen` is always non-negative. See payload.ts.
 */
export function targetPaddedLen(rawLen: number): number {
  if (!Number.isInteger(rawLen) || rawLen < 0) {
    throw new Error(`targetPaddedLen: rawLen must be a non-negative integer, got ${rawLen}`);
  }
  for (const bucket of PAD_BUCKETS) {
    if (rawLen <= bucket) return bucket;
  }
  return padme(rawLen);
}

export { LARGEST_FIXED_BUCKET };
