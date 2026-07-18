import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Icon, Medallion, Screen } from "@/src/components";
import { useSettings } from "@/src/settings/settings-context";
import { colors, type as typo } from "@/src/theme";
import {
  type BiometricCapability,
  checkBiometricCapability,
  performBiometricConfirmation,
} from "./biometric-onboarding";
import { EnableBiometricsScreen } from "./EnableBiometricsScreen";

// EnableBiometricsScreenIntegration — the wired half of the one-time, post-setup biometric
// onboarding step (spec §5). The presentational EnableBiometricsScreen stays untouched; this wrapper
// owns capability detection + persistence via useSettings.
//
// HONEST SCOPE (spec §5/§6): "Enable" persists `biometric:true` after a live confirmation; "Not now"
// only dismisses the educational screen — it does NOT disable the intrinsic biometric gate (the
// device secret stays requireAuthentication: true; weakening it is the deferred passphrase slice).
// On a device with no enrolled biometrics we show an honest "not available" variant instead of the
// Enable affordance. NOTE: such devices in practice never reach this screen, because
// device-secret.ts's createDeviceSecret() throws BiometricUnavailableError at identity-setup time
// (see the known-limitation doc, Task 5.4). The variant exists for completeness + future-proofing.

export interface EnableBiometricsScreenIntegrationProps {
  /** Called once the one-time screen has been resolved (Enable confirmed, skipped, or continued). */
  onDone: () => void;
}

export function EnableBiometricsScreenIntegration({
  onDone,
}: EnableBiometricsScreenIntegrationProps) {
  const { update } = useSettings();
  const [capability, setCapability] = useState<BiometricCapability | null>(null);

  // Probe capability once on mount. checkBiometricCapability never throws, so no try/catch is needed;
  // a still-null capability simply renders nothing until the (fast) probe resolves.
  useEffect(() => {
    let alive = true;
    void checkBiometricCapability().then((cap) => {
      if (alive) setCapability(cap);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (capability === null) {
    // Brief probe frame — post-unlock, so no splash; calm null is acceptable per the design ethos.
    return null;
  }

  // "Not now" / "Continue": persist only that the screen was seen. Honest — the biometric gate is
  // unchanged; this just stops the one-time screen from reappearing.
  function markSeenAndContinue() {
    update({ biometricOnboardingSeen: true });
    onDone();
  }

  if (!capability.capable) {
    // Honest no-biometric variant: no Enable affordance, just an explanation + Continue.
    return (
      <Screen contentStyle={styles.content}>
        <View style={styles.hero}>
          <Medallion>
            <Icon name="info" size={42} color={colors.onSurfaceVariant} />
          </Medallion>
          <Text style={styles.title} accessibilityRole="header">
            Biometrics aren't available
          </Text>
          <Text style={styles.body}>
            This device has no Face ID or fingerprint set up, so biometric unlock can't be enabled
            here. Your private key still stays on this device.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button onPress={markSeenAndContinue}>Continue</Button>
        </View>
      </Screen>
    );
  }

  // Capable device: the unchanged presentational screen, wired to live confirmation + persistence.
  return (
    <EnableBiometricsScreen
      onEnable={() => {
        // Live confirmation. On success persist the preference + seen flag and advance. On a
        // cancelled/failed prompt do NOT flip `biometric` and do NOT advance — the user can retry
        // or choose "Not now". Any throw is swallowed to the same "stay on screen" outcome.
        void performBiometricConfirmation("Confirm Face ID to enable")
          .then(() => {
            update({ biometric: true, biometricOnboardingSeen: true });
            onDone();
          })
          .catch(() => {
            // Rejected/failed: leave the screen up; no preference change.
          });
      }}
      onSkip={markSeenAndContinue}
    />
  );
}

export default EnableBiometricsScreenIntegration;

const styles = StyleSheet.create({
  content: { gap: 18 },
  hero: { alignItems: "center", gap: 16, paddingTop: 12 },
  title: { ...typo.h1, color: colors.onSurface, textAlign: "center" },
  body: { ...typo.body, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 290 },
  footer: { paddingTop: 8, gap: 12 },
});
