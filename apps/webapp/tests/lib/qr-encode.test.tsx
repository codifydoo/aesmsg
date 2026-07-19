import { exportPublicKey, generateIdentity } from "@aesmsg/crypto";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QrCode } from "@/src/components/QrCode";
import { toQrMatrix } from "@/src/lib/qr-encode";

describe("toQrMatrix", () => {
  it("produces a non-empty square grid with at least one dark module for a real key", async () => {
    const pk = exportPublicKey(await generateIdentity());
    const matrix = toQrMatrix(pk);
    expect(matrix.length).toBeGreaterThan(0);
    // Square.
    for (const row of matrix) {
      expect(row.length).toBe(matrix.length);
    }
    // Has dark modules.
    expect(matrix.some((row) => row.some((cell) => cell))).toBe(true);
  });
});

describe("<QrCode />", () => {
  it("renders an <svg> for a valid value", async () => {
    const pk = exportPublicKey(await generateIdentity());
    const { container } = render(<QrCode value={pk} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThan(1);
  });

  it("renders nothing (no throw) for an empty value", () => {
    const { container } = render(<QrCode value="" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
