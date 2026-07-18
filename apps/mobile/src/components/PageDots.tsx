import { StyleSheet, View } from "react-native";
import { colors } from "@/src/theme";

// PageDots — pagination dots for onboarding / carousels. Mirrors the design's `.dots` (aesmsg.css):
//   7x7 outline dots, gap 7; the active dot is an elongated 20-wide primary pill.

export interface PageDotsProps {
  count: number;
  active: number;
}

export function PageDots({ count, active }: PageDotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: Math.max(0, count) }, (_, i) => {
        const on = i === active;
        return (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional & count is stable
            key={i}
            style={[styles.dot, on && styles.dotActive]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 9999,
    backgroundColor: colors.outline,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.primary,
  },
});
