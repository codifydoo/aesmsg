import { View } from "react-native";
import { colors } from "@/src/theme";
import { markGeometry } from "./brand-mark-geometry";

// The aesmsg brand mark — a stroked ring + a vertical bar that together read as a geometric
// single-story "a" / aperture (the canonical mark in all_design_screens/brand_assets). Drawn with two
// plain RN Views (no react-native-svg — project convention forbids it); all positioning comes from the
// pure `markGeometry` module so the math is unit-tested in isolation.
//
// Pure presentational: a `size`×`size` relative box containing an absolutely-positioned ring (a
// transparent View with a thick rounded border) and bar (a filled, rounded-end View). Reusable by
// Keys / Onboarding later — hence exported from the system barrel.

export interface BrandMarkProps {
  /** Square edge length of the mark, in points. Defaults to the lockup size used on the splash. */
  size?: number;
  /** Mark colour (ring border + bar fill). Defaults to the brand primary (Electric Violet). */
  color?: string;
}

export function BrandMark({ size = 68, color = colors.primary }: BrandMarkProps) {
  const g = markGeometry(size);

  return (
    <View
      style={{ width: size, height: size, position: "relative" }}
      accessibilityRole="image"
      accessibilityLabel="aesmsg"
    >
      {/* Ring (bowl of the "a"): transparent fill, thick border whose centre line sits at radius 26·k. */}
      <View
        style={{
          position: "absolute",
          left: g.ring.left,
          top: g.ring.top,
          width: g.ring.diameter,
          height: g.ring.diameter,
          borderRadius: g.ring.diameter / 2,
          borderWidth: g.stroke,
          borderColor: color,
          backgroundColor: "transparent",
        }}
      />
      {/* Bar (stem): filled rounded-end rectangle to the right of the ring. */}
      <View
        style={{
          position: "absolute",
          left: g.bar.left,
          top: g.bar.top,
          width: g.bar.width,
          height: g.bar.height,
          borderRadius: g.bar.radius,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
