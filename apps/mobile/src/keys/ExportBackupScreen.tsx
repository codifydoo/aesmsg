import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AppBar,
  BottomSheet,
  Button,
  Card,
  CautionCard,
  Field,
  Icon,
  KeyboardAvoider,
  Screen,
} from "@/src/components";
import { colors } from "@/src/theme";
import { markBackedUp } from "./backup-state";
import { evaluatePassphrase } from "./passphrase-strength";

// Screen 41 — Export Encrypted Backup (design: grp-keys.jsx S_ExportBackup).
// The encrypted-backup export flow: a passphrase + confirm Field, a 4-segment strength meter, a
// requirements checklist, and the Export button. Reassurance copy reinforces that the backup is the
// ONLY way a key leaves the device — and only in encrypted form (product invariant).
//
// WIRED: the real argon2id wrap (DEFAULT_WRAP_KDF_PARAMS) + write/share of the ciphertext file are
// owned by the host (KeysFlow + keys/export-backup.ts). This screen is presentational + controlled:
// the host runs `onExport(passphrase)` behind a biometric gate, drives `exporting` during the wrap,
// then sets `done` to surface the success sheet just before the system share sheet appears.

export interface ExportBackupScreenProps {
  onBack?: () => void;
  /** Called with the validated passphrase once the user taps Export. Runs behind a biometric gate. */
  onExport?: (passphrase: string) => void;
  /** Wrap in flight — disables the form and shows the busy CTA ("Encrypting backup…"). */
  exporting?: boolean;
  /** The encrypted backup is ready — show the success sheet just before the system share sheet. */
  done?: boolean;
  /** Dismiss the success sheet. */
  onDismissDone?: () => void;
  /**
   * Fired exactly once when the export reaches its success state (`done` false→true). Defaults to
   * persisting the "backed up" flag (PG-11) — the host (KeysFlow) drives `done` only after the wrap +
   * write succeed, so this is the true "an encrypted backup now exists" signal. Overridable for tests.
   */
  onExported?: () => void;
}

// No-op default so optional handlers satisfy the kit's required-callback props under
// exactOptionalPropertyTypes without threading `undefined` through.
const noop = () => {};

// Default success side effect: record that an encrypted backup has been created so the onboarding
// nudge + persistent "not backed up" reminder stand down. Fire-and-forget; a write failure only means
// the reminder lingers (harmless — the backup still exists).
const defaultOnExported = () => {
  void markBackedUp();
};

// Four segment colors for the strength bar: lit segments are emerald (safe), the rest outline-variant.
const SEGMENTS = 4;

export function ExportBackupScreen({
  onBack,
  onExport,
  exporting = false,
  done = false,
  onDismissDone,
  onExported = defaultOnExported,
}: ExportBackupScreenProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");

  const strength = useMemo(() => evaluatePassphrase(passphrase, confirm), [passphrase, confirm]);

  // Record backup completion exactly once, on the `done` false→true edge. KeysFlow flips `done` only
  // after the heavy wrap + cache write succeed, so this is the point an encrypted backup provably
  // exists — the right moment to clear the "not backed up" reminder (PG-11).
  const reportedRef = useRef(false);
  useEffect(() => {
    if (done && !reportedRef.current) {
      reportedRef.current = true;
      onExported();
    }
    if (!done) reportedRef.current = false;
  }, [done, onExported]);

  return (
    <KeyboardAvoider>
      <Screen topInset={false}>
        <AppBar title="Export encrypted backup" onLeading={onBack ?? noop} />

        <View style={styles.body}>
          <Card style={styles.introCard}>
            <Text style={styles.intro}>
              Your backup is encrypted with a passphrase only you know. Without it, the file is
              useless.
            </Text>
          </Card>

          <CautionCard style={styles.caution}>
            <Icon name="warning" size={20} color={colors.tertiary} />
            <Text style={styles.cautionText}>
              This is the only way a key leaves your device — and only in encrypted form. Store the
              passphrase somewhere safe; we can't recover it.
            </Text>
          </CautionCard>

          <View style={styles.form}>
            <Field
              placeholder="Passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              eye
            />
            <Field
              placeholder="Confirm passphrase"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              eye
            />

            <View style={styles.meter} accessibilityLabel="Passphrase strength">
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional meter segments
                  key={i}
                  style={[
                    styles.segment,
                    i < strength.score
                      ? strength.canExport || strength.requirements[1]?.met
                        ? styles.segmentOn
                        : styles.segmentWeak
                      : styles.segmentOff,
                  ]}
                />
              ))}
            </View>

            {strength.label ? (
              <Text
                style={[
                  styles.strengthLabel,
                  strength.requirements[1]?.met ? styles.strengthOk : styles.strengthWeak,
                ]}
                accessibilityLiveRegion="polite"
              >
                {strength.requirements[1]?.met
                  ? `Strength: ${strength.label}`
                  : `Strength: ${strength.label} — add length or variety, and avoid common words`}
              </Text>
            ) : null}

            <View style={styles.checklist}>
              {strength.requirements.map((req) => (
                <View key={req.key} style={styles.checkRow}>
                  <Icon
                    name="check_circle"
                    size={16}
                    fill={req.met}
                    color={req.met ? colors.emerald : colors.outlineVariant}
                  />
                  <Text style={styles.checkLabel}>{req.label}</Text>
                </View>
              ))}
              {strength.mismatch ? (
                <Text style={styles.mismatch}>Passphrases don't match yet.</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            icon="lock"
            disabled={!strength.canExport || exporting}
            onPress={() => onExport?.(passphrase)}
          >
            {exporting ? "Encrypting backup…" : "Export backup"}
          </Button>
        </View>
      </Screen>

      {/* Success sheet — shown the instant the wrap completes, just before the system share sheet.
          Confirms the encrypted file is ready and reminds the user to keep the passphrase separate. */}
      <BottomSheet visible={done} onClose={onDismissDone ?? noop}>
        <View style={styles.sheet}>
          <View style={styles.sheetIcon}>
            <Icon name="check_circle" size={28} fill color={colors.emerald} />
          </View>
          <Text style={styles.sheetTitle}>Encrypted backup ready</Text>
          <Text style={styles.sheetBody}>
            Share or save this file. Keep the passphrase separate.
          </Text>
          <Button onPress={onDismissDone ?? noop}>Done</Button>
        </View>
      </BottomSheet>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  introCard: { padding: 16 },
  intro: { fontSize: 15, lineHeight: 23, color: colors.onSurfaceVariant },
  caution: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cautionText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
  form: { gap: 12 },
  meter: { flexDirection: "row", gap: 5 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  segmentOn: { backgroundColor: colors.emerald },
  segmentWeak: { backgroundColor: colors.tertiary },
  segmentOff: { backgroundColor: colors.outlineVariant },
  strengthLabel: { fontSize: 12, lineHeight: 17 },
  strengthOk: { color: colors.emerald },
  strengthWeak: { color: colors.tertiary },
  checklist: { gap: 6 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkLabel: { fontSize: 13, color: colors.onSurfaceVariant },
  mismatch: { fontSize: 13, color: colors.tertiary, marginTop: 2 },
  footer: { paddingTop: 24 },
  sheet: { gap: 12, alignItems: "center", paddingTop: 6 },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(54,211,153,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { fontSize: 19, fontWeight: "600", color: colors.onSurface, textAlign: "center" },
  sheetBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginBottom: 6,
  },
});
