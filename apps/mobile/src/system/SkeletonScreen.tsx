import { useEffect, useRef } from "react";
import {
  Animated,
  type DimensionValue,
  Easing,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { RowCard } from "@/src/components";
import { colors, space, type } from "@/src/theme";

// SkeletonScreen + SkeletonBlock — the loading placeholder (58 · Skeleton / Loading in
// grp-system.jsx). The design renders five list-row placeholders (a round avatar block, two text
// lines, a trailing pill) on a large-title "Links" header, each block a surface-container-high
// rounded rectangle.
//
// SkeletonBlock is the reusable unit: a sized, rounded placeholder with an OPTIONAL low-amplitude
// opacity pulse (RN's built-in Animated — no new deps, no real shimmer gradient). The pulse is on by
// default and respects callers that pass `pulse={false}` for a fully static placeholder (e.g. tests
// / reduced-motion).
//
// Presentational only. SkeletonScreen composes blocks into the design's list layout; callers needing
// a different loading shape compose SkeletonBlock directly.

export interface SkeletonBlockProps {
  /** Width — number (px) or percentage string. */
  width: DimensionValue;
  /** Height in px. Default 14 (the design's text-line height). */
  height?: number;
  /** Corner radius in px. Default 7 (pill-ish for text lines; pass height/2 for circles). */
  radius?: number;
  /** Animate a subtle opacity pulse. Default true. */
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonBlock({
  width,
  height = 14,
  radius = 7,
  pulse = true,
  style,
}: SkeletonBlockProps) {
  // Drive opacity between 0.55 and 1 so the block "breathes" without a gradient shimmer dep.
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, pulse]);

  const opacity = pulse ? anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) : 1;

  return (
    <Animated.View
      // Decorative placeholder — hide from the a11y tree; the screen-level "busy" state is announced.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius: radius, opacity }, style]}
    />
  );
}

export interface SkeletonScreenProps {
  /** Optional large title shown above the placeholder rows. Default "Links" (matches the design). */
  title?: string;
  /** Number of placeholder rows. Default 5 (matches the design). */
  rows?: number;
  /** Animate the blocks. Default true. */
  pulse?: boolean;
}

export function SkeletonScreen({ title = "Links", rows = 5, pulse = true }: SkeletonScreenProps) {
  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel={`Loading ${title}`}
      accessibilityState={{ busy: true }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.list}>
        {Array.from({ length: Math.max(0, rows) }, (_, i) => (
          // Static placeholder rows — index keys are stable for this fixed-length render.
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
          <RowCard key={i}>
            <SkeletonBlock width={40} height={40} radius={99} pulse={pulse} />
            <View style={styles.rowLines}>
              <SkeletonBlock width="60%" pulse={pulse} />
              <SkeletonBlock width="35%" height={11} pulse={pulse} />
            </View>
            <SkeletonBlock width={56} height={22} radius={99} pulse={pulse} />
          </RowCard>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 12, // small design gap below the App-level SafeAreaView top inset (was 60, double-counted)
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 14,
  },
  title: {
    ...type.h1,
    color: colors.onSurface,
  },
  list: {
    paddingHorizontal: 22,
    gap: 12,
  },
  rowLines: {
    flex: 1,
    gap: space.sm,
  },
  block: {
    backgroundColor: colors.surfaceContainerHigh,
  },
});
