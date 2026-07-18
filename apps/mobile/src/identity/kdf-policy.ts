import { readWrapKdfParams, type WrapKdfParams, type WrappedKey } from "@aesmsg/crypto";

// Mobile KDF policy — the single source of truth for how this device wraps its identity at rest.
//
// Mobile wraps the identity under a 256-bit CSPRNG device secret held in the biometric-gated Keychain
// (see device-secret.ts) — NOT a human passphrase. Argon2id's memory-hardness only buys security
// against LOW-entropy secrets that can be brute-forced; against a uniform 256-bit key there is nothing
// to guess (2^256), so the OWASP-interactive defaults (m=64 MiB) only cost ~1 min of pure-JS Argon2id
// on Hermes at every unlock for ZERO added security. We therefore wrap under light params on mobile.
// This is NOT a downgrade of message crypto or the at-rest AES-256-GCM wrap — only the KEK-derivation
// cost over an already-256-bit secret changes. The 2 MiB margin is kept as belt-and-suspenders. The
// WEB path keeps the heavy defaults (it wraps a real passphrase).
export const MOBILE_KDF_PARAMS: WrapKdfParams = { mKib: 2048, t: 1, p: 1 };

/**
 * Whether `wrapped` should be lazily re-wrapped under {@link MOBILE_KDF_PARAMS} after a successful
 * unlock — i.e. it was produced under heavier KDF cost than this device now uses (a pre-fix identity,
 * or one created by the web app under its passphrase-grade params). Reads the params straight from the
 * envelope without unwrapping. Throws `InvalidFormatError` on a malformed envelope; the unlock flow
 * calls this inside a best-effort try/catch so a corrupt envelope can never break unlock.
 *
 * Only `mKib` and `t` are compared: `p` (parallelism) has always been 1 everywhere and is not a cost
 * dimension that drives the Hermes stall, so it is intentionally excluded from the heuristic.
 */
export function needsRewrap(wrapped: WrappedKey): boolean {
  const params = readWrapKdfParams(wrapped);
  return params.mKib > MOBILE_KDF_PARAMS.mKib || params.t > MOBILE_KDF_PARAMS.t;
}
