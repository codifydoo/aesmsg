import { exportPublicKey, generateIdentity } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { isAcceptableScan, normalizeScannedPayload } from "@/src/contacts/scanned-key";

describe("isAcceptableScan", () => {
  it("accepts a real amk1: public key", async () => {
    const pk = exportPublicKey(await generateIdentity());
    expect(isAcceptableScan(pk)).toBe(true);
  });

  it("rejects a URL, a vCard, plain text, and a non-amk1 base64 blob", () => {
    expect(isAcceptableScan("https://example.com/some/path?q=1")).toBe(false);
    expect(isAcceptableScan("BEGIN:VCARD\nFN:Alice\nEND:VCARD")).toBe(false);
    expect(isAcceptableScan("just some scanned text")).toBe(false);
    // A base64-looking blob WITHOUT the amk1: prefix must not be forwarded.
    expect(isAcceptableScan("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=")).toBe(false);
  });

  it("normalizeScannedPayload trims surrounding whitespace/newlines", () => {
    expect(normalizeScannedPayload("  amk1:abc  \n")).toBe("amk1:abc");
  });
});
