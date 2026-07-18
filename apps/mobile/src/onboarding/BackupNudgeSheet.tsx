import { StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Icon } from "@/src/components";
import { colors } from "@/src/theme";

// BackupNudgeSheet — the one-time, post-setup push to create an encrypted backup (PG-11 / R20).
//
// The security model has no recovery: a lost/wiped private key is unrecoverable, so an encrypted
// backup export is the ONLY way back in. This nudge states that stake honestly and offers a
// non-blocking choice: "Back up now" (→ export flow) or "Later" (dismiss; the passive Home reminder
// keeps nudging until a backup exists). Amber, not red — this is attention, not danger.
//
// Presentational only: the host (HomeFlow) owns when it shows, records that it was seen, and routes
// "Back up now" to the Keys tab where Export encrypted backup lives.

export interface BackupNudgeSheetProps {
  visible: boolean;
  /** "Back up now" → route to the export flow. */
  onBackUpNow: () => void;
  /** "Later" / dismiss → close without blocking; the passive reminder remains. */
  onLater: () => void;
}

export function BackupNudgeSheet({ visible, onBackUpNow, onLater }: BackupNudgeSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onLater}>
      <View style={styles.sheet}>
        <View style={styles.icon}>
          <Icon name="shield_lock" size={26} color={colors.tertiary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Back up your key
        </Text>
        <Text style={styles.body}>
          Your private key never leaves this device — that's what keeps your messages private. But
          it also means that if you lose this device without a backup, messages sent to you can't be
          recovered.
        </Text>
        <Text style={styles.body}>
          Create an encrypted backup now so you can restore your identity on a new device. It's
          protected by a passphrase only you know.
        </Text>
        <View style={styles.actions}>
          <Button kind="outline" onPress={onLater} style={styles.action}>
            Later
          </Button>
          <Button icon="lock" onPress={onBackUpNow} style={styles.action}>
            Back up now
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

export default BackupNudgeSheet;

const styles = StyleSheet.create({
  sheet: { gap: 12, alignItems: "center", paddingTop: 6 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(231,195,101,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 19, fontWeight: "600", color: colors.onSurface, textAlign: "center" },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 6 },
  action: { flex: 1 },
});
