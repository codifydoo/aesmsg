import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Icon } from "@/src/components";
import { colors, space, type } from "@/src/theme";

// AppLockReAuthScreen — the re-auth overlay shown after the app auto-locks (59 · App-Lock Re-Auth in
// grp-system.jsx). The design centers a filled `lock` glyph in a primary-container circle, a calm
// "Locked for your privacy" headline, a reassurance that the private key stays on-device, a primary
// Face ID button, and a "Use passphrase instead" fallback LINK (no inline field — passphrase entry is
// its own surface that Integration navigates to).
//
// PRESENTATIONAL ONLY — this does NOT touch real biometrics or the identity key. Integration wires
// onUnlock to the biometric prompt and onUsePassphrase to the KDF passphrase-unlock surface.
//
// NO-RECOVERY NOTE: copy here never promises recovery — a forgotten passphrase / wiped key is
// irreversible by design, and the unlock surface must not imply otherwise.

const noop = () => {};

export interface AppLockReAuthScreenProps {
  /** Fired when the user taps the biometric (Face ID) unlock button. */
  onUnlock?: () => void;
  /** Fired when the user taps the "Use passphrase instead" fallback link. */
  onUsePassphrase?: () => void;
  /** Label for the biometric button. Default "Unlock". */
  biometricLabel?: string;
  /** Biometric glyph. Default "face" (Face ID); pass "fingerprint" for Touch ID devices. */
  biometricIcon?: string;
}

export function AppLockReAuthScreen({
  onUnlock,
  onUsePassphrase,
  biometricLabel = "Unlock",
  biometricIcon = "face",
}: AppLockReAuthScreenProps) {
  return (
    <View style={styles.root}>
      <View style={styles.lockCircle}>
        <Icon name="lock" size={30} color={colors.primary} fill />
      </View>

      <Text style={styles.title} accessibilityRole="header">
        Locked for your privacy
      </Text>
      <Text style={styles.body}>Unlock to continue. Your private key stays on this device.</Text>

      <View style={styles.actions}>
        <Button icon={biometricIcon} onPress={onUnlock ?? noop}>
          {biometricLabel}
        </Button>
      </View>

      <Pressable onPress={onUsePassphrase ?? noop} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.fallback}>Use passphrase instead</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    gap: 18,
  },
  lockCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...type.h2,
    color: colors.onSurface,
    textAlign: "center",
  },
  body: {
    ...type.body,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 280,
  },
  actions: {
    width: "100%",
    marginTop: space.xs,
  },
  fallback: {
    ...type.body,
    color: colors.primary,
    fontWeight: "500",
  },
});
