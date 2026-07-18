import {
  exportRawPublicKey,
  generateRawKeypair,
  importRawPublicKey,
  type RawKeypair,
} from "./hpke";
import type { IdentityKeypair, PublicKeyString, RecipientPublicKey } from "./types";
import { decodePubkey, encodePubkey } from "./wire";

type IdentityImpl = RawKeypair & {
  readonly publicKeyRaw: Uint8Array;
  readonly publicKeyString: PublicKeyString;
};

type RecipientImpl = {
  readonly rawKey: Uint8Array;
  readonly cryptoKey: CryptoKey;
};

export async function generateIdentity(): Promise<IdentityKeypair> {
  const kp = await generateRawKeypair();
  const publicKeyRaw = await exportRawPublicKey(kp.publicKey);
  const publicKeyString = encodePubkey(publicKeyRaw) as PublicKeyString;
  const impl: IdentityImpl = {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    publicKeyRaw,
    publicKeyString,
  };
  return impl as unknown as IdentityKeypair;
}

export function exportPublicKey(id: IdentityKeypair): PublicKeyString {
  const impl = id as unknown as IdentityImpl;
  return impl.publicKeyString;
}

export async function importPublicKey(s: string): Promise<RecipientPublicKey> {
  const { rawKey } = decodePubkey(s);
  const cryptoKey = await importRawPublicKey(rawKey);
  const impl: RecipientImpl = { rawKey, cryptoKey };
  return impl as unknown as RecipientPublicKey;
}

export function __getIdentityImpl(id: IdentityKeypair): IdentityImpl {
  return id as unknown as IdentityImpl;
}

export function __getRecipientImpl(r: RecipientPublicKey): RecipientImpl {
  return r as unknown as RecipientImpl;
}
