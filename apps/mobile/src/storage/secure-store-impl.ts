// Production ISecureStore adapter over expo-secure-store. Kept as a paper-thin pass-through so the
// rest of the storage layer depends only on the ISecureStore interface (and node tests inject a
// Map). WHEN_UNLOCKED_THIS_DEVICE_ONLY is re-exported so getEncryptedStore can hand it to the DEK
// module without every caller importing expo-secure-store directly.
import * as SecureStore from "expo-secure-store";
import type { ISecureStore, ISecureStoreOptions } from "@/src/storage/encrypted-store.types";

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

export const secureStore: ISecureStore = {
  getItemAsync(key: string, options?: ISecureStoreOptions) {
    return SecureStore.getItemAsync(key, options as SecureStore.SecureStoreOptions);
  },
  setItemAsync(key: string, value: string, options?: ISecureStoreOptions) {
    return SecureStore.setItemAsync(key, value, options as SecureStore.SecureStoreOptions);
  },
  deleteItemAsync(key: string, options?: ISecureStoreOptions) {
    return SecureStore.deleteItemAsync(key, options as SecureStore.SecureStoreOptions);
  },
};
