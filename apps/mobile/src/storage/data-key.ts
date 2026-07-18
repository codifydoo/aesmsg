// The single app-level data-encryption key (DEK): 256 bits, generated once, held in the hardware
// keychain. Domains (contacts / sent-links / settings) share THIS one key and are separated only
// by the EncryptedStore's key namespace — see the design's "generated once" decision.
//
// Accessibility: WHEN_UNLOCKED_THIS_DEVICE_ONLY (no iCloud-Keychain sync, not carried into device
// backups) and explicitly NOT requireAuthentication — the DEK is deliberately NOT biometric-gated
// so routine metadata reads at app startup never trigger a Face ID prompt. It is a SEPARATE key
// from the biometric-gated device secret (device-secret.ts) that wraps the private key.
import { base64ToBytes, bytesToBase64 } from "@/src/lib/base64";
import type { ISecureStore, RandomBytes } from "@/src/storage/encrypted-store.types";

const DATA_KEY_STORE_KEY = "aesmsg.data-key";
const DEK_BYTES = 32; // 256-bit AES key

const defaultRandomBytes: RandomBytes = (length) => {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
};

export interface DataKeyDeps {
  secureStore: ISecureStore;
  // The native WHEN_UNLOCKED_THIS_DEVICE_ONLY constant, injected so node tests can pass a Symbol
  // sentinel and assert it was threaded through (mirrors device-secret.ts SECURE_OPTIONS).
  accessibleWhenUnlockedThisDeviceOnly: unknown;
  randomBytes?: RandomBytes;
}

// Idempotent: returns the existing DEK if one is stored, otherwise generates, persists, and
// returns a fresh 256-bit key. Never prompts biometrics.
export async function getOrCreateDEK(deps: DataKeyDeps): Promise<Uint8Array> {
  const options = {
    keychainAccessible: deps.accessibleWhenUnlockedThisDeviceOnly,
    requireAuthentication: false,
  };
  const existing = await deps.secureStore.getItemAsync(DATA_KEY_STORE_KEY, options);
  if (existing !== null) {
    return base64ToBytes(existing);
  }
  const random = deps.randomBytes ?? defaultRandomBytes;
  const dek = random(DEK_BYTES);
  await deps.secureStore.setItemAsync(DATA_KEY_STORE_KEY, bytesToBase64(dek), options);
  return dek;
}

// Removes the DEK from the keychain. After this, getOrCreateDEK regenerates a new one — which
// makes any already-stored encrypted blobs permanently unreadable. Called by the identity wipe so
// a wipe leaves no decryptable metadata residue.
export async function deleteDEK(
  deps: Pick<DataKeyDeps, "secureStore" | "accessibleWhenUnlockedThisDeviceOnly">,
): Promise<void> {
  await deps.secureStore.deleteItemAsync(DATA_KEY_STORE_KEY, {
    keychainAccessible: deps.accessibleWhenUnlockedThisDeviceOnly,
    requireAuthentication: false,
  });
}
