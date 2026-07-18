import type { WrappedKey } from "@aesmsg/crypto";
import * as SecureStore from "expo-secure-store";
import { parseRetiredKeys, type RetiredKeyEntry, serializeRetiredKeys } from "./identity-bundle";

// Persists the SAME WrappedKey envelope the web app produces via wrapPrivateKey — only the
// storage backend differs (Keychain/Keystore here vs IndexedDB on web). The wrapped blob is
// itself AEAD-encrypted under the device secret, so storing it at rest is safe; we still keep
// it device-local: WHEN_UNLOCKED_THIS_DEVICE_ONLY pins the Keychain item so it is NOT synced to
// iCloud Keychain and NOT carried into encrypted device backups, so the envelope cannot migrate
// to another device. Unlike the device secret, the wrapped key does not require biometric to
// READ (it's useless without the secret, which IS biometric-gated), which keeps app startup
// cheap. WRAPPED_OPTIONS is passed on every access — write, read, and delete — so the
// accessibility class is enforced consistently (mirroring device-secret.ts's SECURE_OPTIONS).
const WRAPPED_IDENTITY_KEY = "aesmsg.wrapped-identity";

// Retired keys (rotation, roadmap 2.4) live in their OWN keychain item as a single versioned blob so
// each write is atomic (a single SecureStore item write is all-or-nothing). Each entry holds the old
// private key STILL device-secret-wrapped — same at-rest protection as the active key — plus its
// PUBLIC key / fingerprint / retirement time. The whole blob uses the identical device-local
// accessibility class as the active key, so retired private keys are never synced or backed up off
// device either.
const RETIRED_IDENTITIES_KEY = "aesmsg.retired-identities";

const WRAPPED_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function hasStoredIdentity(): Promise<boolean> {
  return (await SecureStore.getItemAsync(WRAPPED_IDENTITY_KEY, WRAPPED_OPTIONS)) !== null;
}

export async function saveWrappedIdentity(wrapped: WrappedKey): Promise<void> {
  await SecureStore.setItemAsync(WRAPPED_IDENTITY_KEY, wrapped, WRAPPED_OPTIONS);
}

export async function loadWrappedIdentity(): Promise<WrappedKey | null> {
  return (await SecureStore.getItemAsync(
    WRAPPED_IDENTITY_KEY,
    WRAPPED_OPTIONS,
  )) as WrappedKey | null;
}

export async function deleteWrappedIdentity(): Promise<void> {
  await SecureStore.deleteItemAsync(WRAPPED_IDENTITY_KEY, WRAPPED_OPTIONS);
}

export async function loadRetiredKeys(): Promise<RetiredKeyEntry[]> {
  return parseRetiredKeys(await SecureStore.getItemAsync(RETIRED_IDENTITIES_KEY, WRAPPED_OPTIONS));
}

export async function saveRetiredKeys(entries: RetiredKeyEntry[]): Promise<void> {
  await SecureStore.setItemAsync(
    RETIRED_IDENTITIES_KEY,
    serializeRetiredKeys(entries),
    WRAPPED_OPTIONS,
  );
}

export async function deleteRetiredKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(RETIRED_IDENTITIES_KEY, WRAPPED_OPTIONS);
}
