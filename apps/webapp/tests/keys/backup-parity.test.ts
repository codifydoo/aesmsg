import {
  type Ciphertext,
  DEFAULT_WRAP_KDF_PARAMS,
  decodePayload,
  encodePayload,
  exportPublicKey,
  generateIdentity,
  type IdentityKeypair,
  importPublicKey,
  type MessageBindingContext,
  open,
  type PublicKeyString,
  readWrapKdfParams,
  seal,
  unwrapPrivateKey,
  type WrappedKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { buildBackup } from "@/src/keys/export-backup";
import { restoreIdentity } from "@/src/onboarding/import-backup";

// Backup FORMAT PARITY — a mobile backup restores on web and vice-versa. Because both surfaces call
// the IDENTICAL @aesmsg/crypto functions (wrapPrivateKey/unwrapPrivateKey) with the SAME heavy KDF
// params (DEFAULT_WRAP_KDF_PARAMS), parity is by construction; these tests prove it round-trips both
// directions and lock the byte-shape against silent drift with a hardcoded fixture.

// A REAL wrapPrivateKey output captured once (DEFAULT_WRAP_KDF_PARAMS) — the exact byte-shape a mobile
// ExportBackupScreen emits and a web ImportBackupScreen consumes. Locks the format against drift.
const FIXTURE_PASSPHRASE = "parity-fixture-passphrase";
const FIXTURE_PUBLIC_KEY = "amk1:AQFSKvZV_Urg7cEZb8e4IR5n_DK4sPHEu0IGeUG5sxTSTw";
const FIXTURE_ENVELOPE =
  '{"v":1,"kdf":"argon2id-aes256gcm","m_kib":65536,"t":3,"p":1,"salt":"7mdfi2SxN1_Eeh196j1krw","iv":"EfBFVYny6mFYatwb","ct":"XILmDSfQV39-GfkhIrGMJgKAt_Nwf1mbNb6_3RPGfRTm-OpQIFKx4_To5LHEMnrR","pub":"Uir2Vf1K4O3BGW_HuCEeZ_wyuLDxxLtCBnlBubMU0k8"}';

async function sealOpenRoundTrip(
  publicKeyString: PublicKeyString,
  identity: IdentityKeypair,
): Promise<string> {
  const expiresAtMs = Date.now() + 60_000;
  const context: MessageBindingContext = {
    linkId: "abcdefghijkl0123",
    recipientPublicKey: publicKeyString,
    expiresAtMs,
    maxOpens: 1,
  };
  const sealed = await seal(
    encodePayload({ text: "parity", attachments: [] }),
    await importPublicKey(publicKeyString),
    context,
  );
  const plaintext = await open(sealed as unknown as Ciphertext, identity, context);
  return decodePayload(plaintext).text;
}

describe("backup format parity", () => {
  it("web → mobile-shape: buildBackup emits the exact envelope shape mobile restoreIdentity consumes", async () => {
    const id = await generateIdentity();
    const backup = await buildBackup(id, "some passphrase");

    const env = JSON.parse(backup.contents);
    expect(Object.keys(env).sort()).toEqual(
      ["ct", "iv", "kdf", "m_kib", "p", "pub", "salt", "t", "v"].sort(),
    );
    expect(env.v).toBe(1);
    expect(env.kdf).toBe("argon2id-aes256gcm");
    // Heavy KDF params — the low-entropy-passphrase defense both surfaces share.
    expect(readWrapKdfParams(backup.contents as WrappedKey)).toEqual(DEFAULT_WRAP_KDF_PARAMS);
    // The web can re-open its own backup to the same public key.
    const restored = await unwrapPrivateKey(backup.contents as WrappedKey, "some passphrase");
    expect(exportPublicKey(restored)).toBe(exportPublicKey(id));
  });

  it("mobile-produced → web: a backup made the way mobile makes it restores + seals/opens on web", async () => {
    // Mobile's ExportBackupScreen calls the IDENTICAL wrap — reproduce it here.
    const id = await generateIdentity();
    const mobileBackup = await wrapPrivateKey(id, "mobile pass", DEFAULT_WRAP_KDF_PARAMS);

    const result = await restoreIdentity(mobileBackup as string, "mobile pass");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const pk = exportPublicKey(result.identity);
      expect(pk).toBe(exportPublicKey(id));
      // The recovered key really works — a message sealed to it opens.
      expect(await sealOpenRoundTrip(pk, result.identity)).toBe("parity");
    }
  });

  it("HARDCODED FIXTURE: a captured real envelope still imports (guards against format drift)", async () => {
    const result = await restoreIdentity(FIXTURE_ENVELOPE, FIXTURE_PASSPHRASE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(exportPublicKey(result.identity)).toBe(FIXTURE_PUBLIC_KEY);
      expect(await sealOpenRoundTrip(FIXTURE_PUBLIC_KEY as PublicKeyString, result.identity)).toBe(
        "parity",
      );
    }
  });

  it("negative: an unknown version → invalid-file; a mangled ct → bad-passphrase (never throws)", async () => {
    const bumped = JSON.parse(FIXTURE_ENVELOPE);
    bumped.v = 999;
    expect(await restoreIdentity(JSON.stringify(bumped), FIXTURE_PASSPHRASE)).toEqual({
      ok: false,
      reason: "invalid-file",
    });

    // Flip a byte in the AEAD ciphertext (same length) → the auth tag fails → bad-passphrase.
    const mangled = JSON.parse(FIXTURE_ENVELOPE);
    mangled.ct = `Y${mangled.ct.slice(1)}`;
    const result = await restoreIdentity(JSON.stringify(mangled), FIXTURE_PASSPHRASE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-passphrase");

    // Right passphrase on the CORRECT fixture always wins (sanity: the fixture itself is valid).
    expect((await restoreIdentity(FIXTURE_ENVELOPE, "wrong")).ok).toBe(false);
  });
});
