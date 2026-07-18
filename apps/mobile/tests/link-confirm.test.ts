import { describe, expect, it } from "vitest";
import { deleteLinkConfirmCopy, isLinkStillLive } from "@/src/links/link-confirm";
import type { LinkStatus } from "@/src/links/links-data";

// Pure copy decision for the "Delete from this device?" confirmation. Local delete only untracks the
// link locally; the "keeps working for recipients" warning must appear ONLY when the link is actually
// still live server-side.

describe("isLinkStillLive", () => {
  it("is true for statuses that are still openable", () => {
    const live: LinkStatus[] = ["available", "expiring", "opened", "unknown"];
    for (const s of live) expect(isLinkStillLive(s)).toBe(true);
  });

  it("is false for revoked / expired (already dead server-side)", () => {
    expect(isLinkStillLive("revoked")).toBe(false);
    expect(isLinkStillLive("expired")).toBe(false);
  });
});

describe("deleteLinkConfirmCopy", () => {
  it("warns a still-live link keeps working + points to Revoke", () => {
    const copy = deleteLinkConfirmCopy("available");
    expect(copy).toContain("keeps working for recipients");
    expect(copy).toContain("Revoke");
  });

  it("for a dead link, states plainly nothing lives on the server (no misleading warning)", () => {
    const copy = deleteLinkConfirmCopy("expired");
    expect(copy).toContain("Nothing is stored on the server");
    expect(copy).not.toContain("keeps working for recipients");
  });

  it("treats an unknown/null status as the neutral dead-link copy", () => {
    expect(deleteLinkConfirmCopy(null)).toContain("Nothing is stored on the server");
  });
});
