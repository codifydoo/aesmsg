import { base64ToBytes } from "@/src/lib/base64";

// Sender-side attachment picking, extracted from the React layer so the size policy and the
// native-picker → ComposeAttachment mapping can be unit-tested in plain Node without a renderer or
// the expo native modules (which fail Flow-parse under the node test runner). The sheet injects the
// production modules; tests inject spies. Mirrors reader/attachment-cache.ts.

/** Hard cap per attachment. Sits safely under the API's 14 MiB ciphertext limit once HPKE overhead
 *  (+50 bytes) and Padmé padding (~+0.25 MiB at this scale) are added — see the spec's size policy. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** A file the user selected, decrypted/plaintext in memory, ready to seal into the payload envelope. */
export interface ComposeAttachment {
  readonly filename: string;
  readonly mimetype: string;
  readonly bytes: Uint8Array;
  readonly size: number;
}

export type SizeCheck = { readonly ok: true } | { readonly ok: false; readonly size: number };

export function validateAttachmentSize(
  size: number,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): SizeCheck {
  return size > maxBytes ? { ok: false, size } : { ok: true };
}

/** Human size for the file card + over-limit copy: MB (1 decimal) at/above 1 MiB, else KB. */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// --- Native-module surfaces (minimal; tests inject spies) -------------------------------------

/** Subset of expo-file-system/legacy used to read picked bytes. */
export interface FileReaderLike {
  readonly EncodingType: { readonly Base64: string };
  readAsStringAsync(uri: string, options: { encoding: string }): Promise<string>;
}

export interface ImageAssetLike {
  readonly uri: string;
  readonly fileName?: string | null;
  readonly mimeType?: string | null;
  readonly fileSize?: number | null;
}

export interface ImagePickerResultLike {
  readonly canceled: boolean;
  readonly assets: ImageAssetLike[] | null;
}

/** Subset of expo-image-picker. */
export interface ImagePickerLike {
  requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  launchCameraAsync(options?: unknown): Promise<ImagePickerResultLike>;
  launchImageLibraryAsync(options?: unknown): Promise<ImagePickerResultLike>;
}

export interface DocumentAssetLike {
  readonly uri: string;
  readonly name: string;
  readonly mimeType?: string | null;
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

// --- Result + mapping --------------------------------------------------------------------------

// Picker/file-read rejections (platform errors, an unreadable URI) PROPAGATE from these functions
// rather than mapping to a PickResult; the caller (AttachmentPickerSheet) wraps the call in try/catch
// and surfaces a non-destructive failure. A thrown read produces no bytes, so no plaintext leaks.
export type PickResult =
  | { readonly kind: "picked"; readonly attachment: ComposeAttachment }
  | { readonly kind: "too-large"; readonly filename: string; readonly size: number }
  | { readonly kind: "cancelled" };

const DEFAULT_MIME = "application/octet-stream";

/** Strip any directory segments — the payload envelope stores basenames only. */
function basename(name: string): string {
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1] || name;
}

/** A few common image extensions; otherwise derive from the mime subtype, else `.bin`. */
function fallbackName(mimetype: string): string {
  const subtype = mimetype.split("/")[1] ?? "bin";
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  return `attachment.${ext}`;
}

interface NormalizedAsset {
  readonly uri: string;
  readonly filename: string;
  readonly mimetype: string;
  readonly knownSize: number | null;
}

async function buildResult(
  asset: NormalizedAsset,
  FileSystem: FileReaderLike,
  maxBytes: number,
): Promise<PickResult> {
  // Pre-check from metadata when the picker reported a size — avoids reading a huge file just to reject it.
  if (asset.knownSize != null && !validateAttachmentSize(asset.knownSize, maxBytes).ok) {
    return { kind: "too-large", filename: asset.filename, size: asset.knownSize };
  }
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  if (!validateAttachmentSize(bytes.length, maxBytes).ok) {
    return { kind: "too-large", filename: asset.filename, size: bytes.length };
  }
  return {
    kind: "picked",
    attachment: { filename: asset.filename, mimetype: asset.mimetype, bytes, size: bytes.length },
  };
}

function normalizeImage(asset: ImageAssetLike): NormalizedAsset {
  const mimetype = asset.mimeType || DEFAULT_MIME;
  return {
    uri: asset.uri,
    filename: asset.fileName ? basename(asset.fileName) : fallbackName(mimetype),
    mimetype,
    knownSize: asset.fileSize ?? null,
  };
}

function normalizeDocument(asset: DocumentAssetLike): NormalizedAsset {
  const mimetype = asset.mimeType || DEFAULT_MIME;
  return {
    uri: asset.uri,
    filename: basename(asset.name) || fallbackName(mimetype),
    mimetype,
    knownSize: asset.size ?? null,
  };
}

export interface ImagePickDeps {
  readonly ImagePicker: ImagePickerLike;
  readonly FileSystem: FileReaderLike;
}

export interface DocumentPickDeps {
  readonly DocumentPicker: DocumentPickerLike;
  readonly FileSystem: FileReaderLike;
}

export async function pickFromLibrary(
  deps: ImagePickDeps,
  maxBytes = MAX_ATTACHMENT_BYTES,
): Promise<PickResult> {
  const result = await deps.ImagePicker.launchImageLibraryAsync({ base64: false });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return { kind: "cancelled" };
  return buildResult(normalizeImage(asset), deps.FileSystem, maxBytes);
}

export async function pickFromCamera(
  deps: ImagePickDeps,
  maxBytes = MAX_ATTACHMENT_BYTES,
): Promise<PickResult> {
  const perm = await deps.ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { kind: "cancelled" };
  const result = await deps.ImagePicker.launchCameraAsync({ base64: false });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return { kind: "cancelled" };
  return buildResult(normalizeImage(asset), deps.FileSystem, maxBytes);
}

export async function pickDocument(
  deps: DocumentPickDeps,
  maxBytes = MAX_ATTACHMENT_BYTES,
): Promise<PickResult> {
  const result = await deps.DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return { kind: "cancelled" };
  return buildResult(normalizeDocument(asset), deps.FileSystem, maxBytes);
}
