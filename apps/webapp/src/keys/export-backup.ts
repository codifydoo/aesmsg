import { DEFAULT_WRAP_KDF_PARAMS, type IdentityKeypair, wrapPrivateKey } from "@aesmsg/crypto";

// Backup export vertical (parity with apps/mobile/src/keys/export-backup.ts), adapted to the browser.
// The backup FILE is byte-format-identical to mobile: the WrappedKey JSON envelope produced by the
// SAME crypto call mobile makes — `wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS)`.
// Because both surfaces call the identical @aesmsg/crypto function with the same heavy KDF params,
// format parity is by construction; a mobile backup imports on web and vice-versa.
//
// THE ONE DETAIL THAT MUST BE CORRECT: the export FILE wrap uses DEFAULT_WRAP_KDF_PARAMS (heavy,
// 64 MiB / t=3) to defend a LOW-entropy human passphrase against offline brute force. On import,
// unwrapPrivateKey reads the KDF params back out of the envelope, so restore needs no params
// argument. The file body is ciphertext; we never log or write the plaintext private key.

/** The fixed backup filename (the exact mobile constant). The body is an opaque WrappedKey envelope. */
export const BACKUP_FILENAME = "aesmsg-identity-backup.aesmsg";

/** A built backup: the fixed filename plus the WrappedKey JSON envelope string (ciphertext). */
export interface BackupFile {
  readonly filename: typeof BACKUP_FILENAME;
  /** The WrappedKey JSON envelope, sealed under the passphrase with DEFAULT_WRAP_KDF_PARAMS. */
  readonly contents: string;
}

/**
 * Re-seal the unlocked identity under `passphrase` as a portable backup file. Uses
 * `DEFAULT_WRAP_KDF_PARAMS` (heavy) — the same call mobile makes — so the file format is identical
 * across surfaces. Returns the fixed filename + the WrappedKey JSON envelope as `contents`. Never
 * returns or logs the private key. Fresh random salt/iv means the file differs byte-wise from the
 * stored at-rest envelope, but it is the same format and opens with the same passphrase.
 */
export async function buildBackup(
  identity: IdentityKeypair,
  passphrase: string,
): Promise<BackupFile> {
  const wrapped = await wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS);
  // `wrapped` is a branded string — the JSON envelope — so it is already the file body.
  return { filename: BACKUP_FILENAME, contents: wrapped as string };
}

/**
 * Trigger a browser download of the backup file — ZERO network. A Blob (opaque
 * `application/octet-stream`, since the body is ciphertext) → `URL.createObjectURL` → a synthetic
 * `<a download>` click → the object URL is revoked on the next tick so no decrypted-key reference
 * lingers. No `fetch`, no upload: the encrypted file is produced and handed off entirely locally.
 */
export function downloadBackup({ filename, contents }: BackupFile): void {
  const blob = new Blob([contents], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Defer the revoke a tick so the click's download can start before the URL is freed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
