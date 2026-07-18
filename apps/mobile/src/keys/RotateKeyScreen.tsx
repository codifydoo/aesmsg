import { StyleSheet, Text, View } from "react-native";
import { AppBar, Button, CautionCard, Icon, Screen } from "@/src/components";
import { colors, fonts } from "@/src/theme";

// Screen 42 — Rotate Key (confirm). Real rotation (roadmap 2.4 / PG-1): generate a new active keypair,
// retire the old one, and RETAIN the old private key so messages already sent to it still open.
//
// TONE: AMBER, not red. Rotation is NOT destructive — it does not delete anything and it does not cost
// you access to already-received messages (the old key is retained on this device). Red is reserved
// for the irreversible wipe. Copy is honest about the one real limitation: rotation does NOT transfer
// your contacts' existing trust — they must re-verify your NEW fingerprint on their side.
//
// PRESENTATIONAL + controlled: this screen does NOT perform rotation. The host (KeysFlow) runs the
// real rotate() behind the existing biometric unlock (a single Face ID / fingerprint prompt) and
// drives `rotating`; the private key never appears here.

export interface RotateKeyScreenProps {
  /** The CURRENT (soon-to-be-retired) key's short fingerprint (mono), so the user sees what changes. */
  currentFingerprint?: string;
  /** Confirm rotation — the host runs the biometric gate + real rotate(). */
  onRotate?: () => void;
  /** Backed out without rotating. */
  onCancel?: () => void;
  /** Rotation in flight (generate + persist) — disables the form and shows the busy CTA. */
  rotating?: boolean;
}

const noop = () => {};

export function RotateKeyScreen({
  currentFingerprint = "",
  onRotate,
  onCancel,
  rotating = false,
}: RotateKeyScreenProps) {
  return (
    <Screen topInset={false} contentStyle={styles.content}>
      <AppBar title="Rotate key" onLeading={onCancel ?? noop} />

      <View style={styles.body}>
        <View style={styles.iconDisc}>
          <Icon name="autorenew" size={26} color={colors.tertiary} />
        </View>

        <Text style={styles.title}>Rotate your key?</Text>
        <Text style={styles.lead}>
          This creates a new encryption key and makes it active. New messages will be sealed to your
          new key.
        </Text>

        {currentFingerprint ? (
          <View style={styles.fpRow}>
            <Text style={styles.fpLabel}>Current key</Text>
            <Text style={styles.fingerprint} selectable>
              {currentFingerprint}
            </Text>
          </View>
        ) : null}

        <CautionCard style={styles.caution}>
          <Icon name="verified_user" size={20} color={colors.tertiary} />
          <Text style={styles.cautionText}>
            Your contacts will need to re-verify your new fingerprint — rotation doesn't transfer
            the trust they've already given your old key. Your saved contacts stay as they are.
          </Text>
        </CautionCard>

        {/* Reassurance: this is NOT a wipe. Access to already-received messages is preserved. */}
        <View style={styles.reassureRow}>
          <Icon name="lock" size={18} color={colors.emerald} />
          <Text style={styles.reassureText}>
            Messages already sent to your old key can still be opened. Your old key stays on this
            device for that.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button icon="autorenew" disabled={rotating} onPress={() => onRotate?.()}>
          {rotating ? "Rotating…" : "Rotate key"}
        </Button>
        <Button kind="ghost" disabled={rotating} onPress={() => (onCancel ?? noop)()}>
          Cancel
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: "space-between" },
  body: { gap: 14 },
  // 56px amber (tertiary-container) disc — the "attention, not danger" tone.
  iconDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(231,195,101,0.14)",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.24,
    color: colors.onSurface,
    textAlign: "center",
  },
  lead: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  fpRow: { alignItems: "center", gap: 4, marginTop: 2 },
  fpLabel: { fontSize: 12, color: colors.onSurfaceVariant },
  fingerprint: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 0.52, // 0.04em * 13
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  caution: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cautionText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
  reassureRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingHorizontal: 4 },
  reassureText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
  actions: { gap: 10 },
});
