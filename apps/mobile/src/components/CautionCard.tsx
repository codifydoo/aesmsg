import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { radii } from "@/src/theme";

// CautionCard — amber-tinted card for unverified / expiring / key-changed states. Mirrors the
// design's `.cautioncard` (aesmsg.css): tertiary (--tertiary #e7c365) at 8% bg, 30% border,
// radius lg, padding 16. Amber is the "attention, not danger" tone — never red for ambient warnings.

export interface CautionCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function CautionCard({ children, style }: CautionCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(231,195,101,0.08)",
    borderWidth: 1,
    borderColor: "rgba(231,195,101,0.30)",
    borderRadius: radii.lg,
    padding: 16,
  },
});
