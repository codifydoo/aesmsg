import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, fonts, type } from "@/src/theme";
import { BrandMark } from "./BrandMark";

// Screen 1 · Splash / Launch brand lockup (grp-onboarding.jsx · S_Splash). A full-bleed #141218
// surface with the aesmsg brand mark above the "aesmsg" wordmark — the first thing the app paints
// while it probes for an existing identity on this device. Faithful to all_design_screens/brand_assets/
// aesmsg-splash.html: a soft violet glow + faint concentric rings behind centre, the mark + wordmark
// optically lifted to ~45% vertical, and a bottom block with the "end-to-end encrypted" tagline + a
// slim animated loader bar (a violet highlight sweeping left→right, ~1.7s loop).
//
// The design has a "slow-probe" state: if checking the local keystore takes a beat, a single muted
// "Checking your keys" label fades in near the bottom. We expose that as `slowProbe` (default false);
// the loader always animates, and `slowProbe` additionally reveals the label above it.
//
// Copy note: "Checking your keys" reinforces the product model — keys live on THIS device, so the
// only thing the launch screen ever does is look locally; nothing is fetched from the server.
//
// Visual-approximation notes (RN has no radial-gradient or CSS keyframe primitives, and we add no
// deps): the radial glow is approximated by a single large, low-opacity violet circle; the concentric
// "seal" rings are 1px-bordered circles at the design's alpha steps; the loader sweep is an
// Animated.translateX loop. See the inline comments for the exact mapping from the HTML.

export interface SplashBrandProps {
  /**
   * Reveal the muted "Checking your keys" label above the loader (the design's slow-probe state).
   * Default false: just the brand lockup + the always-on loader.
   */
  slowProbe?: boolean;
}

// Brand mark size in the centre lockup (the HTML uses ~23vmin; 64pt reads right on phone widths).
const MARK_SIZE = 64;

// Loader track + highlight (HTML: 28vmin track, 38% highlight, 1.7s sweep). Fixed points keep it
// crisp and predictable across devices without measuring layout.
const LOADER_WIDTH = 120;
const LOADER_HIGHLIGHT_WIDTH = Math.round(LOADER_WIDTH * 0.38); // ~46
const LOADER_DURATION_MS = 1700;

// 207,188,255 = #cfbcff (colors.primary). The concentric rings use the design's exact alpha steps;
// rgba() literals are required because RN colours don't carry a separate per-style opacity channel.
const RING_ALPHAS = [0.07, 0.05, 0.035, 0.022] as const;
const RING_SCALES = [0.5, 0.72, 0.98, 1.28] as const; // ×min-dimension, mirroring the 50/72/98/128vmin HTML rings
// Faint violet track behind the loader highlight (HTML rgba(207,188,255,0.10)).
const LOADER_TRACK_COLOR = "rgba(207,188,255,0.10)";

export function SplashBrand({ slowProbe = false }: SplashBrandProps) {
  const sweep = useRef(new Animated.Value(0)).current;
  // Reduce-motion: query once on mount via AccessibilityInfo (no extra deps). When the OS asks for
  // reduced motion we skip the loop and leave the static track — still a calm, readable launch frame.
  const [reduceMotion, setReduceMotion] = useState(false);

  // Min screen dimension drives the decorative glow + rings, matching the HTML's vmin-based sizing.
  const { width, height } = Dimensions.get("window");
  const vmin = Math.min(width, height);
  const glowSize = vmin * 0.62; // HTML glow radius ~62vmin

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: LOADER_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep, reduceMotion]);

  // Highlight enters from off the left edge and exits past the right edge of the (clipped) track.
  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-LOADER_HIGHLIGHT_WIDTH, LOADER_WIDTH],
  });

  return (
    <View style={styles.root}>
      {/* Decorative backdrop — non-interactive, behind the lockup. */}
      <View pointerEvents="none" style={styles.backdrop}>
        {/* Soft radial violet glow, approximated by one large low-opacity circle centred at ~45%. */}
        <View
          style={[
            styles.glow,
            {
              width: glowSize,
              height: glowSize,
              borderRadius: glowSize / 2,
              marginTop: -glowSize / 2,
              marginLeft: -glowSize / 2,
            },
          ]}
        />
        {/* Four faint concentric "seal" rings scaling outward from centre. */}
        {RING_SCALES.map((scale, i) => {
          const d = vmin * scale;
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative list, never reordered
              key={i}
              style={[
                styles.ring,
                {
                  width: d,
                  height: d,
                  borderRadius: d / 2,
                  marginTop: -d / 2,
                  marginLeft: -d / 2,
                  borderColor: `rgba(207,188,255,${RING_ALPHAS[i]})`,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Centre lockup: brand mark + wordmark, optically lifted above true centre. */}
      <View style={styles.lockup}>
        <BrandMark size={MARK_SIZE} color={colors.primary} />
        <Text style={styles.wordmark} accessibilityRole="header">
          aesmsg
        </Text>
      </View>

      {/* Bottom block: tagline + slim animated loader (and the slow-probe label when requested). */}
      <View style={styles.bottom} pointerEvents="none">
        {slowProbe ? (
          <Text style={styles.probe} accessibilityRole="text">
            Checking your keys
          </Text>
        ) : null}

        <Text style={styles.tag} accessibilityRole="text">
          end-to-end encrypted
        </Text>

        <View style={styles.loaderTrack}>
          <Animated.View style={[styles.loaderHighlight, { transform: [{ translateX }] }]} />
        </View>
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
  },
  // Full-bleed backdrop layer; children centre themselves off the 50%/45% anchor below.
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    // Anchor centre at ~45% vertical (HTML), then offset by half the size via margins above.
    left: "50%",
    top: "45%",
    backgroundColor: colors.primaryContainer,
    opacity: 0.18,
  },
  ring: {
    position: "absolute",
    left: "50%",
    top: "45%",
    borderWidth: 1,
  },
  lockup: {
    alignItems: "center",
    gap: 22,
    // Optical lift so the lockup sits slightly above true centre (HTML anchors centre at top:45%).
    marginTop: "-5%",
  },
  wordmark: {
    ...type.h1,
    fontWeight: "500",
    fontSize: 34,
    letterSpacing: -1.2, // tight tracking (HTML -0.035em on a large wordmark)
    color: colors.onSurface,
  },
  bottom: {
    position: "absolute",
    bottom: 56,
    alignItems: "center",
    gap: 18,
  },
  probe: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "500",
    // Non-uppercase, gentle tracking for the probe label.
    letterSpacing: 0.52,
    color: colors.onSurfaceVariant,
  },
  tag: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "400",
    // Wide tracking (~fontSize·0.32), NOT uppercased — matches the HTML .tag.
    letterSpacing: 12 * 0.32,
    // Nudge to keep optical centring against the trailing letter-spacing.
    paddingLeft: 12 * 0.32,
    color: colors.outline,
  },
  loaderTrack: {
    width: LOADER_WIDTH,
    height: 2,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: LOADER_TRACK_COLOR,
  },
  loaderHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    width: LOADER_HIGHLIGHT_WIDTH,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});
