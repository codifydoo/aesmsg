import {
  DEFAULT_WRAP_KDF_PARAMS,
  exportPublicKey,
  generateIdentity,
  readWrapKdfParams,
  unwrapPrivateKey,
  type WrappedKey,
} from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildBackup,
  type FileSystemLike,
  type SharingLike,
  shareBackup,
  writeBackupToCache,
} from "@/src/keys/export-backup";

// Pure + DI module for the export/backup vertical: no React renderer, no expo natives — the
// FileSystem / Sharing surfaces are injected and mocked here, exactly as reader/attachment-cache.ts
// is tested. The crypto round-trip uses the REAL @aesmsg/crypto (no wire-format change), so a backup
// sealed under the heavy passphrase params unwraps back to the same public key.
//
// CRITICAL: buildBackup MUST seal under DEFAULT_WRAP_KDF_PARAMS (the heavy, human-passphrase
// brute-force-resistant params) — NOT the light MOBILE_KDF_PARAMS. The first test asserts exactly
// that by reading the KDF params back out of the produced envelope. Argon2id at 64 MiB / t=3 runs
// inside the crypto-touching tests, so those widen the per-test timeout.

const HEAVY_TIMEOUT = 30_000;
const PASSPHRASE = "correct horse battery staple";

describe("buildBackup", () => {
  it(
    "produces a parseable WrappedKey envelope sealed under DEFAULT_WRAP_KDF_PARAMS (heavy)",
    async () => {
      const id = await generateIdentity();

      const backup = await buildBackup(id, PASSPHRASE);

      expect(backup.filename).toBe("aesmsg-identity-backup.aesmsg");
      // Contents must be the JSON envelope string — parse it to prove it is structurally a WrappedKey.
      const parsed = JSON.parse(backup.contents);
      expect(typeof parsed).toBe("object");
      // The one detail that must be correct: the file wrap uses the HEAVY default params, never the
      // light mobile at-rest params. Read them back out of the produced envelope and assert equality.
      expect(readWrapKdfParams(backup.contents as WrappedKey)).toEqual(DEFAULT_WRAP_KDF_PARAMS);
    },
    HEAVY_TIMEOUT,
  );

  it(
    "round-trips: unwrapPrivateKey(contents, passphrase) recovers the same public key",
    async () => {
      const id = await generateIdentity();

      const backup = await buildBackup(id, PASSPHRASE);
      const recovered = await unwrapPrivateKey(backup.contents as WrappedKey, PASSPHRASE);

      expect(exportPublicKey(recovered)).toBe(exportPublicKey(id));
    },
    HEAVY_TIMEOUT,
  );
});

const BACKUP = {
  filename: "aesmsg-identity-backup.aesmsg",
  contents: '{"v":1}',
} as const;

// Write is split from share so the host can render the "Encrypted backup ready" success sheet BEFORE
// the system share sheet presents (design screen 41: success sheet slides up, then the share sheet).
describe("writeBackupToCache", () => {
  function makeFs() {
    const writeAsStringAsync = vi.fn(async () => {});
    const deleteAsync = vi.fn(async () => {});
    const FileSystem: FileSystemLike = {
      cacheDirectory: "file:///cache/",
      writeAsStringAsync,
      deleteAsync,
    };
    return { FileSystem, writeAsStringAsync, deleteAsync };
  }

  it("writes the ciphertext to a prefixed cache URI and returns a cleanup hook", async () => {
    const fs = makeFs();

    const written = await writeBackupToCache({ FileSystem: fs.FileSystem }, BACKUP);

    expect(fs.writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [writtenUri, writtenContents] = fs.writeAsStringAsync.mock.calls[0];
    expect(writtenUri).toContain("file:///cache/");
    // CACHE_FILE_PREFIX so the Settings "Clear local history" sweep reclaims an orphaned backup file.
    expect(writtenUri).toContain("aesmsg-");
    expect(writtenUri).toContain("aesmsg-identity-backup.aesmsg");
    expect(writtenContents).toBe(BACKUP.contents);
    expect(written.uri).toBe(writtenUri);

    // The cleanup hook removes exactly the written file.
    expect(typeof written.cleanup).toBe("function");
    await written.cleanup();
    expect(fs.deleteAsync).toHaveBeenCalledWith(written.uri, { idempotent: true });
  });
});

describe("shareBackup", () => {
  const URI = "file:///cache/aesmsg-1-aesmsg-identity-backup.aesmsg";

  function makeSharing(overrides?: { isAvailable?: boolean; shareImpl?: () => Promise<void> }) {
    const isAvailableAsync = vi.fn(async () => overrides?.isAvailable ?? true);
    const shareAsync = vi.fn(overrides?.shareImpl ?? (async () => {}));
    const Sharing: SharingLike = { isAvailableAsync, shareAsync };
    return { Sharing, isAvailableAsync, shareAsync };
  }

  it("shares the written file as opaque octet-stream with the design dialog title", async () => {
    const sh = makeSharing();

    await shareBackup({ Sharing: sh.Sharing }, URI);

    expect(sh.shareAsync).toHaveBeenCalledWith(URI, {
      mimeType: "application/octet-stream",
      dialogTitle: "Save encrypted backup",
    });
  });

  it("swallows a thrown share rejection (non-fatal)", async () => {
    const sh = makeSharing({
      shareImpl: async () => {
        throw new Error("share sheet already presented");
      },
    });

    // Must not reject even though shareAsync throws — the file is already written and tracked.
    await expect(shareBackup({ Sharing: sh.Sharing }, URI)).resolves.toBeUndefined();
    expect(sh.shareAsync).toHaveBeenCalledTimes(1);
  });

  it("does not share when the share sheet is unavailable", async () => {
    const sh = makeSharing({ isAvailable: false });

    await shareBackup({ Sharing: sh.Sharing }, URI);

    expect(sh.shareAsync).not.toHaveBeenCalled();
  });
});
