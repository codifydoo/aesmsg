import { beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore, type FileSystemLike } from "@/src/storage/file-blob-store";

// In-memory fake of the minimal expo-file-system/legacy surface FileBlobStore needs. Mirrors how
// reader-cache-cleanup.test.ts fakes FileSystemLike — no native module loads under node.
function makeFakeFs(
  documentDirectory = "file:///docs/",
): FileSystemLike & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    documentDirectory,
    EncodingType: { UTF8: "utf8", Base64: "base64" },
    async getInfoAsync(uri) {
      const exists = files.has(uri) || dirs.has(uri.replace(/\/$/, "")) || dirs.has(uri);
      return { exists };
    },
    async makeDirectoryAsync(uri) {
      dirs.add(uri.replace(/\/$/, ""));
    },
    async readAsStringAsync(uri) {
      if (!files.has(uri)) throw new Error(`ENOENT ${uri}`);
      return files.get(uri) as string;
    },
    async writeAsStringAsync(uri, contents) {
      files.set(uri, contents);
    },
    async deleteAsync(uri) {
      files.delete(uri);
    },
    async readDirectoryAsync(uri) {
      const prefix = uri.endsWith("/") ? uri : `${uri}/`;
      return [...files.keys()]
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length));
    },
  };
}

describe("FileBlobStore", () => {
  let fs: ReturnType<typeof makeFakeFs>;
  let store: FileBlobStore;

  beforeEach(() => {
    fs = makeFakeFs();
    store = new FileBlobStore(fs);
  });

  it("set then get round-trips the string under aesmsg/<key>.enc", async () => {
    await store.set("contacts", "BLOB-DATA");
    expect(fs.files.get("file:///docs/aesmsg/contacts.enc")).toBe("BLOB-DATA");
    expect(await store.get("contacts")).toBe("BLOB-DATA");
  });

  it("get returns null for a key that was never written", async () => {
    expect(await store.get("settings")).toBeNull();
  });

  it("ensures the aesmsg directory exists before writing", async () => {
    await store.set("contacts", "x");
    expect(fs.dirs.has("file:///docs/aesmsg")).toBe(true);
  });

  it("remove deletes one key's file, leaving others", async () => {
    await store.set("contacts", "a");
    await store.set("settings", "b");
    await store.remove("contacts");
    expect(await store.get("contacts")).toBeNull();
    expect(await store.get("settings")).toBe("b");
  });

  it("remove of a missing key is a no-op (does not throw)", async () => {
    await expect(store.remove("never-written")).resolves.toBeUndefined();
  });

  it("keys lists stored namespaces with the .enc extension stripped", async () => {
    await store.set("contacts", "a");
    await store.set("sent-links", "b");
    await store.set("settings", "c");
    expect((await store.keys()).sort()).toEqual(["contacts", "sent-links", "settings"]);
  });

  it("keys returns an empty list when the directory does not exist yet", async () => {
    expect(await store.keys()).toEqual([]);
  });

  it("clear removes every stored blob", async () => {
    await store.set("contacts", "a");
    await store.set("sent-links", "b");
    await store.clear();
    expect(await store.get("contacts")).toBeNull();
    expect(await store.get("sent-links")).toBeNull();
    expect(await store.keys()).toEqual([]);
  });

  it("URI-encodes the key so it cannot escape the aesmsg directory", async () => {
    await store.set("../evil", "x");
    // The slash is percent-encoded, so the file stays inside aesmsg/.
    const written = [...fs.files.keys()][0] as string;
    expect(written.startsWith("file:///docs/aesmsg/")).toBe(true);
    expect(written.includes("/../")).toBe(false);
    expect(await store.get("../evil")).toBe("x");
  });
});
