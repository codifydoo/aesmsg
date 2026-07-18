import { describe, expect, it } from "vitest";
import { DECRYPTION_FAILED_COPY, LINK_UNAVAILABLE_COPY } from "@/src/reader/copy";

// copy.ts is intentionally dependency-free (no react / react-native), so it loads in plain Node
// and the exact approved wording can be asserted byte-for-byte.

describe("LINK_UNAVAILABLE_COPY", () => {
  it("is EXACTLY the CLAUDE.md-approved opaque string", () => {
    expect(LINK_UNAVAILABLE_COPY).toBe("This secure link is no longer available.");
  });

  it("leaks no metadata: none of the status / fingerprint / count terms appear", () => {
    const lower = LINK_UNAVAILABLE_COPY.toLowerCase();
    // Deliberately never names WHICH of revoked / expired / max-opens / never-existed a link is.
    for (const banned of ["revoked", "expired", "max", "open", "fingerprint", "status"]) {
      expect(lower).not.toContain(banned);
    }
  });
});

describe("DECRYPTION_FAILED_COPY", () => {
  it("states there is no recovery (no fallback messaging)", () => {
    expect(DECRYPTION_FAILED_COPY.toLowerCase()).toContain("no recovery");
  });

  it("carries NO server-derived metadata (no fingerprint / id / status / count substrings)", () => {
    const lower = DECRYPTION_FAILED_COPY.toLowerCase();
    for (const banned of [
      "fingerprint",
      "status",
      "revoked",
      "expired",
      "opens",
      "createdat",
      "expiresat",
      "recipient",
    ]) {
      expect(lower).not.toContain(banned);
    }
  });

  it("contains no template interpolation markers (constant, never built from metadata)", () => {
    // A literal `${...}` or `{...}` in the shipped string would betray a runtime interpolation
    // of metadata. The approved copy must be a plain constant.
    expect(DECRYPTION_FAILED_COPY).not.toMatch(/\$\{|\{[^}]+\}/);
  });

  it("is a non-empty plain string", () => {
    expect(typeof DECRYPTION_FAILED_COPY).toBe("string");
    expect(DECRYPTION_FAILED_COPY.length).toBeGreaterThan(0);
  });
});
