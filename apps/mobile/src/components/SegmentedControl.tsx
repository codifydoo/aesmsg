import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/src/theme";

// SegmentedControl — mirrors the design's `.seg` (aesmsg.css): a surface-container-low track
// with 4px padding and gap, each option a flex button (13/500) and the selected one a pill of
// surface-container-highest with on-surface text. Controlled via value + onChange(key).

export interface SegmentOption {
  key: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((opt) => {
        const selected = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentSelected: {
    backgroundColor: colors.surfaceContainerHighest,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.onSurfaceVariant,
  },
  labelSelected: {
    color: colors.onSurface,
  },
});
