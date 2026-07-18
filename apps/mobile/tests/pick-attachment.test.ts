import { describe, expect, it, vi } from "vitest";
import {
  type DocumentPickerLike,
  type FileReaderLike,
  formatSize,
  type ImagePickerLike,
  MAX_ATTACHMENT_BYTES,
  pickDocument,
  pickFromCamera,
  pickFromLibrary,
  validateAttachmentSize,
} from "@/src/create/pick-attachment";
import { bytesToBase64 } from "@/src/lib/base64";
import { PRO_ATTACHMENT_BYTES } from "@/src/pro/entitlements";

describe("validateAttachmentSize", () => {
  it("accepts a file at or under the cap", () => {
    expect(validateAttachmentSize(0).ok).toBe(true);
    expect(validateAttachmentSize(MAX_ATTACHMENT_BYTES).ok).toBe(true);
  });

  it("rejects a file over the cap and reports its size", () => {
    const result = validateAttachmentSize(MAX_ATTACHMENT_BYTES + 1);
    expect(result.ok).toBe(false);
  });
});

describe("formatSize", () => {
  it("formats bytes as MB with one decimal", () => {
    expect(formatSize(1.2 * 1024 * 1024)).toBe("1.2 MB");
    expect(formatSize(41 * 1024 * 1024)).toBe("41.0 MB");
  });

  it("formats sub-megabyte sizes as KB", () => {
    expect(formatSize(512)).toBe("0.5 KB");
  });
});

// A FileReaderLike that returns the given bytes as base64 for any uri.
function fileReaderReturning(bytes: Uint8Array): FileReaderLike {
  return {
    EncodingType: { Base64: "base64" },
    readAsStringAsync: vi.fn(async () => bytesToBase64(bytes)),
  };
}

describe("pickDocument", () => {
  it("maps a picked document to a ComposeAttachment with bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({
        canceled: false,
        assets: [
          { uri: "file:///x", name: "Signed NDA.pdf", mimeType: "application/pdf", size: 4 },
        ],
      })),
    };
    const result = await pickDocument({ DocumentPicker, FileSystem: fileReaderReturning(bytes) });
    expect(result.kind).toBe("picked");
    if (result.kind !== "picked") throw new Error("expected picked");
    expect(result.attachment.filename).toBe("Signed NDA.pdf");
    expect(result.attachment.mimetype).toBe("application/pdf");
    expect(result.attachment.size).toBe(4);
    expect([...result.attachment.bytes]).toEqual([1, 2, 3, 4]);
  });

  it("returns cancelled when the user dismisses the picker", async () => {
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({ canceled: true, assets: null })),
    };
    const result = await pickDocument({
      DocumentPicker,
      FileSystem: fileReaderReturning(new Uint8Array()),
    });
    expect(result.kind).toBe("cancelled");
  });

  it("reports too-large from asset metadata WITHOUT reading the file", async () => {
    const FileSystem = fileReaderReturning(new Uint8Array([0]));
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({
        canceled: false,
        assets: [
          {
            uri: "file:///big",
            name: "huge.bin",
            mimeType: "application/octet-stream",
            size: 41 * 1024 * 1024,
          },
        ],
      })),
    };
    const result = await pickDocument({ DocumentPicker, FileSystem });
    expect(result.kind).toBe("too-large");
    if (result.kind !== "too-large") throw new Error("expected too-large");
    expect(result.size).toBe(41 * 1024 * 1024);
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  // Heavy fixture (allocates + reads a >10 MiB buffer): fast in isolation but can exceed Vitest's
  // default 5000ms when `pnpm -r test` runs apps/mobile concurrently with apps/api under CPU
  // contention. A generous per-test timeout keeps the gate deterministic without changing assertions.
  it("rejects as too-large after reading when the picker reports no size", {
    timeout: 20000,
  }, async () => {
    const oversize = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
    const FileSystem = fileReaderReturning(oversize);
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({
        canceled: false,
        assets: [{ uri: "file:///nosize", name: "mystery.bin", mimeType: null, size: null }],
      })),
    };
    const result = await pickDocument({ DocumentPicker, FileSystem });
    expect(result.kind).toBe("too-large");
    if (result.kind !== "too-large") throw new Error("expected too-large");
    expect(result.size).toBe(MAX_ATTACHMENT_BYTES + 1);
    // The file WAS read this time (no metadata size to pre-check against).
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(1);
  });

  it("normalizes a path-y name to a basename and falls back on a missing mimetype", async () => {
    const bytes = new Uint8Array([9]);
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({
        canceled: false,
        assets: [{ uri: "file:///x", name: "/tmp/sub/report.txt", mimeType: null, size: 1 }],
      })),
    };
    const result = await pickDocument({ DocumentPicker, FileSystem: fileReaderReturning(bytes) });
    if (result.kind !== "picked") throw new Error("expected picked");
    expect(result.attachment.filename).toBe("report.txt");
    expect(result.attachment.mimetype).toBe("application/octet-stream");
  });
});

describe("pickFromLibrary", () => {
  it("maps an image asset, deriving a filename when the picker omits one", async () => {
    const bytes = new Uint8Array([7, 7]);
    const ImagePicker: ImagePickerLike = {
      requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
      launchCameraAsync: vi.fn(),
      launchImageLibraryAsync: vi.fn(async () => ({
        canceled: false,
        assets: [{ uri: "file:///p", fileName: null, mimeType: "image/jpeg", fileSize: 2 }],
      })),
    };
    const result = await pickFromLibrary({ ImagePicker, FileSystem: fileReaderReturning(bytes) });
    if (result.kind !== "picked") throw new Error("expected picked");
    expect(result.attachment.filename).toBe("attachment.jpg");
    expect(result.attachment.mimetype).toBe("image/jpeg");
  });
});

describe("pickFromCamera", () => {
  it("returns cancelled when camera permission is denied (no launch)", async () => {
    const ImagePicker: ImagePickerLike = {
      requestCameraPermissionsAsync: vi.fn(async () => ({ granted: false })),
      launchCameraAsync: vi.fn(),
      launchImageLibraryAsync: vi.fn(),
    };
    const result = await pickFromCamera({
      ImagePicker,
      FileSystem: fileReaderReturning(new Uint8Array()),
    });
    expect(result.kind).toBe("cancelled");
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });
});

describe("validateAttachmentSize tiering", () => {
  it("defaults to the free 10 MiB cap when no limit is passed", () => {
    expect(validateAttachmentSize(MAX_ATTACHMENT_BYTES)).toEqual({ ok: true });
    expect(validateAttachmentSize(MAX_ATTACHMENT_BYTES + 1).ok).toBe(false);
  });

  it("accepts a larger file when the pro limit is supplied", () => {
    const justOverFree = MAX_ATTACHMENT_BYTES + 1;
    expect(validateAttachmentSize(justOverFree, PRO_ATTACHMENT_BYTES)).toEqual({ ok: true });
    expect(validateAttachmentSize(PRO_ATTACHMENT_BYTES + 1, PRO_ATTACHMENT_BYTES).ok).toBe(false);
  });
});

describe("pickFromLibrary tiering", () => {
  // Heavy fixture (allocates a ~12 MiB buffer): fast in isolation but can exceed Vitest's default
  // 5000ms when `pnpm -r test` runs apps/mobile concurrently with apps/api under CPU contention. A
  // generous per-test timeout keeps the gate deterministic without changing assertions.
  it("rejects a ~12 MiB file with default free limit but accepts it with the pro limit", {
    timeout: 20000,
  }, async () => {
    // 12 MiB — over the 10 MiB free cap but under the 25 MiB pro cap.
    // The asset reports knownSize so the pre-check short-circuits before reading.
    const TWELVE_MIB = 12 * 1024 * 1024;
    const makeImagePicker = (): ImagePickerLike => ({
      requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
      launchCameraAsync: vi.fn(),
      launchImageLibraryAsync: vi.fn(async () => ({
        canceled: false,
        assets: [
          {
            uri: "file:///big-img",
            fileName: "large-photo.jpg",
            mimeType: "image/jpeg",
            fileSize: TWELVE_MIB,
          },
        ],
      })),
    });

    // With default (free) limit — the pre-check fires; readAsStringAsync is NOT called.
    const freeFs = fileReaderReturning(new Uint8Array(TWELVE_MIB));
    const freeResult = await pickFromLibrary({
      ImagePicker: makeImagePicker(),
      FileSystem: freeFs,
    });
    expect(freeResult.kind).toBe("too-large");
    expect(freeFs.readAsStringAsync).not.toHaveBeenCalled();

    // With pro limit — the pre-check passes; the file is read and the result is picked.
    const proFs = fileReaderReturning(new Uint8Array(TWELVE_MIB));
    const proResult = await pickFromLibrary(
      { ImagePicker: makeImagePicker(), FileSystem: proFs },
      PRO_ATTACHMENT_BYTES,
    );
    expect(proResult.kind).toBe("picked");
    if (proResult.kind !== "picked") throw new Error("expected picked");
    expect(proResult.attachment.filename).toBe("large-photo.jpg");
    expect(proResult.attachment.size).toBe(TWELVE_MIB);
  });
});
