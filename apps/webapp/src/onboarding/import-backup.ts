import {
  BadPassphraseError,
  type IdentityKeypair,
  InvalidFormatError,
  unwrapPrivateKey,
  type WrappedKey,
} from "@aesmsg/crypto";

// Import / restore vertical (parity with apps/mobile/src/onboarding/import-backup.ts), adapted to the
// browser. The backup FILE is ciphertext — a WrappedKey JSON envelope sealed under a human passphrase
// with the heavy KDF. `unwrapPrivateKey` reads the KDF params back out of the envelope, so restore
// needs no params argument and a mobile backup (heavy params) opens on web unchanged. We never log or
// surface the recovered private key here; the caller hands the keypair (+ the raw envelope, which it
// adopts verbatim) to the identity context.

/** Outcome of a restore attempt. The screen maps each branch to inline copy and avoids try/catch. */
export type RestoreResult =
  | { readonly ok: true; readonly identity: IdentityKeypair }
  | { readonly ok: false; readonly reason: "bad-passphrase" | "invalid-file" };

/**
 * Decrypt a backup envelope with the entered passphrase. Wraps `unwrapPrivateKey` and maps its error
 * vocabulary to a result union so the screen can pick the right inline message:
 *   - `BadPassphraseError` (AEAD auth failure) → `"bad-passphrase"` — terminal, no recovery.
 *   - `InvalidFormatError` (not JSON / not a valid envelope) and ANY other throw → `"invalid-file"`.
 * Wrong passphrase is unrecoverable by design; this never crashes and never partially recovers.
 */
export async function restoreIdentity(wrapped: string, passphrase: string): Promise<RestoreResult> {
  try {
    const identity = await unwrapPrivateKey(wrapped as WrappedKey, passphrase);
    return { ok: true, identity };
  } catch (err) {
    if (err instanceof BadPassphraseError) return { ok: false, reason: "bad-passphrase" };
    // InvalidFormatError plus any unexpected throw collapse to the safe "not a valid backup" branch.
    if (err instanceof InvalidFormatError) return { ok: false, reason: "invalid-file" };
    return { ok: false, reason: "invalid-file" };
  }
}

/** Read the selected backup file as a UTF-8 string (the WrappedKey JSON envelope). Zero network. */
export async function readBackupFile(file: File): Promise<string> {
  return file.text();
}

/** Human size for the selected-file chip: MB (1 decimal) at/above 1 MiB, else KB. Mirrors mobile. */
export function formatBackupSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
