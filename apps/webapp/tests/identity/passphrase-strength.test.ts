import { describe, expect, it } from "vitest";
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "@/src/identity/passphrase-strength";

describe("assessPassphrase", () => {
  it("scores an empty passphrase 0 and is not acceptable, with a length tip", () => {
    const a = assessPassphrase("");
    expect(a.score).toBe(0);
    expect(a.acceptable).toBe(false);
    expect(a.tips.length).toBeGreaterThan(0);
  });

  it("marks a below-minimum passphrase as not acceptable with a low score", () => {
    const a = assessPassphrase("short1");
    expect(a.acceptable).toBe(false);
    expect(a.score).toBeLessThanOrEqual(2);
    expect(a.tips.join(" ")).toMatch(/more character/i);
  });

  it("accepts a passphrase at exactly the minimum length", () => {
    const a = assessPassphrase("a".repeat(MIN_PASSPHRASE_LENGTH));
    expect(a.acceptable).toBe(true);
  });

  it("scores a long high-variety passphrase highly and acceptable", () => {
    const a = assessPassphrase("Tr0ub4dour&3xplorer-Vault");
    expect(a.acceptable).toBe(true);
    expect(a.score).toBe(4);
    expect(a.tips).toHaveLength(0);
    expect(a.label).toMatch(/strong/i);
  });

  it("penalizes a common weak string to the score floor", () => {
    const a = assessPassphrase("password");
    expect(a.score).toBe(0);
    expect(a.acceptable).toBe(false);
    expect(a.tips.join(" ")).toMatch(/commonly used/i);
  });

  it("penalizes an obvious sequence run", () => {
    const withRun = assessPassphrase("abcdefgh1234ZZ");
    expect(withRun.tips.join(" ")).toMatch(/run|sequence/i);
  });

  it("rewards 20+ characters over 16 for the same low character-class variety", () => {
    // Two lowercase-only passphrases (2? no — 1 class), differing only in length. The 20+ one must
    // score strictly higher, proving the length>=20 bucket is not dead weight vs length>=16.
    const sixteen = assessPassphrase("abqrwzmnptvxdfhk"); // 16 chars, single class, no run
    const twenty = assessPassphrase("abqrwzmnptvxdfhkjlgs"); // 20 chars, single class, no run
    expect(twenty.score).toBeGreaterThan(sixteen.score);
  });

  it("returns a label for every score", () => {
    for (const pw of ["", "short", "a".repeat(12), "Abcd12-longer!!", "Zx9$Qw7!Vault-Long-Key"]) {
      const a = assessPassphrase(pw);
      expect(a.label).toBeTruthy();
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(4);
    }
  });
});
