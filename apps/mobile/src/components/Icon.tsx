import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { StyleProp, TextStyle } from "react-native";
import { type DesignIconName, resolveMciName } from "@/src/components/icon-map";
import { colors } from "@/src/theme";

// Icon — the kit's single glyph primitive. It mirrors the design's <Glyph> (kit.jsx): every screen
// references a Material Symbols name (e.g. "lock", "verified", "chevron_right") plus a `fill` flag,
// and Icon renders the closest MaterialCommunityIcons glyph. The name->glyph mapping (with
// outline vs filled awareness) lives in the pure, unit-tested ./icon-map module so this file stays
// thin and presentational. Unmapped names degrade to a benign placeholder rather than crashing.

export interface IconProps {
  /**
   * Material Symbols name from the design (e.g. "lock", "shield_lock", "chevron_right").
   * Accepts any string so screens never fight the type system over a niche glyph; unknown
   * names fall back to a help placeholder. Prefer the typed {@link DesignIconName} union.
   */
  name: DesignIconName | (string & {});
  /** Glyph size in px. Matches the design's default <Glyph size={24}>. */
  size?: number;
  /** Glyph color. Defaults to the current on-surface foreground token. */
  color?: string;
  /**
   * When true, render the filled variant (Material Symbols FILL 1); when false/omitted, the
   * outline variant. Drives active/emphasis vs idle/nav states across the app.
   */
  fill?: boolean;
  /**
   * Material Symbols `wght` axis (100–700) in the design. MaterialCommunityIcons is not a variable
   * font, so weight cannot change stroke thickness; it is accepted for prop-API parity with the
   * design's <Glyph> and currently has no visual effect.
   */
  weight?: number;
  style?: StyleProp<TextStyle>;
  /** Optional override; otherwise Icon is decorative and hidden from the a11y tree. */
  accessibilityLabel?: string;
}

export function Icon({
  name,
  size = 24,
  color = colors.onSurface,
  fill = false,
  style,
  accessibilityLabel,
}: IconProps) {
  const glyph = resolveMciName(name, fill);
  return (
    <MaterialCommunityIcons
      name={glyph as React.ComponentProps<typeof MaterialCommunityIcons>["name"]}
      size={size}
      color={color}
      style={style}
      accessibilityElementsHidden={accessibilityLabel === undefined}
      importantForAccessibility={accessibilityLabel === undefined ? "no-hide-descendants" : "yes"}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
    />
  );
}
