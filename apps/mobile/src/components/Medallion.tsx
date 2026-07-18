import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "@/src/theme";

// Medallion — large circular status badge that centers an icon. Mirrors the design's `.medallion`
// (aesmsg.css): 88x88 round, surface-container-low bg, 1px outline-variant border. Used on
// empty / status / success screens to frame a single glyph. Caller supplies the centered icon as
// children (so its color carries the green/amber/red semantic for the state being shown).

export interface MedallionProps {
  children: ReactNode;
  size?: number;
}

export function Medallion({ children, size = 88 }: MedallionProps) {
  return (
    <View style={[styles.medallion, { width: size, height: size, borderRadius: size / 2 }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  medallion: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
});
