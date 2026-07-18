import {
  BadPassphraseError,
  type IdentityKeypair,
  InvalidFormatError,
  unwrapPrivateKey,
  type WrappedKey,
} from "@aesmsg/crypto";

// Import / restore vertical, extracted from the React layer so the security-critical decrypt and the
// native-picker → SelectedBackup mapping can be unit-tested in plain Node without a renderer or the
// expo native modules (which fail Flow-parse under the node test runner). The screen injects the
// production modules; tests inject spies. Mirrors create/pick-attachment.ts and
// reader/attachment-cache.ts.
//
// The backup FILE is ciphertext — a WrappedKey JSON envelope sealed under a human passphrase with the
// heavy KDF (DEFAULT_WRAP_KDF_PARAMS). unwrapPrivateKey reads the KDF params back out of the envelope,
// so restore needs no params argument. We never log or surface the recovered private key here; the
// caller hands the keypair straight to the identity machine for at-rest re-wrap.

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

/** Human size for the selected-file chip: MB (1 decimal) at/above 1 MiB, else KB. Matches the
 *  attachment-card formatter in create/pick-attachment.ts so the two file chips read identically. */
export function formatBackupSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// --- Native-module surfaces (minimal; tests inject spies) -------------------------------------

/** Subset of expo-file-system/legacy used to read the picked backup file as UTF-8 text. */
export interface FileSystemLike {
  readonly EncodingType: { readonly UTF8: string };
  readAsStringAsync(uri: string, options: { encoding: string }): Promise<string>;
}

export interface ReadBackupDeps {
  readonly FileSystem: FileSystemLike;
}

/** Read the selected backup file as a UTF-8 string (the WrappedKey JSON envelope). */
export async function readBackupFile(deps: ReadBackupDeps, uri: string): Promise<string> {
  return deps.FileSystem.readAsStringAsync(uri, { encoding: deps.FileSystem.EncodingType.UTF8 });
}

export interface DocumentAssetLike {
  readonly uri: string;
  readonly name: string;
  readonly size?: number | null;
}

export interface DocumentPickerResultLike {
  readonly canceled: boolean;
  readonly assets: DocumentAssetLike[] | null;
}

/** Subset of expo-document-picker. */
export interface DocumentPickerLike {
  getDocumentAsync(options?: unknown): Promise<DocumentPickerResultLike>;
}

export interface PickBackupDeps {
  readonly DocumentPicker: DocumentPickerLike;
}

/** A backup file the user selected, ready to read + restore. */
export interface PickedBackup {
  readonly uri: string;
  readonly name: string;
  readonly size: number;
}

/**
 * Open the document picker and return the first selected backup file, or `null` on cancel. Mirrors
 * the `result.canceled` / `result.assets?.[0]` shape of create/pick-attachment.ts and requests a
 * cached copy so the file URI stays readable. A missing reported size defaults to 0.
 */
export async function pickBackupFile(deps: PickBackupDeps): Promise<PickedBackup | null> {
  const result = await deps.DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name, size: asset.size ?? 0 };
}
