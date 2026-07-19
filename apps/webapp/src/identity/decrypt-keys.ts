import { DecryptionError, type IdentityKeypair } from "@aesmsg/crypto";

// Decrypt-fallback API for the recipient reader (parity with apps/mobile/src/identity/decrypt-keys.ts).
//
// After a key rotation this device holds an ACTIVE keypair plus one or more RETIRED keypairs (the
// old private keys, retained so in-flight "legacy" links sealed to a previous public key still
// open). The reader must therefore try the active key first, then each retired key in turn, until a
// key decrypts — or all fail.
//
// The identity context owns the keys (it exposes the ordered set via `getAllPrivateKeysForDecrypt()`);
// the reader (src/reader/open-and-decrypt.ts) is the CONSUMER. open-and-decrypt re-derives the AAD
// context from EACH tried key's own public key (exportPublicKey(key)), so trying a retired key
// rebuilds the exact legacy binding it was sealed under — no other reader change is needed.

/**
 * The ordered set of private keys to attempt for decryption: the ACTIVE key first, then the RETIRED
 * keys (newest→oldest). Pure — a thin ordered concatenation the identity context hands to the reader.
 */
export function allPrivateKeysForDecrypt(
  active: IdentityKeypair,
  retired: readonly IdentityKeypair[],
): IdentityKeypair[] {
  return [active, ...retired];
}

/**
 * Try `attempt` with each key in order, returning the first success. A `DecryptionError` (wrong key
 * — HPKE/AEAD failure) means "not this key" and advances to the next. Any OTHER error is rethrown
 * IMMEDIATELY: it can only come from a key that already decrypted (e.g. a malformed payload after a
 * successful open), so trying further keys would be wrong. If every key yields a `DecryptionError`
 * (or the set is empty), the final `DecryptionError` is thrown so the reader routes to its opaque
 * "decryption failed" terminal.
 */
export async function decryptWithKeyFallback<T>(
  keys: readonly IdentityKeypair[],
  attempt: (key: IdentityKeypair) => Promise<T>,
): Promise<T> {
  let lastError: DecryptionError = new DecryptionError();
  for (const key of keys) {
    try {
      return await attempt(key);
    } catch (err) {
      if (err instanceof DecryptionError) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
