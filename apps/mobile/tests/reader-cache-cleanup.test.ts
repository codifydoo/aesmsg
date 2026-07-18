import type { PayloadAttachment } from "@aesmsg/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "@/src/lib/base64";
import {
  type AttachmentCacheDeps,
  CACHE_FILE_PREFIX,
  clearAttachmentCache,
  clearCachedFiles,
  writeAttachmentToCache,
} from "@/src/reader/attachment-cache";

// expo-file-system/legacy and expo-sharing are native modules that fail Flow-parse / can't resolve
// their subpaths under the node test runner, so they MUST be mocked. attachment-cache.ts does NOT
// import them directly (the reader injects them), but we mock them anyway as the production deps the
// reader would pass, and to mirror how the screen wires them up. The base64 encoder is REAL.
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  writeAsStringAsync: vi.fn().mockResolvedValue(undefined),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  readDirectoryAsync: vi.fn().mockResolvedValue([]),
  EncodingType: { Base64: "base64" },
}));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));

function makeAttachment(overrides: Partial<PayloadAttachment> = {}): PayloadAttachment {
  return {
    filename: "secret report.pdf",
    mimetype: "application/pdf",
    bytes: new Uint8Array([0x00, 0x01, 0xff, 0x80, 0x42]),
    ...overrides,
  };
}

function makeDeps(overrides: { isAvailable?: boolean }): AttachmentCacheDeps & {
  writeSpy: ReturnType<typeof vi.fn>;
  deleteSpy: ReturnType<typeof vi.fn>;
  readDirSpy: ReturnType<typeof vi.fn>;
  shareSpy: ReturnType<typeof vi.fn>;
} {
  const writeSpy = vi.fn().mockResolvedValue(undefined);
  const deleteSpy = vi.fn().mockResolvedValue(undefined);
  const readDirSpy = vi.fn().mockResolvedValue([]);
  const shareSpy = vi.fn().mockResolvedValue(undefined);
  const FileSystem = {
    cacheDirectory: "file:///cache/",
    writeAsStringAsync: writeSpy,
    deleteAsync: deleteSpy,
    readDirectoryAsync: readDirSpy,
    EncodingType: { Base64: "base64" },
  };
  const Sharing = {
    isAvailableAsync: vi.fn().mockResolvedValue(overrides.isAvailable ?? true),
    shareAsync: shareSpy,
  };
  return { FileSystem, Sharing, writeSpy, deleteSpy, readDirSpy, shareSpy };
}

describe("writeAttachmentToCache", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("writes the attachment bytes as base64 with EncodingType.Base64 to a cacheDirectory URI", async () => {
    const deps = makeDeps({});
    const attachment = makeAttachment();

    const uri = await writeAttachmentToCache(deps, attachment, () => {});

    expect(uri.startsWith("file:///cache/")).toBe(true);
    expect(uri).toContain(CACHE_FILE_PREFIX);
    expect(deps.writeSpy).toHaveBeenCalledTimes(1);
    const [writtenUri, contents, options] = deps.writeSpy.mock.calls[0] ?? [];
    expect(writtenUri).toBe(uri);
    // REAL bytesToBase64 — the written contents must be the exact base64 of the plaintext bytes.
    expect(contents).toBe(bytesToBase64(attachment.bytes));
    expect(options).toEqual({ encoding: "base64" });
  });

  it("sanitizes the filename into the cache URI (no spaces / unsafe chars)", async () => {
    const deps = makeDeps({});
    const uri = await writeAttachmentToCache(
      deps,
      makeAttachment({ filename: "a b/c?.txt" }),
      () => {},
    );
    // path segment after the cache dir + timestamp prefix must contain no spaces or slashes/?.
    const tail = uri.slice("file:///cache/".length);
    expect(tail).not.toMatch(/[ /?]/);
    // "a b/c?.txt" -> each run of non-[\w.-] chars (the space, the slash, the ?) collapses to one _
    expect(tail).toMatch(/-a_b_c_\.txt$/);
  });

  it("shares the written URI with the attachment mimetype when the share sheet is available", async () => {
    const deps = makeDeps({ isAvailable: true });
    const attachment = makeAttachment();

    const uri = await writeAttachmentToCache(deps, attachment, () => {});

    expect(deps.Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(deps.shareSpy).toHaveBeenCalledTimes(1);
    expect(deps.shareSpy).toHaveBeenCalledWith(uri, { mimeType: attachment.mimetype });
  });

  it("does NOT share when the share sheet is unavailable (still writes the cache file)", async () => {
    const deps = makeDeps({ isAvailable: false });

    await writeAttachmentToCache(deps, makeAttachment(), () => {});

    expect(deps.writeSpy).toHaveBeenCalledTimes(1);
    expect(deps.Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(deps.shareSpy).not.toHaveBeenCalled();
  });

  // SECURITY INVARIANT: track-before-handoff. The cache file holds DECRYPTED PLAINTEXT, so its URI
  // must be recorded for the unmount wipe BEFORE the share sheet can reject. The `track` callback is
  // invoked synchronously after the file is written and BEFORE Sharing.shareAsync is awaited.
  it("tracks the cache URI BEFORE awaiting the share (so a share never races the tracking)", async () => {
    const deps = makeDeps({ isAvailable: true });
    const tracked: string[] = [];
    // Capture the tracked URIs at the moment shareAsync is entered: track must already have run.
    let trackedAtShare: readonly string[] = [];
    deps.shareSpy.mockImplementation(async () => {
      trackedAtShare = [...tracked];
    });

    const uri = await writeAttachmentToCache(deps, makeAttachment(), (u) => tracked.push(u));

    expect(trackedAtShare).toEqual([uri]);
    expect(tracked).toEqual([uri]);
  });

  // SECURITY INVARIANT: a share rejection (expo-sharing rejects on a double-tap when a share sheet is
  // already presented, or on platform errors) must NOT orphan the already-written decrypted-plaintext
  // cache file. The URI must already be tracked, so the reader's unmount wipe deletes it.
  it("still tracks the written URI when Sharing.shareAsync REJECTS (no orphaned plaintext)", async () => {
    const deps = makeDeps({ isAvailable: true });
    deps.shareSpy.mockRejectedValueOnce(new Error("share sheet already presented"));
    const tracked: string[] = [];

    // The write must have happened and the URI must be tracked regardless of the share outcome.
    await expect(
      writeAttachmentToCache(deps, makeAttachment(), (u) => tracked.push(u)),
    ).resolves.toBeDefined();

    expect(deps.writeSpy).toHaveBeenCalledTimes(1);
    expect(tracked).toHaveLength(1);
    expect(tracked[0]?.startsWith("file:///cache/")).toBe(true);

    // The tracked (orphan-risk) file is wiped on leave — proving no plaintext residue.
    await clearCachedFiles({ FileSystem: deps.FileSystem }, tracked);
    expect(deps.deleteSpy).toHaveBeenCalledWith(tracked[0], { idempotent: true });
  });
});

describe("clearCachedFiles", () => {
  it("deletes EVERY tracked URI idempotently", async () => {
    const deps = makeDeps({});
    const uris = ["file:///cache/1-a.bin", "file:///cache/2-b.bin", "file:///cache/3-c.bin"];

    await clearCachedFiles({ FileSystem: deps.FileSystem }, uris);

    expect(deps.deleteSpy).toHaveBeenCalledTimes(3);
    for (const uri of uris) {
      expect(deps.deleteSpy).toHaveBeenCalledWith(uri, { idempotent: true });
    }
  });

  it("is a no-op on an empty list", async () => {
    const deps = makeDeps({});
    await clearCachedFiles({ FileSystem: deps.FileSystem }, []);
    expect(deps.deleteSpy).not.toHaveBeenCalled();
  });

  it("swallows individual delete failures so one stuck delete cannot block the rest", async () => {
    const deps = makeDeps({});
    deps.deleteSpy
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("EBUSY"))
      .mockResolvedValueOnce(undefined);
    const uris = ["file:///cache/1", "file:///cache/2", "file:///cache/3"];

    await expect(clearCachedFiles({ FileSystem: deps.FileSystem }, uris)).resolves.toBeUndefined();
    expect(deps.deleteSpy).toHaveBeenCalledTimes(3);
  });
});

// Models the ReaderScreen lifecycle the bug fix guarantees: each download appends to a single
// accumulator and NOTHING is deleted until the reader leaves, at which point ALL tracked files are
// wiped exactly once. This is the behavioral contract behind the useRef accumulator + empty-dep
// unmount effect (the previous [tempFiles]-state pattern deleted earlier in-flight files early).
describe("reader cache lifecycle (delete-all-on-leave, no premature delete)", () => {
  it("does NOT delete earlier files when a later attachment downloads, then wipes ALL on leave", async () => {
    const deps = makeDeps({});
    const accumulator: string[] = [];
    const track = (uri: string) => accumulator.push(uri);

    // First download — track-before-handoff appends to the accumulator before sharing.
    await writeAttachmentToCache(deps, makeAttachment({ filename: "first.bin" }), track);
    // Second download — earlier file must remain (no delete yet).
    await writeAttachmentToCache(deps, makeAttachment({ filename: "second.bin" }), track);

    expect(deps.deleteSpy).not.toHaveBeenCalled();
    expect(accumulator).toHaveLength(2);

    // Leaving the reader (single unmount cleanup) wipes every tracked file exactly once.
    await clearCachedFiles({ FileSystem: deps.FileSystem }, accumulator);

    expect(deps.deleteSpy).toHaveBeenCalledTimes(2);
    expect(deps.deleteSpy).toHaveBeenCalledWith(accumulator[0], { idempotent: true });
    expect(deps.deleteSpy).toHaveBeenCalledWith(accumulator[1], { idempotent: true });
  });
});

describe("clearAttachmentCache", () => {
  it("deletes only CACHE_FILE_PREFIX-prefixed entries, leaving other files alone", async () => {
    const deps = makeDeps({});
    const ourFile = `${CACHE_FILE_PREFIX}1234567890-doc.pdf`;
    const otherFile = "expo-image-cache-something.jpg";
    deps.readDirSpy.mockResolvedValue([ourFile, otherFile]);

    await clearAttachmentCache({ FileSystem: deps.FileSystem });

    expect(deps.deleteSpy).toHaveBeenCalledTimes(1);
    expect(deps.deleteSpy).toHaveBeenCalledWith(`file:///cache/${ourFile}`, { idempotent: true });
    expect(deps.deleteSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(otherFile),
      expect.anything(),
    );
  });

  it("reconstructs full cacheDirectory + name URI with { idempotent: true }", async () => {
    const deps = makeDeps({});
    const name = `${CACHE_FILE_PREFIX}9999999999-secret.bin`;
    deps.readDirSpy.mockResolvedValue([name]);

    await clearAttachmentCache({ FileSystem: deps.FileSystem });

    expect(deps.deleteSpy).toHaveBeenCalledWith(`file:///cache/${name}`, { idempotent: true });
  });

  it("swallows a readDirectoryAsync rejection — resolves and deletes nothing", async () => {
    const deps = makeDeps({});
    deps.readDirSpy.mockRejectedValue(new Error("permission denied"));

    await expect(clearAttachmentCache({ FileSystem: deps.FileSystem })).resolves.toBeUndefined();
    expect(deps.deleteSpy).not.toHaveBeenCalled();
  });

  it("swallows individual deleteAsync failures and continues deleting the rest", async () => {
    const deps = makeDeps({});
    const file1 = `${CACHE_FILE_PREFIX}0000000001-a.bin`;
    const file2 = `${CACHE_FILE_PREFIX}0000000002-b.bin`;
    deps.readDirSpy.mockResolvedValue([file1, file2]);
    deps.deleteSpy.mockRejectedValueOnce(new Error("EBUSY")).mockResolvedValueOnce(undefined);

    await expect(clearAttachmentCache({ FileSystem: deps.FileSystem })).resolves.toBeUndefined();
    expect(deps.deleteSpy).toHaveBeenCalledTimes(2);
  });

  it("is a no-op when cacheDirectory is null", async () => {
    const deps = makeDeps({});
    const nullCacheDeps = {
      FileSystem: { ...deps.FileSystem, cacheDirectory: null },
    };

    await expect(clearAttachmentCache(nullCacheDeps)).resolves.toBeUndefined();
    expect(deps.readDirSpy).not.toHaveBeenCalled();
    expect(deps.deleteSpy).not.toHaveBeenCalled();
  });
});
