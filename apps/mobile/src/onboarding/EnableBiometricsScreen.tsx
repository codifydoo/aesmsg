import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Icon, Medallion, RowCard, Screen } from "@/src/components";
import { colors, type as typo } from "@/src/theme";

// Screen 6 — Enable Biometrics (design: grp-onboarding.jsx S_EnableBio).
//
// Face ID medallion, "Use Face ID to unlock", three benefit rows, "Enable Face ID" + "Not now".
// Copy verbatim from the design — it reinforces the invariant that the private key never leaves the
// device and biometrics never reach the server.
//
// PRESENTATIONAL: the real expo-local-authentication enable is a FOLLOW-UP (apps/mobile has no
// biometrics dep yet and this agent owns only the onboarding feature dir). This screen exposes
// onEnable / onSkip so Integration can wire the actual prompt + persisted preference.

export interface EnableBiometricsScreenProps {
  /** "Enable Face ID" → trigger the real biometric enrollment (follow-up). */
  onEnable: () => void;
  /** "Not now" → continue without biometrics (passphrase unlock still works). */
  onSkip: () => void;
}

// Benefit rows — verbatim from S_EnableBio.
const BENEFITS: ReadonlyArray<{ icon: string; title: string; sub: string }> = [
  { icon: "bolt", title: "Faster", sub: "No passcode each time" },
  { icon: "lock", title: "Stays on-device", sub: "Biometrics never reach our servers" },
  { icon: "visibility_off", title: "Private", sub: "Only you can unlock" },
];

export function EnableBiometricsScreen({ onEnable, onSkip }: EnableBiometricsScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <Medallion>
          <Icon name="face" size={42} color={colors.primary} />
        </Medallion>
        <Text style={styles.title} accessibilityRole="header">
          Use Face ID to unlock
        </Text>
        <Text style={styles.body}>
          Open your keys and decrypt with a glance. Your private key never leaves this device.
        </Text>
      </View>

      <View style={styles.rows}>
        {BENEFITS.map((b) => (
          <RowCard key={b.title}>
            <Icon name={b.icon} size={22} color={colors.primary} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{b.title}</Text>
              <Text style={styles.rowSub}>{b.sub}</Text>
            </View>
          </RowCard>
        ))}
      </View>

      <View style={styles.footer}>
        <Button icon="fingerprint" onPress={onEnable}>
          Enable Face ID
        </Button>
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          hitSlop={8}
        >
          <Text style={styles.skip}>Not now</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

export default EnableBiometricsScreen;

const styles = StyleSheet.create({
  content: { gap: 18 },
  hero: { alignItems: "center", gap: 16, paddingTop: 12 },
  title: { ...typo.h1, color: colors.onSurface, textAlign: "center" },
  body: { ...typo.body, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 290 },
  rows: { gap: 10 },
  rowCopy: { flex: 1 },
  rowTitle: { ...typo.body, fontWeight: "500", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  footer: { paddingTop: 8, gap: 12 },
  skip: { textAlign: "center", color: colors.onSurfaceVariant, fontSize: 15, fontWeight: "500" },
});
