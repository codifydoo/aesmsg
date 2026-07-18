export class DecryptionError extends Error {
  constructor(message = "Decryption failed") {
    super(message);
    this.name = "DecryptionError";
  }
}

export class InvalidFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFormatError";
  }
}

export class NotImplementedError extends Error {
  constructor(symbol: string) {
    super(`@aesmsg/crypto: ${symbol} is not implemented yet (Slice 2).`);
    this.name = "NotImplementedError";
  }
}

export class BadPassphraseError extends DecryptionError {
  constructor() {
    super("Wrong passphrase");
    this.name = "BadPassphraseError";
  }
}

/**
 * Sender-side API-misuse error: `seal()` was handed a `recipient` public key that does not match
 * `context.recipientPublicKey`. Sealing would encrypt to one key while binding the AAD to another,
 * producing a blob that the intended recipient can never decrypt (a silent availability footgun).
 *
 * This is deliberately NOT a `DecryptionError`: it is thrown loudly at seal time on the sender's
 * device, before any ciphertext exists, so a caller bug surfaces immediately instead of as an
 * unexplained "decryption failed" on the recipient's device days later.
 */
export class RecipientMismatchError extends Error {
  constructor() {
    super(
      "seal: recipient public key does not match context.recipientPublicKey — refusing to seal to one key while binding the AAD to another",
    );
    this.name = "RecipientMismatchError";
  }
}
