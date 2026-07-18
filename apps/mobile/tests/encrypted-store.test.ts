import { beforeEach, describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "@/src/lib/base64";
import { EncryptedStore } from "@/src/storage/encrypted-store";
import { DecryptionError, type IBlobStore } from "@/src/storage/encrypted-store.types";

// In-memory blob backend, swapped for expo-file-system in production. One Map per test (cleared in
// beforeEach) gives byte-for-byte the same get/set/remove/clear/keys contract the device backend has.
function makeMapBlobStore(): IBlobStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async get(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

// A fixed, valid 256-bit key — REAL crypto.subtle AES-GCM runs against it (Node 22 supplies
// globalThis.crypto.subtle natively, so no polyfill is needed in node-env tests).
function makeDek(): Uint8Array {
  const dek = new Uint8Array(32);
  for (let i = 0; i < 32; i++) dek[i] = (i * 7 + 3) & 0xff;
  return dek;
}

describe("EncryptedStore", () => {
  let blob: ReturnType<typeof makeMapBlobStore>;
  let store: EncryptedStore;

  beforeEach(() => {
    blob = makeMapBlobStore();
    store = new EncryptedStore({ blobStore: blob, dek: makeDek() });
  });

  it("round-trips a JSON value through encrypt -> decrypt", async () => {
    const value = { label: "Acme prod key", verified: true, n: 42, list: ["a", "b"] };
    await store.setJson("contacts", value);
    const loaded = await store.getJson<typeof value>("contacts");
    expect(loaded).toEqual(value);
  });

  it("returns null for a key that was never written", async () => {
    expect(await store.getJson("settings")).toBeNull();
  });

  it("persists ciphertext, not plaintext (no recognizable substring leaks)", async () => {
    await store.setJson("contacts", { secretLabel: "TOP-SECRET-RECIPIENT" });
    const raw = blob.map.get("contacts");
    expect(typeof raw).toBe("string");
    expect(raw).not.toContain("TOP-SECRET-RECIPIENT");
    expect(raw).not.toContain("secretLabel");
  });

  it("uses a fresh nonce per write: same value encrypts to different blobs", async () => {
    const value = { x: 1 };
    await store.setJson("a", value);
    const first = blob.map.get("a");
    await store.setJson("a", value);
    const second = blob.map.get("a");
    expect(first).not.toBe(second);
    // ...and the latest still decrypts back to the same plaintext.
    expect(await store.getJson("a")).toEqual(value);
  });

  it("throws DecryptionError when the stored blob is tampered", async () => {
    await store.setJson("contacts", { label: "x" });
    const raw = blob.map.get("contacts") as string;
    // Deterministic tamper: decode to bytes, flip the last byte of the frame (well inside
    // the ciphertext+tag region that follows the 12-byte nonce), re-encode. XOR with 0xff
    // guarantees the byte value changes regardless of the original. GCM authentication
    // covers every byte after the nonce, so this ALWAYS triggers DecryptionError.
    const frame = base64ToBytes(raw);
    frame[frame.length - 1] ^= 0xff;
    blob.map.set("contacts", bytesToBase64(frame));
    await expect(store.getJson("contacts")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError when the framing is malformed (too short to hold a nonce)", async () => {
    blob.map.set("contacts", "QUJD"); // base64 "ABC" — 3 bytes, shorter than the 12-byte nonce
    await expect(store.getJson("contacts")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError when decrypted with a different DEK", async () => {
    await store.setJson("contacts", { label: "x" });
    const otherDek = new Uint8Array(32).fill(9);
    const otherStore = new EncryptedStore({ blobStore: blob, dek: otherDek });
    await expect(otherStore.getJson("contacts")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("isolates namespaces: writing one key does not affect another", async () => {
    await store.setJson("contacts", { kind: "contacts" });
    await store.setJson("sent-links", { kind: "links" });
    await store.setJson("settings", { kind: "settings" });
    expect(await store.getJson("contacts")).toEqual({ kind: "contacts" });
    expect(await store.getJson("sent-links")).toEqual({ kind: "links" });
    expect(await store.getJson("settings")).toEqual({ kind: "settings" });
  });

  it("remove deletes a single key, leaving others intact", async () => {
    await store.setJson("contacts", { a: 1 });
    await store.setJson("settings", { b: 2 });
    await store.remove("contacts");
    expect(await store.getJson("contacts")).toBeNull();
    expect(await store.getJson("settings")).toEqual({ b: 2 });
  });

  it("clear removes every key", async () => {
    await store.setJson("contacts", { a: 1 });
    await store.setJson("sent-links", { b: 2 });
    await store.clear();
    expect(await store.getJson("contacts")).toBeNull();
    expect(await store.getJson("sent-links")).toBeNull();
    expect(blob.map.size).toBe(0);
  });

  it("uses the injected randomBytes for the nonce (12 bytes per write)", async () => {
    const calls: number[] = [];
    const fixed = new Uint8Array(12).fill(1);
    const injected = new EncryptedStore({
      blobStore: blob,
      dek: makeDek(),
      randomBytes: (n) => {
        calls.push(n);
        return fixed.slice(0, n);
      },
    });
    await injected.setJson("a", { ok: true });
    expect(calls).toEqual([12]);
    expect(await injected.getJson("a")).toEqual({ ok: true });
  });
});
