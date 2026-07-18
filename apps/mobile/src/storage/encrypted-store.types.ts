// Contract module for the encrypted storage layer. No runtime dependencies, no React, no
// native modules — only types and the typed error, so every other storage file (and the
// domain stores in later phases) can import these without pulling in expo-* surfaces.

// Minimal key/value blob backend. Production is backed by expo-file-system (one .enc file per
// key); node tests inject an in-memory Map. Values are opaque base64 strings — the EncryptedStore
// owns all crypto, the blob store only persists bytes-as-string.
export interface IBlobStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  // Remove every key this store owns (used by EncryptedStore.clear() and identity wipe).
  clear(): Promise<void>;
  // Enumerate currently-stored keys so clear() can delete every namespace blob.
  keys(): Promise<string[]>;
}

// Minimal keychain surface used to hold the DEK. Production is expo-secure-store; node tests
// inject an in-memory implementation. The accessibility class is passed through verbatim so the
// DEK is pinned device-local (see data-key.ts).
export interface ISecureStoreOptions {
  keychainAccessible?: unknown;
  requireAuthentication?: boolean;
}

export interface ISecureStore {
  getItemAsync(key: string, options?: ISecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: ISecureStoreOptions): Promise<void>;
  deleteItemAsync(key: string, options?: ISecureStoreOptions): Promise<void>;
}

// Source of cryptographically-strong random bytes. Production wires crypto.getRandomValues
// (installed on Hermes by the Web Crypto polyfill at app entry, mirroring device-secret.ts and
// link-id.ts); node tests can pass the real ambient implementation. Returns a fresh Uint8Array.
export type RandomBytes = (length: number) => Uint8Array;

export interface EncryptedStoreOptions {
  // The blob backend (file-system in prod, Map in tests).
  blobStore: IBlobStore;
  // The raw 256-bit AES-GCM key material. The EncryptedStore never derives or stores it; the
  // caller (getEncryptedStore) obtains it from getOrCreateDEK().
  dek: Uint8Array;
  // Random nonce source. Defaults to crypto.getRandomValues when omitted.
  randomBytes?: RandomBytes;
}

// Thrown when a stored blob cannot be authenticated/decrypted: GCM auth-tag mismatch (tamper),
// malformed framing, or a wrong/rotated DEK. Distinct from @aesmsg/crypto's DecryptionError —
// this is the storage-layer domain error, surfaced as a non-fatal "couldn't load" UI state, never
// a silent wipe and never a startup crash.
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}
