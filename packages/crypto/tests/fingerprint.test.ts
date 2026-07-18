import { describe, expect, it } from "vitest";
import { compareFingerprint, fingerprint, truncateFingerprint } from "../src/fingerprint.js";
import { exportPublicKey, generateIdentity } from "../src/identity.js";
import type { Fingerprint, PublicKeyString } from "../src/types.js";

describe("fingerprint", () => {
  it("returns AM- + 8 groups of 4 uppercase hex chars dash-separated", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const fp = await fingerprint(pk);
    expect(fp).toMatch(/^AM-[0-9A-F]{4}(-[0-9A-F]{4}){7}$/);
    expect(fp).toHaveLength(42);
  });

  it("is deterministic — same pubkey produces same fingerprint", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const a = await fingerprint(pk);
    const b = await fingerprint(pk);
    expect(a).toBe(b);
  });

  it("distinguishes different public keys", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = await generateIdentity();
      const pk = exportPublicKey(id);
      const fp = await fingerprint(pk);
      seen.add(fp);
    }
    expect(seen.size).toBe(50);
  });

  it("rejects strings that are not valid amk1: pubkeys", async () => {
    await expect(fingerprint("garbage" as unknown as PublicKeyString)).rejects.toBeTruthy();
  });
});

describe("truncateFingerprint", () => {
  const fullFp = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;

  it("returns 4 space-separated groups for groups=4", () => {
    expect(truncateFingerprint(fullFp, 4)).toBe("A91C 22F0 78BB 19D2");
  });

  it("returns 1 group for groups=1", () => {
    expect(truncateFingerprint(fullFp, 1)).toBe("A91C");
  });

  it("returns all 8 groups for groups=8", () => {
    expect(truncateFingerprint(fullFp, 8)).toBe("A91C 22F0 78BB 19D2 AAAA BBBB CCCC DDDD");
  });

  it("throws for groups < 1", () => {
    expect(() => truncateFingerprint(fullFp, 0)).toThrow();
  });

  it("throws for groups > 8", () => {
    expect(() => truncateFingerprint(fullFp, 9)).toThrow();
  });
});

describe("compareFingerprint", () => {
  it("returns true for identical fingerprints", () => {
    const a = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const b = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(true);
  });

  it("returns false for fingerprints differing in the first hex group", () => {
    const a = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const b = "AM-Z91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("returns false for fingerprints differing in the last hex char", () => {
    const a = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const b = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDE" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("returns false for different-length inputs", () => {
    const a = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const b = "AM-A91C-22F0" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("touches every character regardless of where the mismatch is (no early return)", () => {
    const a = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const earlyMismatch = "AM-Z91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const lateMismatch = "AM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDE" as Fingerprint;
    for (let i = 0; i < 100; i++) {
      expect(compareFingerprint(a, earlyMismatch)).toBe(false);
      expect(compareFingerprint(a, lateMismatch)).toBe(false);
    }
  });
});
