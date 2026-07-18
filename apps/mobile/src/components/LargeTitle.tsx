import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@/src/theme";

// LargeTitle — big page header. Mirrors the design's `.t-h1` (32 / 600 / -0.02em) used inside
// `.sm-head` / `.plarge`, with an optional trailing slot (e.g. an icon button) baseline-aligned to
// the title's bottom like `.sm-head { align-items: flex-end }`.

export interface LargeTitleProps {
  title: string;
  trailing?: ReactNode;
}

export function LargeTitle({ title, trailing }: LargeTitleProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 12,
  },
  title: {
    ...type.h1,
    color: colors.onSurface,
    flexShrink: 1,
  },
  trailing: { flexShrink: 0 },
});
