import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/src/components";
import { colors, type } from "@/src/theme";

// PrivacyShieldOverlay — the blur-on-background privacy cover (60 · Privacy Shield in grp-system.jsx).
// When the app leaves the foreground (app-switcher snapshot, background), this full-bleed overlay
// obscures any decrypted content with a lock glyph, the aesmsg wordmark, and "Locked while in the
// background." It pairs conceptually with src/shield/usePrivacyShield (which reports `isObscured`),
// but this component is PURELY PRESENTATIONAL — render it absolutely when `visible` is true.
//
// FOLLOW-UP: the design uses backdrop-filter: blur(20px). RN has no built-in backdrop blur and we add
// no new native deps (no expo-blur), so this is an OPAQUE obscured surface (surface at 0.96 over the
// content) rather than a true blur. Swapping in expo-blur's BlurView is a one-component change later.

export interface PrivacyShieldOverlayProps {
  /** Render the overlay. When false, nothing is drawn. */
  visible: boolean;
}

export function PrivacyShieldOverlay({ visible }: PrivacyShieldOverlayProps) {
  if (!visible) return null;
  return (
    <View
      style={styles.overlay}
      accessibilityViewIsModal
      accessibilityLabel="Locked while in the background"
      importantForAccessibility="yes"
    >
      <View style={styles.lockCircle}>
        <Icon name="lock" size={34} color={colors.primary} />
      </View>
      <Text style={styles.wordmark}>aesmsg</Text>
      <Text style={styles.caption}>Locked while in the background.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    // Opaque obscured surface (rgba(20,18,24,.96)) — stands in for the design's backdrop blur.
    backgroundColor: "rgba(20,18,24,0.96)",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  lockCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    ...type.h2,
    fontSize: 18,
    fontWeight: "600",
    color: colors.onSurface,
  },
  caption: {
    ...type.body,
    color: colors.onSurfaceVariant,
  },
});
