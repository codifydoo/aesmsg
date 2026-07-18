import type { PayloadAttachment } from "@aesmsg/crypto";
import { bytesToBase64 } from "@/src/lib/base64";

// Framework-agnostic attachment cache write/share/clear, extracted from ReaderScreen so the
// security-critical lifecycle (write decrypted bytes to cache -> share -> wipe on leave) can be
// unit-tested in plain Node without a React renderer or the native expo-file-system/expo-sharing
// modules (both fail Flow-parse under the node test runner). The reader injects the production
// modules; tests inject spies.

// Prefix applied to every decrypted-attachment cache filename so the Settings "Clear local history"
// sweep can identify and remove our files without touching unrelated cache entries.
export const CACHE_FILE_PREFIX = "aesmsg-";

// Minimal surface of expo-file-system/legacy that this module needs. SDK 56 split the string-URI
// helpers (cacheDirectory, writeAsStringAsync, deleteAsync, EncodingType) onto the `/legacy`
// subpath; the new default export is the File/Paths API.
export interface FileSystemLike {
  readonly cacheDirectory: string | null;
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  readonly EncodingType: { readonly Base64: string };
  // Used ONLY by clearAttachmentCache (the sweep path) — never in the security-critical write path.
  readDirectoryAsync(uri: string): Promise<string[]>; // expo-file-system/legacy returns bare filenames
}

// Minimal surface of expo-sharing this module needs.
export interface SharingLike {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options?: { mimeType?: string }): Promise<void>;
}

export interface AttachmentCacheDeps {
  readonly FileSystem: FileSystemLike;
  readonly Sharing: SharingLike;
}

// Write one decrypted attachment to a unique cache-dir path as base64, then share it (gated on the
// platform share sheet being available). Returns the cache URI.
//
// SECURITY INVARIANT — track-before-handoff: the bytes are DECRYPTED PLAINTEXT, so the URI MUST be
// recorded for the unmount wipe BEFORE the share sheet can reject. `track(uri)` is invoked
// synchronously right after the file is written and BEFORE `Sharing.shareAsync` is awaited. This
// guarantees that if the share rejects (expo-sharing rejects on a rapid double-tap when a sheet is
// already presented, or on platform errors), the already-written cache file is still tracked and
// gets wiped on leaving the reader — never orphaned as plaintext residue. Mirrors the web
// DecryptedScreen, which pushes to objectUrls.current BEFORE the download handoff.
export async function writeAttachmentToCache(
  deps: AttachmentCacheDeps,
  attachment: PayloadAttachment,
  track: (uri: string) => void,
): Promise<string> {
  const { FileSystem, Sharing } = deps;
  const safeName = attachment.filename.replace(/[^\w.-]+/g, "_");
  const uri = `${FileSystem.cacheDirectory}${CACHE_FILE_PREFIX}${Date.now()}-${safeName}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(attachment.bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  // Track BEFORE the share can throw — this is the orphan-prevention guarantee.
  track(uri);
  // A share rejection (rapid double-tap when a sheet is already presented, or a platform error) is
  // non-fatal to this function's contract: the decrypted file is already written and tracked for the
  // unmount wipe, and there is no recoverable user action. Swallow it so it can never orphan the
  // cache file or surface as an unhandled rejection. A *write* failure above still rejects.
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: attachment.mimetype });
    }
  } catch {
    // Intentionally ignored — see above. The file remains tracked and will be wiped on leave.
  }
  return uri;
}

// Wipe every tracked cache URI. Idempotent so a URI that was never written (or already gone) is a
// no-op; individual failures are swallowed so one stuck delete cannot block the rest. This is the
// "delete-all-on-leave" guarantee — no decrypted plaintext residue after the reader unmounts.
export async function clearCachedFiles(
  deps: Pick<AttachmentCacheDeps, "FileSystem">,
  uris: readonly string[],
): Promise<void> {
  await Promise.all(
    uris.map((uri) => deps.FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})),
  );
}

/** Settings "Clear local history" sweep: delete every decrypted-attachment file this app wrote to
 *  the cache dir (identified by CACHE_FILE_PREFIX), catching files retained when auto-wipe is off
 *  or orphaned by a crash. Bounded to our prefix so it never touches unrelated cache entries.
 *  Best-effort: a failed listing or an individual delete is swallowed so it can't block the rest. */
export async function clearAttachmentCache(
  deps: Pick<AttachmentCacheDeps, "FileSystem">,
): Promise<void> {
  const { cacheDirectory } = deps.FileSystem;
  if (!cacheDirectory) return;
  let names: string[];
  try {
    names = await deps.FileSystem.readDirectoryAsync(cacheDirectory);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_FILE_PREFIX))
      .map((name) =>
        deps.FileSystem.deleteAsync(`${cacheDirectory}${name}`, { idempotent: true }).catch(
          () => {},
        ),
      ),
  );
}
