import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "@/src/theme";

// Toggle — iOS-style switch. Mirrors the design's `.tgl` (aesmsg.css): 44x26 track, 20x20 knob
// inset 3px, knob travels left 3 -> 21. on = primary track / on-primary knob; off =
// surface-container-highest track / on-surface-variant knob. Controlled (value + onValueChange).

export interface ToggleProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  /**
   * Screen-reader name for the switch (e.g. the row title). Without it AT announces only "switch,
   * on/off" with no indication of WHICH setting — a bare toggle. Row wrappers should pass the title.
   */
  accessibilityLabel?: string;
}

export function Toggle({ value, onValueChange, accessibilityLabel }: ToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onValueChange?.(!value)}
      hitSlop={8}
    >
      <View style={[styles.track, value ? styles.trackOn : styles.trackOff]}>
        <View
          style={[styles.knob, value ? styles.knobOn : styles.knobOff, { left: value ? 21 : 3 }]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 26,
    borderRadius: 9999,
    justifyContent: "center",
  },
  trackOn: { backgroundColor: colors.primary },
  trackOff: { backgroundColor: colors.surfaceContainerHighest },
  knob: {
    position: "absolute",
    top: 3,
    width: 20,
    height: 20,
    borderRadius: 9999,
  },
  knobOn: { backgroundColor: colors.onPrimary },
  knobOff: { backgroundColor: colors.onSurfaceVariant },
});
