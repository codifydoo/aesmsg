import { exportPublicKey, generateIdentity, type PublicKeyString } from "@aesmsg/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  dedupeRetired,
  parseRetiredKeys,
  prependRetired,
  type RetiredKeyEntry,
  retiredExcludingActive,
  sanitizeRetiredEntries,
  serializeRetiredKeys,
} from "@/src/identity/identity-bundle";

// Two real public keys (the bundle transforms key/dedupe on the amk1: string). The `wrapped` field is
// an opaque string to this PURE module — it never unwraps — so a placeholder envelope string is fine.
let pkA: PublicKeyString;
let pkB: PublicKeyString;
let pkC: PublicKeyString;

beforeAll(async () => {
  pkA = exportPublicKey(await generateIdentity());
  pkB = exportPublicKey(await generateIdentity());
  pkC = exportPublicKey(await generateIdentity());
});

function entry(pk: PublicKeyString, retiredAtMs: number): RetiredKeyEntry {
  return {
    wrapped: `{"v":1,"pub":"${pk}"}` as RetiredKeyEntry["wrapped"],
    publicKeyString: pk,
    fingerprint: `AM-${pk.slice(-6)}`,
    retiredAtMs,
  };
}

describe("identity-bundle", () => {
  describe("parseRetiredKeys tolerance", () => {
    it("returns [] for null / undefined / empty", () => {
      expect(parseRetiredKeys(null)).toEqual([]);
      expect(parseRetiredKeys(undefined)).toEqual([]);
      expect(parseRetiredKeys("")).toEqual([]);
    });

    it("returns [] for malformed JSON", () => {
      expect(parseRetiredKeys("{not json")).toEqual([]);
    });

    it("returns [] for a non-object / unknown version / non-array keys", () => {
      expect(parseRetiredKeys("42")).toEqual([]);
      expect(parseRetiredKeys(JSON.stringify({ v: 2, keys: [entry(pkA, 1)] }))).toEqual([]);
      expect(parseRetiredKeys(JSON.stringify({ v: 1, keys: "nope" }))).toEqual([]);
    });

    it("drops individual malformed entries and keeps the valid ones", () => {
      const raw = JSON.stringify({
        v: 1,
        keys: [
          entry(pkA, 3),
          { publicKeyString: pkB }, // missing fields → dropped
          { ...entry(pkB, 2), retiredAtMs: Number.NaN }, // non-finite → dropped
          entry(pkC, 1),
        ],
      });
      const parsed = parseRetiredKeys(raw);
      expect(parsed.map((e) => e.publicKeyString)).toEqual([pkA, pkC]);
    });

    it("round-trips a valid list through serialize → parse", () => {
      const list = [entry(pkA, 2), entry(pkB, 1)];
      expect(parseRetiredKeys(serializeRetiredKeys(list))).toEqual(list);
    });
  });

  describe("sanitizeRetiredEntries", () => {
    it("returns [] for a non-array", () => {
      expect(sanitizeRetiredEntries(null)).toEqual([]);
      expect(sanitizeRetiredEntries("nope")).toEqual([]);
      expect(sanitizeRetiredEntries({})).toEqual([]);
    });

    it("filters invalid entries and dedupes by public key (first wins)", () => {
      const dup = { ...entry(pkA, 1), fingerprint: "AM-stale" };
      const result = sanitizeRetiredEntries([entry(pkA, 5), {}, dup, entry(pkB, 4)]);
      expect(result.map((e) => e.publicKeyString)).toEqual([pkA, pkB]);
      expect(result[0]?.fingerprint).toBe(entry(pkA, 5).fingerprint); // newest (first) kept
    });
  });

  describe("dedupeRetired", () => {
    it("keeps the FIRST occurrence of each public key", () => {
      const first = entry(pkA, 9);
      const stale = { ...entry(pkA, 1), fingerprint: "AM-old" };
      const result = dedupeRetired([first, entry(pkB, 8), stale]);
      expect(result).toEqual([first, entry(pkB, 8)]);
    });
  });

  describe("prependRetired", () => {
    it("prepends newest-first and dedupes a crash-duplicate", () => {
      const existing = [entry(pkB, 2)];
      const result = prependRetired(existing, entry(pkA, 3));
      expect(result.map((e) => e.publicKeyString)).toEqual([pkA, pkB]);
    });

    it("drops the prepended entry's stale copy already present (newest wins)", () => {
      const existing = [{ ...entry(pkA, 1), fingerprint: "AM-old" }, entry(pkB, 2)];
      const fresh = entry(pkA, 3);
      const result = prependRetired(existing, fresh);
      expect(result.map((e) => e.publicKeyString)).toEqual([pkA, pkB]);
      expect(result[0]).toEqual(fresh);
    });
  });

  describe("retiredExcludingActive", () => {
    it("drops any entry whose public key equals the active key", () => {
      const entries = [entry(pkA, 3), entry(pkB, 2)];
      expect(retiredExcludingActive(entries, pkA).map((e) => e.publicKeyString)).toEqual([pkB]);
      expect(retiredExcludingActive(entries, pkC).map((e) => e.publicKeyString)).toEqual([
        pkA,
        pkB,
      ]);
    });
  });
});
