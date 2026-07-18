import {
  DEFAULT_WRAP_KDF_PARAMS,
  exportPublicKey,
  generateIdentity,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type DocumentPickerLike,
  type FileSystemLike,
  formatBackupSize,
  pickBackupFile,
  readBackupFile,
  restoreIdentity,
} from "@/src/onboarding/import-backup";

// Pure + DI module for the import/restore vertical: no React renderer, no expo natives — the
// DocumentPicker / FileSystem surfaces are injected and mocked here, exactly as
// create/pick-attachment.ts and reader/attachment-cache.ts are tested. The crypto round-trip uses
// the REAL @aesmsg/crypto (no wire-format change), so a backup sealed under the heavy passphrase
// params unwraps back to the same public key.
//
// Argon2id (heavy default params: 64 MiB, t=3) runs inside restoreIdentity's round-trip, so the
// crypto-touching tests widen the per-test timeout.

const HEAVY_TIMEOUT = 30_000;
const PASSPHRASE = "correct horse battery staple";

describe("restoreIdentity", () => {
  it(
    "returns ok with the recovered identity on the correct passphrase",
    async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, PASSPHRASE, DEFAULT_WRAP_KDF_PARAMS);

      const result = await restoreIdentity(wrapped, PASSPHRASE);

      expect(result.ok).toBe(true);
      // Narrow + assert the round-trip recovered the same public identity.
      if (result.ok) {
        expect(exportPublicKey(result.identity)).toBe(exportPublicKey(id));
      }
    },
    HEAVY_TIMEOUT,
  );

  it(
    "returns bad-passphrase when the passphrase is wrong",
    async () => {
      const id = await generateIdentity();
      const wrapped = await wrapPrivateKey(id, PASSPHRASE, DEFAULT_WRAP_KDF_PARAMS);

      const result = await restoreIdentity(wrapped, "not the passphrase");

      expect(result).toEqual({ ok: false, reason: "bad-passphrase" });
    },
    HEAVY_TIMEOUT,
  );

  it("returns invalid-file on malformed (non-JSON) input", async () => {
    const result = await restoreIdentity("this is not json", PASSPHRASE);
    expect(result).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("returns invalid-file on a truncated / structurally invalid envelope", async () => {
    // Valid JSON, but not a wrapped-key envelope (missing every required field) — the crypto
    // layer raises InvalidFormatError, which must map to invalid-file, not bad-passphrase.
    const result = await restoreIdentity('{"v":1}', PASSPHRASE);
    expect(result).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("returns invalid-file on empty input", async () => {
    const result = await restoreIdentity("", PASSPHRASE);
    expect(result).toEqual({ ok: false, reason: "invalid-file" });
  });
});

describe("formatBackupSize", () => {
  it("formats sub-MiB sizes in KB with one decimal", () => {
    expect(formatBackupSize(4300)).toBe("4.2 KB");
  });

  it("formats >= 1 MiB sizes in MB with one decimal", () => {
    expect(formatBackupSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("formats a zero-byte file as 0.0 KB", () => {
    expect(formatBackupSize(0)).toBe("0.0 KB");
  });
});

describe("readBackupFile", () => {
  it("reads the file as a UTF-8 string over the injected FileSystem", async () => {
    const readAsStringAsync = vi.fn(async () => '{"v":1}');
    const FileSystem: FileSystemLike = {
      EncodingType: { UTF8: "utf8" },
      readAsStringAsync,
    };

    const contents = await readBackupFile({ FileSystem }, "file:///tmp/backup.aesmsg");

    expect(contents).toBe('{"v":1}');
    expect(readAsStringAsync).toHaveBeenCalledWith("file:///tmp/backup.aesmsg", {
      encoding: "utf8",
    });
  });
});

describe("pickBackupFile", () => {
  function makePicker(result: Awaited<ReturnType<DocumentPickerLike["getDocumentAsync"]>>) {
    const getDocumentAsync = vi.fn(async () => result);
    const DocumentPicker: DocumentPickerLike = { getDocumentAsync };
    return { DocumentPicker, getDocumentAsync };
  }

  it("returns the first selected asset and requests a cached copy", async () => {
    const { DocumentPicker, getDocumentAsync } = makePicker({
      canceled: false,
      assets: [{ uri: "file:///tmp/backup.aesmsg", name: "backup.aesmsg", size: 4300 }],
    });

    const picked = await pickBackupFile({ DocumentPicker });

    expect(picked).toEqual({ uri: "file:///tmp/backup.aesmsg", name: "backup.aesmsg", size: 4300 });
    expect(getDocumentAsync).toHaveBeenCalledWith({ copyToCacheDirectory: true });
  });

  it("returns null when the picker is canceled", async () => {
    const { DocumentPicker } = makePicker({ canceled: true, assets: null });
    expect(await pickBackupFile({ DocumentPicker })).toBeNull();
  });

  it("returns null when no asset is present despite canceled=false", async () => {
    const { DocumentPicker } = makePicker({ canceled: false, assets: null });
    expect(await pickBackupFile({ DocumentPicker })).toBeNull();
  });

  it("defaults a missing size to 0", async () => {
    const { DocumentPicker } = makePicker({
      canceled: false,
      assets: [{ uri: "file:///tmp/backup.aesmsg", name: "backup.aesmsg" }],
    });

    const picked = await pickBackupFile({ DocumentPicker });

    expect(picked).toEqual({ uri: "file:///tmp/backup.aesmsg", name: "backup.aesmsg", size: 0 });
  });
});
