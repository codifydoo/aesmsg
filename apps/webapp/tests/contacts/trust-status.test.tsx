import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrustChip } from "@/src/components/TrustChip";
import type { TrustStatus } from "@/src/contacts/contacts-display";
import { trustIndicator } from "@/src/contacts/trust-status";

const ALL: TrustStatus[] = ["verified", "unverified", "changed"];

describe("trustIndicator", () => {
  it("never uses an error/red tone for any ambient trust state", () => {
    for (const status of ALL) {
      const indicator = trustIndicator(status);
      expect(indicator.tone === "green" || indicator.tone === "amber").toBe(true);
      // biome-ignore lint/suspicious/noExplicitAny: exercising the type boundary intentionally
      expect(indicator.tone as any).not.toBe("error");
      // biome-ignore lint/suspicious/noExplicitAny: exercising the type boundary intentionally
      expect(indicator.tone as any).not.toBe("red");
    }
  });

  it("verified is a green glyph; the two amber states are chips", () => {
    expect(trustIndicator("verified")).toMatchObject({ kind: "glyph", tone: "green" });
    expect(trustIndicator("unverified")).toMatchObject({ kind: "chip", tone: "amber" });
    expect(trustIndicator("changed")).toMatchObject({ kind: "chip", tone: "amber" });
  });
});

describe("<TrustChip />", () => {
  it("renders a success token for verified and warning tokens for the amber states, never error", () => {
    const { rerender } = render(<TrustChip status="verified" />);
    let chip = screen.getByLabelText("Verified");
    expect(chip.className).toContain("text-success");
    expect(chip.className).not.toContain("text-error");

    rerender(<TrustChip status="unverified" />);
    chip = screen.getByLabelText("Unverified");
    expect(chip.className).toContain("text-warning");
    expect(chip.className).not.toContain("text-error");

    rerender(<TrustChip status="changed" />);
    chip = screen.getByLabelText(/key changed/i);
    expect(chip.className).toContain("text-warning");
    expect(chip.className).not.toContain("text-error");
  });
});
