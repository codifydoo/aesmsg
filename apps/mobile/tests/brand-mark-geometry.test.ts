import { describe, expect, it } from "vitest";
import { markGeometry } from "@/src/system/brand-mark-geometry";

// Pure geometry backing the aesmsg brand mark (a stroked ring + vertical bar reproducing the
// canonical mark SVG, viewBox "12 16 68 68"). Tested per the node-env / no-React-renderer convention
// — BrandMark.tsx just positions plain RN Views from this output.

describe("markGeometry", () => {
  it("scales stroke linearly with size (8/68 of the box)", () => {
    expect(markGeometry(68).stroke).toBeCloseTo(8, 10);
    expect(markGeometry(136).stroke).toBeCloseTo(136 * (8 / 68), 10); // 16
    expect(markGeometry(34).stroke).toBeCloseTo(34 * (8 / 68), 10); // 4
  });

  it("gives the ring a border-box diameter of 60/68 of the box (52 path + 8 stroke)", () => {
    expect(markGeometry(68).ring.diameter).toBeCloseTo(60, 10);
    expect(markGeometry(136).ring.diameter).toBeCloseTo(136 * (60 / 68), 10); // 120
  });

  it("makes the bar height equal the ring path diameter (52/68 of the box)", () => {
    expect(markGeometry(68).bar.height).toBeCloseTo(52, 10);
    expect(markGeometry(136).bar.height).toBeCloseTo(136 * (52 / 68), 10); // 104
  });

  it("makes the bar width equal the stroke, with a half-width radius (rounded ends)", () => {
    const g = markGeometry(68);
    expect(g.bar.width).toBeCloseTo(g.stroke, 10);
    expect(g.bar.radius).toBeCloseTo(g.bar.width / 2, 10);
  });

  it("places the bar to the RIGHT of the ring", () => {
    // The canonical SVG puts the stem (centre x=72) past the bowl (centre x=46), so the stroked
    // rectangles touch by design — the bar's outer edge (64·k) coincides with the ring's outer edge.
    // The load-bearing invariant is therefore that the bar's centre-x sits clearly right of the
    // ring's centre-x (it is a stem on the right, not a counter inside the bowl).
    for (const size of [34, 68, 136]) {
      const g = markGeometry(size);
      const ringCx = g.ring.left + g.ring.diameter / 2;
      const barCx = g.bar.left + g.bar.width / 2;
      expect(barCx).toBeGreaterThan(ringCx);
      // The bar's centre-x is also right of the ring's right edge (stem clears the bowl's centre line).
      expect(barCx).toBeGreaterThan(g.ring.left + g.ring.diameter / 2);
    }
  });

  it("centres the ring and bar on the same vertical (y = 34/68 of the box)", () => {
    const g = markGeometry(68);
    const ringCy = g.ring.top + g.ring.diameter / 2;
    const barCy = g.bar.top + g.bar.height / 2;
    expect(ringCy).toBeCloseTo(34, 10);
    expect(barCy).toBeCloseTo(34, 10);
    expect(ringCy).toBeCloseTo(barCy, 10);
  });

  it("keeps both elements inside the size×size box", () => {
    const size = 64;
    const g = markGeometry(size);
    expect(g.ring.left).toBeGreaterThanOrEqual(0);
    expect(g.ring.top).toBeGreaterThanOrEqual(0);
    expect(g.bar.left + g.bar.width).toBeLessThanOrEqual(size + 1e-9);
    expect(g.bar.top + g.bar.height).toBeLessThanOrEqual(size + 1e-9);
  });

  it("is deterministic", () => {
    expect(markGeometry(100)).toEqual(markGeometry(100));
  });
});
