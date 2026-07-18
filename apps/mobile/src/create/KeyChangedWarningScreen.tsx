import { StyleSheet, Text, View } from "react-native";
import { AppBar, Avatar, Button, CautionCard, Chip, Icon } from "@/src/components";
import { colors, fonts, type } from "@/src/theme";

// 18 · Key-Changed Warning (grp-create.jsx · S_KeyChangedCompose). Shown in the compose flow when
// the chosen recipient's key fingerprint has CHANGED since it was last seen — the classic MitM
// signal. Amber, not red: a changed key is an ambient caution, not a destructive action.
//
// Layout: the recipient header with an amber "Key changed" chip, a CautionCard contrasting the
// PREVIOUS vs NOW fingerprints (mono — fingerprints only), and three exits:
//   - "Verify fingerprint" (primary): go compare it out-of-band first (the safe path),
//   - "Send anyway" (the risky proceed): styled red because choosing to seal to an unverified,
//     changed key is the dangerous choice here — red is reserved for exactly this kind of risk,
//   - back/close cancels.
//
// This screen NEVER seals on its own. "Send anyway" calls onProceed, handing control back to the
// compose flow, which runs the SAME create-and-seal path with the SAME recipient key. Verifying or
// cancelling does not seal at all.

export interface KeyChangedWarningScreenProps {
  recipientName: string;
  /** Short fingerprint last seen for this contact (the one the user previously trusted). */
  previousFingerprint: string;
  /** Short fingerprint the key now presents — the value to re-verify out-of-band. */
  currentFingerprint: string;
  /** Go verify the new fingerprint out-of-band (the safe path). */
  onVerify: () => void;
  /** Proceed to seal anyway despite the changed key (the risky path). */
  onProceed: () => void;
  /** Cancel / go back without sealing. */
  onCancel: () => void;
}

export function KeyChangedWarningScreen({
  recipientName,
  previousFingerprint,
  currentFingerprint,
  onVerify,
  onProceed,
  onCancel,
}: KeyChangedWarningScreenProps) {
  return (
    <View style={styles.root}>
      <AppBar title="New secure message" leading="close" onLeading={onCancel} />
      <View style={styles.body}>
        <View style={styles.recipientRow}>
          <View style={styles.recipientLeft}>
            <Avatar initials={recipientName} size={36} />
            <Text style={styles.recipientName} numberOfLines={1}>
              {recipientName}
            </Text>
          </View>
          <Chip tone="amber" icon="priority_high" fill={false}>
            Key changed
          </Chip>
        </View>

        <CautionCard style={styles.caution}>
          <View style={styles.cautionHead}>
            <Icon name="warning" size={20} color={colors.tertiary} />
            <View style={styles.cautionHeadText}>
              <Text style={styles.cautionTitle}>This contact's key changed.</Text>
              <Text style={styles.cautionSub}>
                Verify the fingerprint before sending sensitive information.
              </Text>
            </View>
          </View>

          <View style={styles.fpRow}>
            <View style={styles.fpBox}>
              <Text style={styles.fpLabel}>Previously</Text>
              <Text style={styles.fpValue}>{previousFingerprint}</Text>
            </View>
            <View style={styles.fpBox}>
              <Text style={styles.fpLabel}>Now</Text>
              <Text style={[styles.fpValue, styles.fpValueNow]}>{currentFingerprint}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Button onPress={onVerify} style={styles.verifyBtn}>
              Verify fingerprint
            </Button>
            {/* Red because choosing to seal to a changed, unverified key is the risky action. */}
            <Button kind="danger" onPress={onProceed} style={styles.proceedBtn}>
              Send anyway
            </Button>
          </View>
        </CautionCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 22, paddingTop: 8, gap: 14 },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  recipientLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  recipientName: { ...type.body, fontWeight: "600", color: colors.onSurface, flexShrink: 1 },
  caution: { gap: 12 },
  cautionHead: { flexDirection: "row", gap: 10 },
  cautionHeadText: { flex: 1, minWidth: 0 },
  cautionTitle: { ...type.body, fontWeight: "600", color: colors.tertiary },
  cautionSub: { fontSize: 13, color: colors.onSurfaceVariant, marginTop: 3 },
  fpRow: { flexDirection: "row", gap: 10 },
  fpBox: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  fpLabel: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Mono is reserved for fingerprints / public keys / secure links.
  fpValue: { fontFamily: fonts.mono, fontSize: 12, color: colors.onSurfaceVariant, marginTop: 3 },
  fpValueNow: { color: colors.tertiary },
  actions: { flexDirection: "row", gap: 10, marginTop: 2 },
  verifyBtn: { flex: 1, minHeight: 44 },
  proceedBtn: { flex: 1, minHeight: 44 },
});
