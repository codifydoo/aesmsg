import { exportPublicKey, generateIdentity } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { buildBackup } from "@/src/keys/export-backup";
import { formatBackupSize, readBackupFile, restoreIdentity } from "@/src/onboarding/import-backup";

const PASSPHRASE = "correct horse battery staple";
const WRONG = "not the passphrase at all";

describe("import-backup", () => {
  it("restoreIdentity: a web-built backup restores to the SAME public key", async () => {
    const id = await generateIdentity();
    const backup = await buildBackup(id, PASSPHRASE);

    const result = await restoreIdentity(backup.contents, PASSPHRASE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(exportPublicKey(result.identity)).toBe(exportPublicKey(id));
    }
  });

  it("restoreIdentity: a wrong passphrase → bad-passphrase (terminal, no partial recovery)", async () => {
    const id = await generateIdentity();
    const backup = await buildBackup(id, PASSPHRASE);
    const result = await restoreIdentity(backup.contents, WRONG);
    expect(result).toEqual({ ok: false, reason: "bad-passphrase" });
  });

  it("restoreIdentity: malformed JSON → invalid-file (never throws)", async () => {
    const result = await restoreIdentity("{not valid json", PASSPHRASE);
    expect(result).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("restoreIdentity: a well-formed-JSON but non-envelope → invalid-file", async () => {
    const result = await restoreIdentity(JSON.stringify({ hello: "world" }), PASSPHRASE);
    expect(result).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("restoreIdentity: a bumped/unknown envelope version → invalid-file", async () => {
    const id = await generateIdentity();
    const backup = await buildBackup(id, PASSPHRASE);
    const env = JSON.parse(backup.contents);
    env.v = 999;
    const result = await restoreIdentity(JSON.stringify(env), PASSPHRASE);
    expect(result).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("readBackupFile reads a File's text (the WrappedKey envelope)", async () => {
    const file = new File(['{"v":1}'], "aesmsg-identity-backup.aesmsg", {
      type: "application/octet-stream",
    });
    expect(await readBackupFile(file)).toBe('{"v":1}');
  });

  it("formatBackupSize: MB at/above 1 MiB, KB below", () => {
    expect(formatBackupSize(512)).toBe("0.5 KB");
    expect(formatBackupSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatBackupSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
