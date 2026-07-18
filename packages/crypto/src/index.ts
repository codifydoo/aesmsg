import type {
  Ciphertext,
  Fingerprint,
  IdentityKeypair,
  PublicKeyString,
  RecipientPublicKey,
  WrappedKey,
} from "./types";

export type { MessageBindingContext } from "./aad";
// AAD_VERSION and encodeAad are intentionally NOT re-exported. The whole point of the
// MessageBindingContext API is that callers hand off a typed struct and never touch the
// canonical AAD bytes. Tests that need them import from ./aad directly.
export {
  BadPassphraseError,
  DecryptionError,
  InvalidFormatError,
  NotImplementedError,
  RecipientMismatchError,
} from "./errors";
export { compareFingerprint, fingerprint, truncateFingerprint } from "./fingerprint";
export { exportPublicKey, generateIdentity, importPublicKey } from "./identity";
export { PAD_BUCKETS, targetPaddedLen } from "./pad";
export type { Payload, PayloadAttachment } from "./payload";
export { decodePayload, encodePayload, PAYLOAD_VERSION } from "./payload";
export { open, seal } from "./seal";
export type { WrapKdfParams } from "./wrap";
export {
  DEFAULT_WRAP_KDF_PARAMS,
  readWrapKdfParams,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "./wrap";
export type {
  Ciphertext,
  Fingerprint,
  IdentityKeypair,
  PublicKeyString,
  RecipientPublicKey,
  WrappedKey,
};
