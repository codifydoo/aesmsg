// Pure geometry for the aesmsg brand mark — a stroked ring + a vertical bar that together read as a
// geometric single-story "a" / aperture (the canonical mark in all_design_screens/brand_assets).
//
// Why a pure module: the mobile test convention is node-env Vitest with NO React renderer, so the
// math that drives the mark lives here (deterministic, dependency-free) and is unit-tested directly.
// BrandMark.tsx is then a thin presentational shell that just positions plain RN Views from this.
//
// Source geometry (the canonical mark SVG):
//   viewBox="12 16 68 68"  → a 68×68 content box, origin at (12,16).
//   <g fill="none" stroke="violet" stroke-width="8" stroke-linecap="butt">
//     <circle cx="46" cy="50" r="26"/>           ← the ring (bowl of the "a")
//     <line   x1="72" y1="24" x2="72" y2="76"/>  ← the vertical bar (stem), to the RIGHT of the ring
//   </g>
//
// We reproduce this with two absolutely-positioned RN Views inside a `size`×`size` box, scaling the
// 68-unit content box to `size` (scale factor k = size / 68).
//
// Stroke model (important): in SVG the stroke straddles the path — it extends stroke/2 on each side.
//   • The ring path has radius 26, so with stroke 8 its OUTER diameter is (52 + 8) = 60 units and its
//     INNER diameter is (52 - 8) = 44 units. In RN a bordered View's `borderWidth` is drawn INSIDE
//     the View's box, so to match the SVG we size the View to the OUTER diameter (60·k) and give it
//     borderWidth = stroke (8·k); the border's centre line then sits at radius 26·k, exactly the SVG
//     stroke centre. We report `ring.diameter` as that outer, border-box diameter = 60·k.
//   • The bar is a stroked line of width 8 centred on x=72; as a filled RN View it's a rectangle of
//     width 8·k centred on the same x, height 52·k (y 24→76), with rounded ends (radius = width/2).
//
// Box-coordinate conversion: subtract the viewBox origin (12,16) from SVG coords before scaling, so
// everything is expressed relative to the top-left of the `size`×`size` container.
//   ring centre  (46,50) → (34,34) → (34·k, 34·k)
//   bar  centre  (72,50) → (60,34) → (60·k, 34·k)

export interface MarkGeometry {
  /** Stroke / border width, shared by the ring border and the bar width (8·k). */
  stroke: number;
  ring: {
    /** Outer (border-box) diameter of the ring View = (52 + 8)·k = 60·k. */
    diameter: number;
    /** Absolute left of the ring View inside the size×size box. */
    left: number;
    /** Absolute top of the ring View inside the size×size box. */
    top: number;
  };
  bar: {
    /** Bar width = stroke = 8·k. */
    width: number;
    /** Bar height (the stroked line length, y 24→76) = 52·k. */
    height: number;
    /** Absolute left of the bar View inside the size×size box. */
    left: number;
    /** Absolute top of the bar View inside the size×size box. */
    top: number;
    /** Corner radius for rounded ends; half the width. */
    radius: number;
  };
}

/** viewBox content-box edge length (68 units: x/y from 12..80, 16..84). */
const VIEWBOX_SIZE = 68;
/** SVG stroke width on both the ring and the bar. */
const STROKE_UNITS = 8;
/** Ring path radius. */
const RING_RADIUS_UNITS = 26;
/** viewBox origin (min-x, min-y) — subtracted to get box-relative coords. */
const ORIGIN_X = 12;
const ORIGIN_Y = 16;
/** Ring centre in SVG coords. */
const RING_CX = 46;
const RING_CY = 50;
/** Bar (vertical line) geometry in SVG coords. */
const BAR_X = 72;
const BAR_Y1 = 24;
const BAR_Y2 = 76;

/**
 * Compute the View geometry for the brand mark scaled to a `size`×`size` square container.
 * Pure and deterministic: same `size` in → same geometry out.
 */
export function markGeometry(size: number): MarkGeometry {
  const k = size / VIEWBOX_SIZE;

  const stroke = STROKE_UNITS * k;

  // Ring: outer/border-box diameter = (2·r + stroke). Position so its centre lands at the converted
  // ring centre — i.e. left/top = centre − diameter/2.
  const ringDiameter = (2 * RING_RADIUS_UNITS + STROKE_UNITS) * k; // (52 + 8)·k = 60·k
  const ringCx = (RING_CX - ORIGIN_X) * k; // 34·k
  const ringCy = (RING_CY - ORIGIN_Y) * k; // 34·k
  const ringLeft = ringCx - ringDiameter / 2;
  const ringTop = ringCy - ringDiameter / 2;

  // Bar: filled rectangle, width = stroke, height = (y2 − y1)·k, centred on the converted bar centre.
  const barWidth = stroke;
  const barHeight = (BAR_Y2 - BAR_Y1) * k; // 52·k
  const barCx = (BAR_X - ORIGIN_X) * k; // 60·k
  const barCy = ((BAR_Y1 + BAR_Y2) / 2 - ORIGIN_Y) * k; // 34·k
  const barLeft = barCx - barWidth / 2;
  const barTop = barCy - barHeight / 2;

  return {
    stroke,
    ring: { diameter: ringDiameter, left: ringLeft, top: ringTop },
    bar: { width: barWidth, height: barHeight, left: barLeft, top: barTop, radius: barWidth / 2 },
  };
}
