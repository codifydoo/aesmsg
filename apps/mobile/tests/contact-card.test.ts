import { exportPublicKey, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildContactCard,
  CONTACT_CARD_FILENAME,
  type DocumentPickerLike,
  type FileSystemLike,
  InvalidContactCardError,
  importContactCard,
  parseContactCard,
  pickCardFile,
  readCardFile,
  type SharingLike,
  shareCard,
  writeCardToCache,
} from "@/src/contacts/contact-card";

// Pure + DI module, tested node-env with no renderer and no native mocks — contact-card.ts imports
// only @aesmsg/crypto, the pure label module, and the CACHE_FILE_PREFIX const. The key round-trip
// uses the REAL @aesmsg/crypto, so a card built from a generated identity's public key parses back to
// the same key. The card carries NO fingerprint; parse returns only { label, publicKey }.

describe("buildContactCard", () => {
  it("produces a plaintext contact-card JSON with the fixed filename", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);

    const card = buildContactCard("Alice", pk);

    expect(card.filename).toBe(CONTACT_CARD_FILENAME);
    const parsed = JSON.parse(card.contents);
    expect(parsed).toEqual({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Alice",
      publicKey: pk,
    });
  });

  it("trims the label", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const card = buildContactCard("  Bob  ", pk);
    expect(JSON.parse(card.contents).label).toBe("Bob");
  });

  it("throws InvalidContactCardError on an empty label", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    expect(() => buildContactCard("   ", pk)).toThrow(InvalidContactCardError);
  });

  it("throws InvalidContactCardError on a label longer than 80 chars", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    expect(() => buildContactCard("x".repeat(81), pk)).toThrow(InvalidContactCardError);
  });
});

describe("parseContactCard", () => {
  it("round-trips a built card back to { label, publicKey }", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const card = buildContactCard("Alice", pk);

    const result = await parseContactCard(card.contents);

    expect(result).toEqual({ ok: true, card: { label: "Alice", publicKey: pk } });
  });

  it("ignores any fingerprint field carried in the file (never trusts it)", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    // A hand-crafted card with a bogus fingerprint field: parse must drop it entirely.
    const contents = JSON.stringify({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Mallory",
      publicKey: pk,
      fingerprint: "AM-DEAD-BEEF",
    });

    const result = await parseContactCard(contents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card).toEqual({ label: "Mallory", publicKey: pk });
      expect("fingerprint" in result.card).toBe(false);
    }
  });

  it("returns invalid-file on non-JSON input", async () => {
    expect(await parseContactCard("not json")).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("returns invalid-file on empty input", async () => {
    expect(await parseContactCard("")).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("returns wrong-file-type when the type tag is absent or different", async () => {
    // An identity-backup envelope (a WrappedKey) has no contact-card type tag.
    expect(await parseContactCard('{"v":1,"kdf":{}}')).toEqual({
      ok: false,
      reason: "wrong-file-type",
    });
    expect(await parseContactCard('{"type":"aesmsg.backup","publicKey":"amk1:x"}')).toEqual({
      ok: false,
      reason: "wrong-file-type",
    });
  });

  it("returns invalid-file when the type is right but the key is malformed", async () => {
    const contents = JSON.stringify({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Nope",
      publicKey: "not-an-amk1-key",
    });
    expect(await parseContactCard(contents)).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("recovers a real fingerprint from the parsed key (recomputed downstream, not from file)", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const result = await parseContactCard(buildContactCard("Alice", pk).contents);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The authoritative fingerprint comes from the key, computed here exactly as addContact does.
      expect(await fingerprint(result.card.publicKey)).toEqual(await fingerprint(pk));
    }
  });
});

const CARD = {
  filename: "aesmsg-contact-card.aesmsg",
  contents: '{"type":"aesmsg.contact-card"}',
} as const;

describe("writeCardToCache", () => {
  it("writes to a CACHE_FILE_PREFIX cache URI and returns a working cleanup hook", async () => {
    const writeAsStringAsync = vi.fn(async () => {});
    const deleteAsync = vi.fn(async () => {});
    const FileSystem = { cacheDirectory: "file:///cache/", writeAsStringAsync, deleteAsync };

    const written = await writeCardToCache({ FileSystem }, CARD);

    expect(writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [uri, contents] = writeAsStringAsync.mock.calls[0];
    expect(uri).toContain("file:///cache/");
    expect(uri).toContain("aesmsg-"); // CACHE_FILE_PREFIX so Clear-local-history reclaims orphans
    expect(uri).toContain("aesmsg-contact-card.aesmsg");
    expect(contents).toBe(CARD.contents);
    expect(written.uri).toBe(uri);

    await written.cleanup();
    expect(deleteAsync).toHaveBeenCalledWith(written.uri, { idempotent: true });
  });
});

describe("shareCard", () => {
  const URI = "file:///cache/aesmsg-1-aesmsg-contact-card.aesmsg";

  it("shares as octet-stream with the contact-card dialog title", async () => {
    const shareAsync = vi.fn(async () => {});
    const Sharing = { isAvailableAsync: vi.fn(async () => true), shareAsync };

    await shareCard({ Sharing }, URI);

    expect(shareAsync).toHaveBeenCalledWith(URI, {
      mimeType: "application/octet-stream",
      dialogTitle: "Share contact card",
    });
  });

  it("swallows a thrown share rejection (non-fatal)", async () => {
    const Sharing = {
      isAvailableAsync: vi.fn(async () => true),
      shareAsync: vi.fn(async () => {
        throw new Error("share sheet already presented");
      }),
    };
    await expect(shareCard({ Sharing }, URI)).resolves.toBeUndefined();
  });

  it("does not share when the share sheet is unavailable", async () => {
    const shareAsync = vi.fn(async () => {});
    const Sharing = { isAvailableAsync: vi.fn(async () => false), shareAsync };
    await shareCard({ Sharing }, URI);
    expect(shareAsync).not.toHaveBeenCalled();
  });
});

describe("pickCardFile", () => {
  it("returns the first asset and requests a cached copy", async () => {
    const getDocumentAsync = vi.fn(async () => ({
      canceled: false,
      assets: [{ uri: "file:///tmp/card.aesmsg", name: "card.aesmsg", size: 120 }],
    }));
    const picked = await pickCardFile({ DocumentPicker: { getDocumentAsync } });
    expect(picked).toEqual({ uri: "file:///tmp/card.aesmsg", name: "card.aesmsg", size: 120 });
    expect(getDocumentAsync).toHaveBeenCalledWith({ copyToCacheDirectory: true });
  });

  it("returns null on cancel", async () => {
    const getDocumentAsync = vi.fn(async () => ({ canceled: true, assets: null }));
    expect(await pickCardFile({ DocumentPicker: { getDocumentAsync } })).toBeNull();
  });
});

describe("readCardFile", () => {
  it("reads UTF-8 over the injected FileSystem", async () => {
    const readAsStringAsync = vi.fn(async () => "{}");
    const FileSystem = { EncodingType: { UTF8: "utf8" }, readAsStringAsync };
    expect(await readCardFile({ FileSystem }, "file:///tmp/card.aesmsg")).toBe("{}");
    expect(readAsStringAsync).toHaveBeenCalledWith("file:///tmp/card.aesmsg", { encoding: "utf8" });
  });
});

describe("importContactCard", () => {
  function deps(fileText: string | Error, canceled = false) {
    const getDocumentAsync = vi.fn(async () =>
      canceled
        ? { canceled: true, assets: null }
        : {
            canceled: false,
            assets: [{ uri: "file:///tmp/card.aesmsg", name: "card.aesmsg", size: 1 }],
          },
    );
    const readAsStringAsync = vi.fn(async () => {
      if (fileText instanceof Error) throw fileText;
      return fileText;
    });
    return {
      DocumentPicker: { getDocumentAsync },
      FileSystem: { EncodingType: { UTF8: "utf8" }, readAsStringAsync },
    };
  }

  it("returns canceled when the picker is dismissed", async () => {
    expect(await importContactCard(deps("", true))).toEqual({ kind: "canceled" });
  });

  it("returns picked with the parsed card on a valid file", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const contents = buildContactCard("Alice", pk).contents;
    expect(await importContactCard(deps(contents))).toEqual({
      kind: "picked",
      card: { label: "Alice", publicKey: pk },
    });
  });

  it("returns error/wrong-file-type on a non-card file", async () => {
    expect(await importContactCard(deps('{"v":1}'))).toEqual({
      kind: "error",
      reason: "wrong-file-type",
    });
  });

  it("returns error/invalid-file when the file read throws", async () => {
    expect(await importContactCard(deps(new Error("read failed")))).toEqual({
      kind: "error",
      reason: "invalid-file",
    });
  });
});
