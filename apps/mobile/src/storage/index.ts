// Barrel + production singleton wiring for the encrypted storage layer.
//
// getEncryptedStore() composes the real backends — FileBlobStore over expo-file-system/legacy and
// the shared DEK obtained from the hardware keychain via getOrCreateDEK — into ONE shared
// EncryptedStore, memoized for the app's lifetime. Domain stores (contacts / sent-links / settings)
// call getEncryptedStore() and separate themselves by key namespace; they never construct an
// EncryptedStore directly.
import * as LegacyFileSystem from "expo-file-system/legacy";
import { deleteDEK, getOrCreateDEK } from "@/src/storage/data-key";
import { EncryptedStore } from "@/src/storage/encrypted-store";
import { FileBlobStore, type FileSystemLike } from "@/src/storage/file-blob-store";
import { secureStore, WHEN_UNLOCKED_THIS_DEVICE_ONLY } from "@/src/storage/secure-store-impl";

export { deleteDEK, getOrCreateDEK } from "@/src/storage/data-key";
export { EncryptedStore } from "@/src/storage/encrypted-store";
export type {
  EncryptedStoreOptions,
  IBlobStore,
  ISecureStore,
  RandomBytes,
} from "@/src/storage/encrypted-store.types";
export { DecryptionError } from "@/src/storage/encrypted-store.types";
export { FileBlobStore } from "@/src/storage/file-blob-store";

let instance: Promise<EncryptedStore> | null = null;

async function buildEncryptedStore(): Promise<EncryptedStore> {
  const blobStore = new FileBlobStore(LegacyFileSystem as unknown as FileSystemLike);
  const dek = await getOrCreateDEK({
    secureStore,
    accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return new EncryptedStore({ blobStore, dek });
}

// Singleton accessor: builds the wired store once and reuses it. Concurrent callers during the
// initial build share the same in-flight promise (no double DEK fetch).
export async function getEncryptedStore(): Promise<EncryptedStore> {
  if (instance === null) {
    instance = buildEncryptedStore();
  }
  return instance;
}

// Wipe every encrypted blob AND the DEK so leftover metadata cannot be decrypted after an identity
// wipe. Resets the singleton so the next getEncryptedStore() regenerates a fresh DEK + store.
export async function wipeEncryptedStorage(): Promise<void> {
  const store = await getEncryptedStore();
  await store.clear();
  await deleteDEK({
    secureStore,
    accessibleWhenUnlockedThisDeviceOnly: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  instance = null;
}

// Test-only: drop the memoized singleton so each test (via tests/setup.ts) starts fresh.
export function __resetEncryptedStoreForTests(): void {
  instance = null;
}
