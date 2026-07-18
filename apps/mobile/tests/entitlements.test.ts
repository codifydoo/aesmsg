import { describe, expect, it } from "vitest";
import {
  allowsCustomExpiry,
  FREE_ATTACHMENT_BYTES,
  maxAttachmentBytes,
  PRO_ATTACHMENT_BYTES,
} from "@/src/pro/entitlements";

describe("entitlements gate helpers", () => {
  it("free attachment cap is today's 10 MiB; pro is 25 MiB", () => {
    expect(FREE_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(PRO_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });

  it("maxAttachmentBytes returns the free cap for non-pro and the pro cap for pro", () => {
    expect(maxAttachmentBytes(false)).toBe(FREE_ATTACHMENT_BYTES);
    expect(maxAttachmentBytes(true)).toBe(PRO_ATTACHMENT_BYTES);
  });

  it("custom expiry is pro-only", () => {
    expect(allowsCustomExpiry(false)).toBe(false);
    expect(allowsCustomExpiry(true)).toBe(true);
  });
});
