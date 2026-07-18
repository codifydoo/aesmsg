import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radii } from "@/src/theme";

// Card — generic surface card. Mirrors the design's `.card` (aesmsg.css):
//   background surface-container-low, 1px border rgba(255,255,255,.05) with a slightly brighter
//   top edge (.09), radius lg, padding 20. Depth comes from luminance + a hairline border — never
//   drop shadows (per the design system).

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderTopColor: "rgba(255,255,255,0.09)",
    borderRadius: radii.lg,
    padding: 20,
  },
});
