import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/src/components";
import { colors, type } from "@/src/theme";

// 26 · Decrypting. Presentational restyle to the design (grp-reader S_Decrypting): a centered
// filled lock_open glyph, the "Decrypting on this device" headline, the private-key reassurance,
// and a slim INDETERMINATE progress bar. No props — same as before.
//
// The bar is genuinely indeterminate: a short segment sweeps back and forth across the track. The
// prior version rendered a STATIC 62% fill with `accessibilityRole="progressbar"`, which implied a
// precise, stuck-at-62% measurement — a hang signal, and false precision for an operation with no
// real progress fraction. Screen readers now hear a busy state, not "62 percent".

const TRACK_WIDTH = 160;
const SEGMENT_WIDTH = 64;

export function DecryptingScreen() {
  // 0 -> 1 loop, mapped to the sweeping segment's translateX. Native-driven (transform only).
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRACK_WIDTH - SEGMENT_WIDTH],
  });

  return (
    <View style={styles.root}>
      <Icon name="lock_open" size={64} fill color={colors.primary} />
      <Text style={styles.title}>Decrypting on this device</Text>
      <Text style={styles.body}>Your private key never leaves this device.</Text>
      <View
        style={styles.track}
        // Indeterminate: announce "busy" without a value — no `progressbar` role, which AT reads as a
        // measurable percentage.
        accessibilityLabel="Decrypting"
        accessibilityState={{ busy: true }}
      >
        <Animated.View style={[styles.segment, { transform: [{ translateX }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 22,
  },
  title: { ...type.h2, color: colors.onSurface, textAlign: "center" },
  body: { ...type.body, color: colors.onSurfaceVariant, textAlign: "center" },
  track: {
    width: TRACK_WIDTH,
    height: 3,
    borderRadius: 99,
    backgroundColor: colors.surfaceContainerHigh,
    overflow: "hidden",
  },
  segment: {
    width: SEGMENT_WIDTH,
    height: "100%",
    borderRadius: 99,
    backgroundColor: colors.primary,
  },
});
