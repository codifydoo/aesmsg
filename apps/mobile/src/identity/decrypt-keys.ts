import { DecryptionError, type IdentityKeypair } from "@aesmsg/crypto";
import type { IdentityState } from "./identity-machine";

// Decrypt-fallback API for the recipient reader (roadmap 2.4).
//
// After a key rotation this device holds an ACTIVE keypair plus one or more RETIRED keypairs (the
// old private keys, retained so in-flight "legacy" links sealed to a previous public key still
// open). The reader must therefore try the active key first, then each retired key in turn, until a
// key decrypts — or all fail.
//
// The identity machine owns the keys; the reader (apps/mobile/src/reader + src/navigation, a
// different area) is the CONSUMER. It reads the ordered key set off the unlocked identity state via
// `allPrivateKeysForDecrypt(state)` (also exposed as `getAllPrivateKeysForDecrypt()` on the identity
// context) and decrypts with `decryptWithKeyFallback`.
//
// ONE-LINE CONSUMER CHANGE (reader, not owned here): in
// apps/mobile/src/navigation/ReaderFlow.tsx `decryptHeld`, replace
//     const output = await decryptOpenResponse(response, identity.identity, id);
// with
//     const output = await decryptWithKeyFallback(
//       allPrivateKeysForDecrypt(identity),
//       (key) => decryptOpenResponse(response, key, id),
//     );
// `decryptOpenResponse` already re-derives the AAD context from EACH tried key's own public key
// (exportPublicKey(identity)), so trying a retired key rebuilds the exact legacy binding it was
// sealed under — no other reader change is needed.

/**
 * The ordered set of private keys to attempt for decryption: the ACTIVE key first, then the RETIRED
 * keys (newest→oldest). Empty unless the identity is unlocked. Pure — reads only the state snapshot.
 */
export function allPrivateKeysForDecrypt(state: IdentityState): IdentityKeypair[] {
  if (state.status !== "unlocked") return [];
  return [state.identity, ...state.retiredKeypairs];
}

/**
 * Try `attempt` with each key in order, returning the first success. A `DecryptionError` (wrong key
 * — HPKE/AEAD failure, incl. `BadPassphraseError`) means "not this key" and advances to the next.
 * Any OTHER error is rethrown IMMEDIATELY: it can only come from a key that already decrypted (e.g.
 * a malformed payload after a successful open), so trying further keys would be wrong. If every key
 * yields a `DecryptionError` (or the set is empty), the final `DecryptionError` is thrown so the
 * reader routes to its opaque "decryption failed" terminal.
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
