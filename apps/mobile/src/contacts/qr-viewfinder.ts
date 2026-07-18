// Pure geometry for the 37 · QR Scan viewfinder (grp-contacts.jsx · S_QRScan).
//
// Per the node-env / no-React-renderer test convention, the bracket-edge math lives here as pure
// functions so it can be unit-tested without rendering. QRScanScreen.tsx stays thin and just maps
// these descriptors onto RN <View> styles.
//
// Design reference (S_QRScan): four 34x34 brackets, each a 3px primary border on its two outer
// edges with a 12px radius on its outer corner:
//   tl → top+left  borders, radius top-left
//   tr → top+right borders, radius top-right
//   bl → bottom+left  borders, radius bottom-left
//   br → bottom+right borders, radius bottom-right

export type Corner = "tl" | "tr" | "bl" | "br";

export const CORNERS: readonly Corner[] = ["tl", "tr", "bl", "br"] as const;

/** The two outer edges a corner's bracket paints, plus the corner its 12px radius rounds. */
export interface BracketGeometry {
  /** Paint the top edge (true for the top row of brackets). */
  top: boolean;
  /** Paint the bottom edge. */
  bottom: boolean;
  /** Paint the left edge (true for the left column of brackets). */
  left: boolean;
  /** Paint the right edge. */
  right: boolean;
  /** Which single corner gets the rounded radius. */
  radiusCorner: Corner;
}

/**
 * Resolve which two edges a corner bracket paints and which corner is rounded. Mirrors the design's
 * derivation (top = top row, left = left column; radius on the outer corner only).
 */
export function bracketGeometry(corner: Corner): BracketGeometry {
  const top = corner === "tl" || corner === "tr";
  const left = corner === "tl" || corner === "bl";
  return { top, bottom: !top, left, right: !left, radiusCorner: corner };
}
