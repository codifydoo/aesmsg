import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button, Icon } from "@/src/components";
import {
  type EncryptingPhase,
  encryptingHeading,
  encryptingSteps,
} from "@/src/create/encrypting-steps";
import { colors, type } from "@/src/theme";

// 16 · Encrypting Progress (grp-create.jsx · S_Encrypting). A centered lock medallion, the active
// phase as a heading, and the pipeline checklist (done = emerald check, active = spinner, pending =
// empty ring). The `phase` is driven by create-and-seal's real onPhase transitions, so the checklist
// reflects the ACTUAL active step. A "Cancel" action lets the sender escape a stalled upload instead
// of being stranded on a dead overlay. Footer reinforces the invariant: plaintext never leaves the
// device.
//
// Presentational only — it renders whatever `phase` CreateFlow is in and calls back on cancel. The
// seal itself runs in create-and-seal.ts; this screen does not encrypt or upload anything.

function StepIcon({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return <Icon name="check_circle" size={22} fill color={colors.emerald} />;
  }
  if (status === "active") {
    return <ActivityIndicator size="small" color={colors.primary} />;
  }
  return <View style={styles.pendingRing} />;
}

export interface EncryptingScreenProps {
  phase?: EncryptingPhase;
  /** Cancel the in-flight seal/upload and return to the preserved draft. Omitted → no cancel button. */
  onCancel?: () => void;
}

export function EncryptingScreen({ phase = "prepare", onCancel }: EncryptingScreenProps) {
  const steps = encryptingSteps(phase);
  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <View style={styles.medallion}>
          <Icon name="lock" size={56} fill color={colors.primary} />
        </View>
        <Text style={styles.heading} accessibilityRole="header">
          {encryptingHeading(phase)}
        </Text>
        <View style={styles.steps}>
          {steps.map((s) => (
            <View key={s.phase} style={styles.step}>
              <View style={styles.stepIcon}>
                <StepIcon status={s.status} />
              </View>
              <Text style={[styles.stepLabel, s.status === "pending" && styles.stepLabelPending]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.footer}>
        {onCancel ? (
          <Button kind="ghost" onPress={onCancel} style={styles.cancel}>
            Cancel
          </Button>
        ) : null}
        <View style={styles.assurance}>
          <Icon name="lock" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.footerText}>Plaintext never leaves your device.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 22 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 30 },
  medallion: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: "rgba(207,188,255,0.10)",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { ...type.h2, color: colors.onSurface },
  steps: { width: "100%", gap: 14 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  stepLabel: { ...type.body, color: colors.onSurface },
  stepLabelPending: { color: colors.outline },
  pendingRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
  },
  footer: {
    gap: 16,
    paddingBottom: 8,
  },
  cancel: {
    backgroundColor: colors.surfaceContainerHighest,
  },
  assurance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerText: { fontSize: 13, color: colors.onSurfaceVariant },
});
