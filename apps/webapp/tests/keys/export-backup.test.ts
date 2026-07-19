import {
  DEFAULT_WRAP_KDF_PARAMS,
  exportPublicKey,
  generateIdentity,
  readWrapKdfParams,
  unwrapPrivateKey,
  type WrappedKey,
} from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKUP_FILENAME, buildBackup, downloadBackup } from "@/src/keys/export-backup";

const PASSPHRASE = "correct horse battery staple";

describe("export-backup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("buildBackup produces the mobile-format WrappedKey envelope under the HEAVY KDF params", async () => {
    const id = await generateIdentity();
    const backup = await buildBackup(id, PASSPHRASE);

    expect(backup.filename).toBe("aesmsg-identity-backup.aesmsg");
    expect(BACKUP_FILENAME).toBe("aesmsg-identity-backup.aesmsg");

    // The body is the WrappedKey JSON envelope with exactly the mobile/crypto keys.
    const env = JSON.parse(backup.contents);
    expect(Object.keys(env).sort()).toEqual(
      ["ct", "iv", "kdf", "m_kib", "p", "pub", "salt", "t", "v"].sort(),
    );
    expect(env.kdf).toBe("argon2id-aes256gcm");
    expect(env.v).toBe(1);

    // The recorded KDF params are the HEAVY defaults (64 MiB / t=3 / p=1) — a low-entropy passphrase.
    expect(readWrapKdfParams(backup.contents as WrappedKey)).toEqual(DEFAULT_WRAP_KDF_PARAMS);

    // Round-trip: unwrapping the file with the same passphrase recovers the SAME public key.
    const restored = await unwrapPrivateKey(backup.contents as WrappedKey, PASSPHRASE);
    expect(exportPublicKey(restored)).toBe(exportPublicKey(id));
  });

  it("downloadBackup creates + revokes an object URL and issues ZERO network requests", async () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // Prevent an actual browser download while still exercising the <a download> handoff.
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadBackup({ filename: BACKUP_FILENAME, contents: '{"v":1}' });

    expect(create).toHaveBeenCalledTimes(1);
    // The Blob is opaque application/octet-stream (ciphertext, not a recognizable key).
    const blob = create.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/octet-stream");
    expect(click).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    // The object URL is revoked on the next tick so no key reference lingers.
    await new Promise((r) => setTimeout(r, 5));
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });
});
