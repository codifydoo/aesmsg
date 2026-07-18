import type { PublicKeyString, WrappedKey } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import {
  dedupeRetired,
  parseRetiredKeys,
  prependRetired,
  type RetiredKeyEntry,
  retiredExcludingActive,
  serializeRetiredKeys,
} from "@/src/identity/identity-bundle";

// Pure tests for the multi-key identity model's retired-key list + at-rest (de)serialization. No
// crypto, no storage — just the data-shape transforms rotation/unlock rely on.

function entry(pk: string, retiredAtMs = 1000): RetiredKeyEntry {
  return {
    wrapped: `wrapped:${pk}` as WrappedKey,
    publicKeyString: `amk1:${pk}` as PublicKeyString,
    fingerprint: `AM-${pk}`,
    retiredAtMs,
  };
}

describe("identity-bundle: serialize / parse", () => {
  it("round-trips a list of retired entries", () => {
    const list = [entry("A", 3000), entry("B", 2000), entry("C", 1000)];
    const parsed = parseRetiredKeys(serializeRetiredKeys(list));
    expect(parsed).toEqual(list);
  });

  it("round-trips an empty list", () => {
    expect(parseRetiredKeys(serializeRetiredKeys([]))).toEqual([]);
  });

  it("returns [] on null / empty / malformed input (never throws — must not brick unlock)", () => {
    expect(parseRetiredKeys(null)).toEqual([]);
    expect(parseRetiredKeys(undefined)).toEqual([]);
    expect(parseRetiredKeys("")).toEqual([]);
    expect(parseRetiredKeys("not json")).toEqual([]);
    expect(parseRetiredKeys("[]")).toEqual([]); // bare array, not the versioned blob
    expect(parseRetiredKeys('{"v":999,"keys":[]}')).toEqual([]); // unknown version
    expect(parseRetiredKeys('{"v":1,"keys":"nope"}')).toEqual([]); // keys not an array
  });

  it("drops individual malformed entries but keeps valid ones", () => {
    const good = entry("A");
    const raw = JSON.stringify({
      v: 1,
      keys: [
        good,
        { wrapped: "x" }, // missing fields
        { ...entry("B"), retiredAtMs: "nope" }, // wrong type
        null,
      ],
    });
    expect(parseRetiredKeys(raw)).toEqual([good]);
  });
});

describe("identity-bundle: dedupe / prepend / exclude-active", () => {
  it("dedupeRetired keeps the FIRST (newest) occurrence of a public key", () => {
    const newest = entry("A", 5000);
    const older = entry("A", 1000);
    expect(dedupeRetired([newest, older, entry("B", 2000)])).toEqual([newest, entry("B", 2000)]);
  });

  it("prependRetired puts the new entry first (newest→oldest) and dedupes", () => {
    const existing = [entry("B", 2000), entry("C", 1000)];
    const fresh = entry("A", 3000);
    expect(prependRetired(existing, fresh)).toEqual([fresh, ...existing]);
  });

  it("prependRetired collapses a re-retired key to the freshly-prepended copy (keep-indefinitely, no dup)", () => {
    const existing = [entry("A", 1000), entry("B", 2000)];
    const reAgain = entry("A", 9000);
    expect(prependRetired(existing, reAgain)).toEqual([reAgain, entry("B", 2000)]);
  });

  it("retiredExcludingActive removes an entry matching the active public key (crash-dup guard)", () => {
    const list = [entry("A"), entry("B")];
    expect(retiredExcludingActive(list, "amk1:A" as PublicKeyString)).toEqual([entry("B")]);
    expect(retiredExcludingActive(list, "amk1:Z" as PublicKeyString)).toEqual(list);
  });
});
