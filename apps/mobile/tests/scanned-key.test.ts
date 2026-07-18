import { describe, expect, it } from "vitest";
import { isAcceptableScan, normalizeScannedPayload } from "@/src/contacts/scanned-key";

describe("normalizeScannedPayload", () => {
  it("trims surrounding whitespace and newlines", () => {
    expect(normalizeScannedPayload("  amk1:abc \n")).toBe("amk1:abc");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(normalizeScannedPayload("   ")).toBe("");
    expect(normalizeScannedPayload("")).toBe("");
  });
});

describe("isAcceptableScan", () => {
  it("accepts something shaped like an aesmsg public key", () => {
    expect(isAcceptableScan(`amk1:${"a".repeat(48)}`)).toBe(true);
  });

  it("rejects a non-aesmsg QR payload (URL, plain text)", () => {
    expect(isAcceptableScan("https://example.com")).toBe(false);
    expect(isAcceptableScan("hello world")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isAcceptableScan("")).toBe(false);
  });

  it("rejects the prefix alone when the body is too short (the && boundary)", () => {
    expect(isAcceptableScan("amk1:abc")).toBe(false);
  });

  it("normalizes before checking (whitespace-wrapped key is accepted)", () => {
    expect(isAcceptableScan(`  amk1:${"a".repeat(48)}\n`)).toBe(true);
  });
});
