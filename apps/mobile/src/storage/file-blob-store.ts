// IBlobStore over expo-file-system: one encrypted blob per key as a UTF-8 file under
// ${documentDirectory}aesmsg/<key>.enc. The file contents are already base64( nonce ‖ ct+tag )
// produced by EncryptedStore, so they are written as plain UTF-8 strings — this module never
// touches crypto. The native module is injected (FileSystemLike) so node tests use an in-memory
// fake, exactly as attachment-cache.ts does. We use the SDK 56 `/legacy` string-URI helpers.
import type { IBlobStore } from "@/src/storage/encrypted-store.types";

// Minimal surface of expo-file-system/legacy this store needs. SDK 56 moved the string-URI helpers
// (documentDirectory, *AsStringAsync, getInfoAsync, makeDirectoryAsync, readDirectoryAsync,
// EncodingType) onto the `/legacy` subpath; the new default export is the File/Paths API.
export interface FileSystemLike {
  readonly documentDirectory: string | null;
  readonly EncodingType: { readonly UTF8: string };
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  readDirectoryAsync(uri: string): Promise<string[]>;
}

const SUBDIR = "aesmsg";
const EXT = ".enc";

export class FileBlobStore implements IBlobStore {
  constructor(private readonly fs: FileSystemLike) {}

  private dirUri(): string {
    const base = this.fs.documentDirectory;
    if (base === null) {
      throw new Error("expo-file-system documentDirectory is unavailable");
    }
    return `${base}${SUBDIR}/`;
  }

  // Percent-encode the key so a namespace containing "/" or ".." can never escape aesmsg/.
  private fileUri(key: string): string {
    return `${this.dirUri()}${encodeURIComponent(key)}${EXT}`;
  }

  private async ensureDir(): Promise<void> {
    const dir = this.dirUri();
    const info = await this.fs.getInfoAsync(dir);
    if (!info.exists) {
      await this.fs.makeDirectoryAsync(dir, { intermediates: true });
    }
  }

  async get(key: string): Promise<string | null> {
    const uri = this.fileUri(key);
    const info = await this.fs.getInfoAsync(uri);
    if (!info.exists) return null;
    return this.fs.readAsStringAsync(uri, { encoding: this.fs.EncodingType.UTF8 });
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureDir();
    await this.fs.writeAsStringAsync(this.fileUri(key), value, {
      encoding: this.fs.EncodingType.UTF8,
    });
  }

  async remove(key: string): Promise<void> {
    await this.fs.deleteAsync(this.fileUri(key), { idempotent: true });
  }

  async keys(): Promise<string[]> {
    const dir = this.dirUri();
    const info = await this.fs.getInfoAsync(dir);
    if (!info.exists) return [];
    const entries = await this.fs.readDirectoryAsync(dir);
    return entries
      .filter((name) => name.endsWith(EXT))
      .map((name) => decodeURIComponent(name.slice(0, -EXT.length)));
  }

  async clear(): Promise<void> {
    for (const key of await this.keys()) {
      await this.remove(key);
    }
  }
}
