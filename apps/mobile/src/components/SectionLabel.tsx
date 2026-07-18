import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { colors } from "@/src/theme";

// SectionLabel — uppercase tracked group label. Mirrors the design's `.psec-label`
// (12 / 500 / 0.06em / uppercase, color on-surface-variant, small bottom margin + 2px inset).

export interface SectionLabelProps {
  children: ReactNode;
}

export function SectionLabel({ children }: SectionLabelProps) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.72, // 0.06em * 12
    textTransform: "uppercase",
    color: colors.onSurfaceVariant,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
});
