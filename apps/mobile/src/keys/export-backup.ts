import { DEFAULT_WRAP_KDF_PARAMS, type IdentityKeypair, wrapPrivateKey } from "@aesmsg/crypto";
import { CACHE_FILE_PREFIX } from "@/src/reader/attachment-cache";

// Export / backup vertical, extracted from the React layer so the security-critical wrap and the
// write→share file lifecycle can be unit-tested in plain Node without a renderer or the expo native
// modules (which fail Flow-parse under the node test runner). The screen injects the production
// modules; tests inject spies. Mirrors reader/attachment-cache.ts and onboarding/import-backup.ts.
//
// THE ONE DETAIL THAT MUST BE CORRECT — two independent wraps:
//   - At-rest device wrap (secure-store.ts): protected by a 256-bit device secret, so MOBILE_KDF_PARAMS
//     (light) is fine — there is nothing to brute-force.
//   - Export FILE wrap (here): protected by a LOW-entropy human passphrase, so it MUST use
//     DEFAULT_WRAP_KDF_PARAMS (heavy, 64 MiB / t=3) to make each offline guess expensive.
// On import, unwrapPrivateKey reads the KDF params back out of the envelope, so restore needs no
// params argument. The backup FILE is ciphertext (a WrappedKey JSON envelope); we never log or write
// the plaintext private key.

/** The fixed backup filename surfaced to the system share sheet. The `.aesmsg` extension is what the
 *  Import picker filters on; the body is an opaque WrappedKey JSON envelope (ciphertext). */
export const BACKUP_FILENAME = "aesmsg-identity-backup.aesmsg";

/** A built backup: the share filename plus the WrappedKey JSON envelope string (ciphertext). */
export interface BackupFile {
  readonly filename: typeof BACKUP_FILENAME;
  /** The WrappedKey JSON envelope, sealed under the user passphrase with DEFAULT_WRAP_KDF_PARAMS. */
  readonly contents: string;
}

/**
 * Re-seal the unlocked identity under the user's passphrase as a portable backup file. Uses
 * `DEFAULT_WRAP_KDF_PARAMS` (heavy) — NOT the light mobile at-rest params — because a human
 * passphrase is low-entropy and must be defended against offline brute force. Returns the fixed
 * filename and the WrappedKey JSON envelope as `contents`. Never returns or logs the private key.
 */
export async function buildBackup(
  identity: IdentityKeypair,
  passphrase: string,
): Promise<BackupFile> {
  const wrapped = await wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS);
  // `wrapped` is a branded string — the JSON envelope — so it is already the file body.
  return { filename: BACKUP_FILENAME, contents: wrapped as string };
}

// --- Native-module surfaces (minimal; tests inject spies) -------------------------------------

/** Subset of expo-file-system/legacy used to write the backup file and clean it up afterwards. */
export interface FileSystemLike {
  readonly cacheDirectory: string | null;
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}

/** Subset of expo-sharing used to hand the written file to the system share sheet. */
export interface SharingLike {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options?: { mimeType?: string; dialogTitle?: string }): Promise<void>;
}

export interface WriteAndShareDeps {
  readonly FileSystem: FileSystemLike;
  readonly Sharing: SharingLike;
}

/** The result of writing + sharing a backup: a cleanup hook that removes the written cache file. */
export interface WrittenBackup {
  /** The cache URI the backup file was written to. */
  readonly uri: string;
  /** Idempotently delete the written file. Call on unmount so the ciphertext file doesn't linger. */
  cleanup(): Promise<void>;
}

/**
 * Write the backup to a unique cache-dir path and return its `cleanup` hook — WITHOUT presenting the
 * share sheet. Write is split from share so the host can render the "Encrypted backup ready" success
 * sheet FIRST and only then present the system share sheet (design screen 41 MOTION: the success
 * sheet slides up, then the share sheet presents). `shareAsync` resolves only when the OS sheet is
 * dismissed, so writing-then-sharing in one await would invert that order.
 *
 * track-before-share: the URI is captured in the returned `cleanup` the moment the file is written,
 * before any handoff, so an early unmount can always reclaim the ciphertext file. The cache filename
 * carries CACHE_FILE_PREFIX so the Settings "Clear local history" sweep (clearAttachmentCache) also
 * reclaims a file orphaned by a crash. The body is ciphertext — never plaintext key bytes.
 */
export async function writeBackupToCache(
  deps: Pick<WriteAndShareDeps, "FileSystem">,
  backup: BackupFile,
): Promise<WrittenBackup> {
  const { FileSystem } = deps;
  const uri = `${FileSystem.cacheDirectory}${CACHE_FILE_PREFIX}${Date.now()}-${backup.filename}`;
  await FileSystem.writeAsStringAsync(uri, backup.contents);
  const cleanup = () => FileSystem.deleteAsync(uri, { idempotent: true });
  return { uri, cleanup };
}

/**
 * Present the system share sheet for an already-written backup file, gated on the platform share
 * sheet being available. The MIME is opaque `application/octet-stream` — the body is ciphertext, not
 * a recognizable key — and the dialog title comes from the design.
 *
 * A share rejection — expo-sharing rejects on a rapid double-tap when a sheet is already presented,
 * or on a platform error — is non-fatal and swallowed: the file is already written and the caller
 * holds its `cleanup` hook, so a rejection can never orphan the file or surface as an unhandled
 * rejection. Callers fire-and-forget this (after rendering the success sheet) so it never blocks UI.
 */
export async function shareBackup(
  deps: Pick<WriteAndShareDeps, "Sharing">,
  uri: string,
): Promise<void> {
  const { Sharing } = deps;
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/octet-stream",
        dialogTitle: "Save encrypted backup",
      });
    }
  } catch {
    // Intentionally ignored — a share rejection is non-fatal: the file is already written and the
    // caller still holds `cleanup`. Swallow so it can never orphan the file or surface unhandled.
  }
}
