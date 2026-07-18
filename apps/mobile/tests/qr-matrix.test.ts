import { describe, expect, it } from "vitest";
import { toQrMatrix } from "@/src/keys/qr-matrix";

// toQrMatrix is a pure wrapper over qrcode's QRCode.create. We assert the grid shape is a valid
// square QR module matrix with both dark and light cells — enough to know the matrix is real
// without re-testing the qrcode library itself.
describe("toQrMatrix", () => {
  it("returns a non-empty square boolean grid for a public-key-like string", () => {
    const grid = toQrMatrix("AM-PUB-AbCdEf0123456789AbCdEf0123456789AbCdEf01==");
    expect(grid.length).toBeGreaterThan(0);
    // Square.
    for (const row of grid) {
      expect(row.length).toBe(grid.length);
      for (const cell of row) expect(typeof cell).toBe("boolean");
    }
    // QR codes always contain the finder pattern → the top-left module is dark.
    expect(grid[0]?.[0]).toBe(true);
    // And there is at least one light module somewhere (real mixed matrix, not all-dark).
    const hasLight = grid.some((row) => row.some((cell) => cell === false));
    expect(hasLight).toBe(true);
  });

  it("produces a larger matrix for longer input (version grows with data)", () => {
    const small = toQrMatrix("short");
    const big = toQrMatrix("x".repeat(400));
    expect(big.length).toBeGreaterThan(small.length);
  });

  it("is deterministic for the same input", () => {
    const a = toQrMatrix("determinism-check");
    const b = toQrMatrix("determinism-check");
    expect(a).toEqual(b);
  });
});
