import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/src/components/Icon";
import { iconA11yLabel } from "@/src/components/icon-a11y-label";
import { colors, type } from "@/src/theme";

// AppBar — slim top app bar. Mirrors the design's `.pbar` (aesmsg.css): 50px tall, a centered
// Geist 17/600 title absolutely positioned so the leading/trailing 44pt slots never shift it.
// Default leading is the iOS-style back chevron ("arrow_back_ios_new", rendered smaller per the
// design's `leading === 'arrow_back_ios_new' ? 18 : 22`). Pass `null` to omit a side.

export interface AppBarProps {
  title?: string;
  /** Leading icon name, or null to omit. Default "arrow_back_ios_new". */
  leading?: string | null;
  onLeading?: () => void;
  /** Screen-reader label for the leading control; defaults to the icon's human label. */
  leadingLabel?: string;
  /** Trailing icon name, or null to omit. */
  trailing?: string | null;
  onTrailing?: () => void;
  /** Screen-reader label for the trailing control; defaults to the icon's human label. */
  trailingLabel?: string;
}

export function AppBar({
  title,
  leading = "arrow_back_ios_new",
  onLeading,
  leadingLabel,
  trailing = null,
  onTrailing,
  trailingLabel,
}: AppBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.slot}>
        {leading ? (
          <Pressable
            onPress={onLeading}
            style={styles.tap}
            accessibilityRole="button"
            // Fall back to a human label ("More options", "Back") — never the raw ligature name.
            accessibilityLabel={leadingLabel ?? iconA11yLabel(leading)}
            hitSlop={8}
          >
            <Icon
              name={leading}
              size={leading === "arrow_back_ios_new" ? 24 : 22}
              color={colors.onSurfaceVariant}
            />
          </Pressable>
        ) : null}
      </View>

      {title ? (
        // The title is absolutely positioned across the full bar width, so it sits ON TOP of the
        // leading/trailing tap targets. `pointerEvents="none"` makes it transparent to touches so
        // taps fall through to the back / trailing Pressables beneath it (without this, tapping
        // directly on the back chevron hits the title and does nothing).
        <Text style={styles.title} numberOfLines={1} pointerEvents="none">
          {title}
        </Text>
      ) : null}

      <View style={[styles.slot, styles.slotEnd]}>
        {trailing ? (
          <Pressable
            onPress={onTrailing}
            style={styles.tap}
            accessibilityRole="button"
            accessibilityLabel={trailingLabel ?? iconA11yLabel(trailing)}
            hitSlop={8}
          >
            <Icon name={trailing} size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  slot: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  slotEnd: { alignItems: "flex-end" },
  tap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...type.body,
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: "600",
  },
});
