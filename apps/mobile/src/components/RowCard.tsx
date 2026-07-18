import type { ReactNode } from "react";
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radii } from "@/src/theme";

// RowCard — tappable horizontal surface row. Mirrors the design's `.row-card` (aesmsg.css):
//   background surface-container, 1px border rgba(255,255,255,.05), radius md, padding 16, row,
//   gap 14, and a pressed wash to surface-container-high (`.row-card:active`).

export interface RowCardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function RowCard({ children, onPress, style }: RowCardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: radii.md,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  pressed: {
    backgroundColor: colors.surfaceContainerHigh,
  },
});
