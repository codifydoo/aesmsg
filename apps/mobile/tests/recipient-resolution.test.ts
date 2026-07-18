import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import {
  type RecipientContactRef,
  resolveRecipient,
  UNKNOWN_RECIPIENT_NAME,
} from "@/src/links/recipient-resolution";

// Pure recipient resolution for the Link details "recipient" card: a sealed-to fingerprint is matched
// against the on-device contacts directory. No store, no React — the truncation + trust rules are
// pinned in Node.

// A real 8-group fingerprint so truncateFingerprint(fp, 2) has something to slice.
const FP_A = "AM-1111-2222-3333-4444-5555-6666-7777-8888" as Fingerprint;
const FP_B = "AM-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-9999" as Fingerprint;
const FP_UNKNOWN = "AM-DEAD-BEEF-CAFE-BABE-0123-4567-89AB-CDEF" as Fingerprint;

function contact(
  over: Partial<RecipientContactRef> & { fingerprint: Fingerprint },
): RecipientContactRef {
  return {
    label: "Elena Rodriguez",
    verified: false,
    previousFingerprints: [],
    ...over,
  };
}

describe("resolveRecipient", () => {
  it("matches the current key → contact name + real verified state + truncated fp", () => {
    const result = resolveRecipient(FP_A, [contact({ fingerprint: FP_A, verified: true })]);
    expect(result.name).toBe("Elena Rodriguez");
    expect(result.verified).toBe(true);
    expect(result.shortFingerprint).toBe("1111 2222");
  });

  it("an unverified current-key contact stays unverified", () => {
    const result = resolveRecipient(FP_A, [contact({ fingerprint: FP_A, verified: false })]);
    expect(result.name).toBe("Elena Rodriguez");
    expect(result.verified).toBe(false);
  });

  it("matches a PREVIOUS (rotated-away) key → name kept, but NEVER verified", () => {
    const result = resolveRecipient(FP_A, [
      contact({ label: "Marcus", fingerprint: FP_B, verified: true, previousFingerprints: [FP_A] }),
    ]);
    expect(result.name).toBe("Marcus");
    // Sealed to a key the contact has since rotated away from — the current verified state doesn't
    // apply to this link.
    expect(result.verified).toBe(false);
    expect(result.shortFingerprint).toBe("1111 2222");
  });

  it("no match → neutral Unknown recipient + truncated fp, unverified", () => {
    const result = resolveRecipient(FP_UNKNOWN, [contact({ fingerprint: FP_A, verified: true })]);
    expect(result.name).toBe(UNKNOWN_RECIPIENT_NAME);
    expect(result.verified).toBe(false);
    expect(result.shortFingerprint).toBe("DEAD BEEF");
  });

  it("empty directory → Unknown recipient", () => {
    expect(resolveRecipient(FP_A, []).name).toBe(UNKNOWN_RECIPIENT_NAME);
  });

  it("prefers a current-key match over a previous-key match on another contact", () => {
    const result = resolveRecipient(FP_A, [
      contact({ label: "Rotated", fingerprint: FP_B, previousFingerprints: [FP_A] }),
      contact({ label: "Current", fingerprint: FP_A, verified: true }),
    ]);
    expect(result.name).toBe("Current");
    expect(result.verified).toBe(true);
  });
});
