import { describe, expect, it } from "vitest";
import { chunkFingerprint } from "@/src/components/fingerprint-format";

// chunkFingerprint backs the Fingerprint primitive (renders the mono block). Pure logic tested
// here per the node-env / no-React-renderer convention.

describe("chunkFingerprint", () => {
  it("groups into 4-char chunks by default", () => {
    expect(chunkFingerprint("A1B2C3D4")).toBe("A1B2 C3D4");
    expect(chunkFingerprint("A1B2C3D4E5F6")).toBe("A1B2 C3D4 E5F6");
  });

  it("is idempotent — re-chunking already-spaced input normalizes first", () => {
    expect(chunkFingerprint("A1B2 C3D4")).toBe("A1B2 C3D4");
    expect(chunkFingerprint(chunkFingerprint("A1B2C3D4E5F6"))).toBe("A1B2 C3D4 E5F6");
  });

  it("handles a trailing partial group", () => {
    expect(chunkFingerprint("A1B2C")).toBe("A1B2 C");
  });

  it("honors a custom group size", () => {
    expect(chunkFingerprint("AABBCC", 2)).toBe("AA BB CC");
    expect(chunkFingerprint("ABCDEF", 3)).toBe("ABC DEF");
  });

  it("clamps a non-positive size to 1 instead of hanging", () => {
    expect(chunkFingerprint("ABC", 0)).toBe("A B C");
    expect(chunkFingerprint("ABC", -5)).toBe("A B C");
  });

  it("returns an empty string for empty / whitespace input", () => {
    expect(chunkFingerprint("")).toBe("");
    expect(chunkFingerprint("    ")).toBe("");
  });
});
