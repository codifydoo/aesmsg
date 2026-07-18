// AES-256-GCM JSON blob store. No React, no domain knowledge, no native modules — the blob
// backend, the raw DEK, and the random source are all injected (see EncryptedStoreOptions). Wire
// framing is base64( nonce[12] ‖ ciphertext+tag ), one frame per stored key.
import { base64ToBytes, bytesToBase64 } from "@/src/lib/base64";
import {
  DecryptionError,
  type EncryptedStoreOptions,
  type IBlobStore,
  type RandomBytes,
} from "@/src/storage/encrypted-store.types";

// AES-GCM standard nonce length. 12 bytes is the GCM-recommended IV size; we generate a fresh one
// per write (nonce reuse under a fixed key is catastrophic for GCM, so this is non-negotiable).
const NONCE_LEN = 12;

// Default random source: the Web Crypto getRandomValues installed on Hermes at app entry, and
// present natively under Node 22 test runs. Mirrors device-secret.ts / link-id.ts.
const defaultRandomBytes: RandomBytes = (length) => {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
};

export class EncryptedStore {
  private readonly blobStore: IBlobStore;
  private readonly dek: Uint8Array;
  private readonly randomBytes: RandomBytes;
  // Cached CryptoKey so subtle.importKey runs once, not on every read/write.
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(options: EncryptedStoreOptions) {
    this.blobStore = options.blobStore;
    this.dek = options.dek;
    this.randomBytes = options.randomBytes ?? defaultRandomBytes;
  }

  private async cryptoKey(): Promise<CryptoKey> {
    if (this.keyPromise === null) {
      // Copy into a fresh ArrayBuffer-backed view so importKey gets a clean BufferSource.
      const raw = new Uint8Array(this.dek);
      this.keyPromise = crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt",
      ]);
    }
    return this.keyPromise;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const framed = await this.blobStore.get(key);
    if (framed === null) return null;

    let frame: Uint8Array;
    try {
      frame = base64ToBytes(framed);
    } catch {
      throw new DecryptionError(`blob for key "${key}" has invalid base64 framing`);
    }
    if (frame.length <= NONCE_LEN) {
      throw new DecryptionError(`blob for key "${key}" is too short to contain a nonce`);
    }

    const nonce = frame.subarray(0, NONCE_LEN);
    const body = frame.subarray(NONCE_LEN);
    const cryptoKey = await this.cryptoKey();

    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(nonce) },
        cryptoKey,
        new Uint8Array(body),
      );
    } catch {
      // GCM auth-tag mismatch (tamper), wrong DEK, or truncated body all land here.
      throw new DecryptionError(`blob for key "${key}" failed to decrypt`);
    }

    try {
      const json = new TextDecoder().decode(plaintext);
      return JSON.parse(json) as T;
    } catch {
      // Authenticated bytes that are nevertheless not valid JSON: treat as corruption, not a crash.
      throw new DecryptionError(`blob for key "${key}" decrypted to invalid JSON`);
    }
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const nonce = this.randomBytes(NONCE_LEN);
    const cryptoKey = await this.cryptoKey();
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new Uint8Array(nonce) },
        cryptoKey,
        plaintext,
      ),
    );
    const frame = new Uint8Array(nonce.length + cipher.length);
    frame.set(nonce, 0);
    frame.set(cipher, nonce.length);
    await this.blobStore.set(key, bytesToBase64(frame));
  }

  async remove(key: string): Promise<void> {
    await this.blobStore.remove(key);
  }

  async clear(): Promise<void> {
    await this.blobStore.clear();
  }
}
