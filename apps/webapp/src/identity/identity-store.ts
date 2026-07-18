import type { PublicKeyString, WrappedKey } from "@aesmsg/crypto";
import { withDB } from "./db";

/**
 * The single web identity persisted in IndexedDB. The ONLY key-bearing field is `wrapped` — the
 * Argon2id/AES-256-GCM envelope produced by `wrapPrivateKey`. The raw private key exists solely
 * inside that envelope's `ct` field; it is never stored in the clear and never as a `CryptoKey`.
 */
export interface StoredIdentity {
  /** SP1 supports a single web identity, keyed "primary". */
  readonly id: "primary";
  readonly publicKeyString: PublicKeyString;
  /** Opaque wrapped-key envelope (JSON string) — NEVER the raw private key. */
  readonly wrapped: WrappedKey;
  /** ISO 8601 UTC creation timestamp. */
  readonly createdAt: string;
  readonly schemaVersion: 1;
}

export async function saveIdentity(record: StoredIdentity): Promise<void> {
  await withDB<IDBValidKey>("readwrite", (store) => store.put(record));
}

export async function loadIdentity(id: StoredIdentity["id"]): Promise<StoredIdentity | null> {
  const record = await withDB<StoredIdentity | undefined>("readonly", (store) => store.get(id));
  return record ?? null;
}

export async function hasIdentity(id: StoredIdentity["id"]): Promise<boolean> {
  const key = await withDB<IDBValidKey | undefined>("readonly", (store) => store.getKey(id));
  return key !== undefined;
}

export async function deleteIdentity(id: StoredIdentity["id"]): Promise<void> {
  await withDB<undefined>("readwrite", (store) => store.delete(id));
}
