import { encodeAad, type MessageBindingContext } from "./aad";
import { DecryptionError, RecipientMismatchError } from "./errors";
import { openHpke, sealHpke } from "./hpke";
import { __getIdentityImpl, __getRecipientImpl } from "./identity";
import type { Ciphertext, IdentityKeypair, RecipientPublicKey } from "./types";
import { decodeCiphertextBlob, decodePubkey, encodeCiphertextBlob } from "./wire";

// Plain byte compare — both operands are PUBLIC keys, so constant-time is not required. This only
// guards against the caller wiring `recipient` and `context.recipientPublicKey` to different keys.
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function seal(
  plaintext: Uint8Array,
  recipient: RecipientPublicKey,
  context: MessageBindingContext,
): Promise<Ciphertext> {
  const r = __getRecipientImpl(recipient);
  // SEC-2: `seal` seals HPKE to `recipient` but binds the AAD recipient-hash to the INDEPENDENT
  // `context.recipientPublicKey`. If the two disagree we would encrypt to key A while binding the
  // AAD to key B — the holder of A reconstructs the AAD from their own key and fails to decrypt, a
  // silent availability footgun that only surfaces on the recipient's device. Assert the two name
  // the same X25519 key here and fail loudly at seal time. `decodePubkey` also throws (loudly) if
  // `context.recipientPublicKey` is not a well-formed amk1 key.
  const { rawKey: contextRaw } = decodePubkey(context.recipientPublicKey);
  if (!bytesEqual(r.rawKey, contextRaw)) {
    throw new RecipientMismatchError();
  }
  const aad = await encodeAad(context);
  const { enc, aeadOutput } = await sealHpke(r.cryptoKey, plaintext, aad);
  return encodeCiphertextBlob(enc, aeadOutput) as unknown as Ciphertext;
}

export async function open(
  ciphertext: Ciphertext,
  id: IdentityKeypair,
  context: MessageBindingContext,
): Promise<Uint8Array> {
  // SEC-4: `encodeAad` throws a plain field-naming Error on server-supplied bad metadata
  // (maxOpens: 0, expiresAtMs <= createdAtMs, non-integers, ...). That must classify as a TERMINAL
  // decrypt failure, not a retryable "network error", so it is inside the try that maps to
  // DecryptionError just like the KEM/AEAD failure below.
  let aad: Uint8Array;
  try {
    aad = await encodeAad(context);
  } catch {
    throw new DecryptionError();
  }
  const blob = ciphertext as unknown as Uint8Array;
  let parsed: { enc: Uint8Array; aeadOutput: Uint8Array };
  try {
    parsed = decodeCiphertextBlob(blob);
  } catch {
    throw new DecryptionError();
  }
  const impl = __getIdentityImpl(id);
  try {
    return await openHpke(impl.privateKey, parsed.enc, parsed.aeadOutput, aad);
  } catch {
    throw new DecryptionError();
  }
}
