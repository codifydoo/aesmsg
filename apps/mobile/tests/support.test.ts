import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL, supportMailtoUrl } from "@/src/system/support";

describe("supportMailtoUrl", () => {
  it("builds a mailto with the default encoded subject", () => {
    expect(supportMailtoUrl()).toBe(`mailto:${SUPPORT_EMAIL}?subject=aesmsg%20support`);
  });

  it("url-encodes a custom subject", () => {
    expect(supportMailtoUrl("Help & feedback")).toBe(
      `mailto:${SUPPORT_EMAIL}?subject=Help%20%26%20feedback`,
    );
  });
});
