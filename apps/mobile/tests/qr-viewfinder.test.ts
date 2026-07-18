import { describe, expect, it } from "vitest";
import { bracketGeometry, CORNERS, type Corner } from "@/src/contacts/qr-viewfinder";

// The 37 · QR Scan viewfinder geometry backs the four corner brackets. Per the node-env /
// no-React-renderer convention the bracket-edge math is tested here, not by rendering QRScanScreen.

describe("bracketGeometry", () => {
  it("paints exactly the two outer edges per corner (matching S_QRScan)", () => {
    // tl → top+left, tr → top+right, bl → bottom+left, br → bottom+right.
    const expected: Record<
      Corner,
      { top: boolean; bottom: boolean; left: boolean; right: boolean }
    > = {
      tl: { top: true, bottom: false, left: true, right: false },
      tr: { top: true, bottom: false, left: false, right: true },
      bl: { top: false, bottom: true, left: true, right: false },
      br: { top: false, bottom: true, left: false, right: true },
    };
    for (const corner of CORNERS) {
      const g = bracketGeometry(corner);
      expect({ top: g.top, bottom: g.bottom, left: g.left, right: g.right }).toEqual(
        expected[corner],
      );
    }
  });

  it("rounds only the bracket's own outer corner", () => {
    for (const corner of CORNERS) {
      expect(bracketGeometry(corner).radiusCorner).toBe(corner);
    }
  });

  it("always paints precisely two adjacent edges (never opposite, never 1 or 3)", () => {
    for (const corner of CORNERS) {
      const { top, bottom, left, right } = bracketGeometry(corner);
      // Exactly one of top/bottom and one of left/right.
      expect(top).not.toBe(bottom);
      expect(left).not.toBe(right);
      const painted = [top, bottom, left, right].filter(Boolean).length;
      expect(painted).toBe(2);
    }
  });
});

describe("CORNERS", () => {
  it("lists the four corners once each", () => {
    expect([...CORNERS].sort()).toEqual(["bl", "br", "tl", "tr"]);
    expect(new Set(CORNERS).size).toBe(4);
  });
});
