import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/src/components/Icon";
import { colors } from "@/src/theme";

// Chip — status pill. Mirrors the design's `.chip` (aesmsg.css): inline pill, 5/10 padding,
// fully rounded, 12 / 500 / 0.04em / uppercase, a desaturated tinted background + 1px tinted
// border, and a small leading glyph. The CSS only defines green/amber/violet tints; per the kit
// contract this RN version also carries neutral (outline) and error tones, built the same way.
//
// COLOR SEMANTICS (non-negotiable): green=emerald (verified|decrypted|safe),
// amber=tertiary (unverified|expiring|key changed), violet=primary (brand), error=red
// (destructive ONLY). neutral=outline for inert/informational states.

export type ChipTone = "green" | "amber" | "violet" | "neutral" | "error";

export interface ChipProps {
  tone?: ChipTone;
  icon?: string;
  /** Use the filled glyph variant (default true, matching the design's <Chip fill>). */
  fill?: boolean;
  children: ReactNode;
}

interface ToneStyle {
  color: string;
  bg: string;
  border: string;
}

// Tints mirror the CSS: 10% fill, ~26–28% border, over the tone's base color.
const TONES: Record<ChipTone, ToneStyle> = {
  green: { color: colors.emerald, bg: "rgba(111,210,154,0.10)", border: "rgba(111,210,154,0.28)" },
  amber: { color: colors.tertiary, bg: "rgba(231,195,101,0.10)", border: "rgba(231,195,101,0.28)" },
  violet: { color: colors.primary, bg: "rgba(207,188,255,0.10)", border: "rgba(207,188,255,0.26)" },
  neutral: {
    color: colors.outline,
    bg: "rgba(148,142,156,0.10)",
    border: "rgba(148,142,156,0.26)",
  },
  error: { color: colors.error, bg: "rgba(255,180,171,0.10)", border: "rgba(255,180,171,0.28)" },
};

export function Chip({ tone = "green", icon, fill = true, children }: ChipProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
      {icon ? <Icon name={icon} size={14} fill={fill} color={t.color} /> : null}
      <Text style={[styles.text, { color: t.color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.48, // 0.04em * 12
    textTransform: "uppercase",
    lineHeight: 14,
  },
});
