import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import {
  AppBar,
  Button,
  Chip,
  ErrorCard,
  Field,
  Icon,
  KeyboardAvoider,
  RowCard,
  Screen,
} from "@/src/components";
import { colors, type as typo } from "@/src/theme";

// Screen 8 — Import Backup / Restore Identity (design: grp-onboarding.jsx S_ImportBackup).
//
// Restore an identity from an encrypted backup: an app bar, the local-only reassurance copy, a
// selected-file row (filename + size + an emerald check), a backup-passphrase Field, a green
// "Decrypted locally" chip, and the Restore button. The copy reinforces that the backup is decrypted
// on-device and nothing is uploaded — and there is no recovery if the passphrase is wrong.
//
// WIRED: file picking + the real argon2id-unwrap of the backup blob are owned by the host integration
// (App.tsx + onboarding/import-backup.ts). This screen is presentational + controlled: the host
// supplies `selectedFile`, drives `busy` during decrypt, and reports an `error` outcome. There is no
// recovery affordance for a wrong passphrase by design — a terminal inline error + a single shake.

export interface SelectedBackup {
  name: string;
  /** Human-readable size label, e.g. "4.2 KB". */
  size: string;
}

/** Terminal restore outcomes the host can surface as inline copy. No attempt counter, no recovery. */
export type ImportBackupError = "bad-passphrase" | "invalid-file";

export interface ImportBackupScreenProps {
  onBack?: () => void;
  /** Open the document picker to choose a backup file. */
  onPickFile?: () => void;
  /** Restore with the entered backup passphrase. */
  onRestore?: (passphrase: string) => void;
  /** The selected backup file, or null until the user picks one (Restore stays disabled). */
  selectedFile: SelectedBackup | null;
  /** Last restore outcome to display inline. `null`/absent = no error shown. */
  error?: ImportBackupError | null;
  /**
   * Bumps on every failed attempt so a repeated wrong passphrase re-triggers the field shake even
   * when `error` is unchanged. Optional — a single error needs no nonce to shake once.
   */
  errorNonce?: number;
  /** Decrypt in flight — disables inputs and shows the busy CTA. */
  busy?: boolean;
}

const noop = () => {};

export function ImportBackupScreen({
  onBack,
  onPickFile,
  onRestore,
  selectedFile,
  error = null,
  errorNonce = 0,
  busy = false,
}: ImportBackupScreenProps) {
  const [passphrase, setPassphrase] = useState("");

  // Single horizontal shake on a wrong-passphrase outcome (design: terminal, no recovery). Driven by
  // (error, errorNonce) so a repeated wrong attempt re-shakes even when `error` stays "bad-passphrase".
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // `errorNonce` bumps on every failed attempt so a repeated wrong passphrase re-runs this effect
    // (and re-shakes) even when `error` stays "bad-passphrase". It is read here so it is a genuine,
    // non-redundant dependency: the very first mount (nonce 0) never shakes, and each later attempt
    // increments it, re-firing the animation. Skip when there's nothing to react to.
    if (errorNonce === 0 || error !== "bad-passphrase") return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [error, errorNonce, shake]);
  const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });

  const canRestore = selectedFile !== null && passphrase.length > 0 && !busy;

  return (
    <KeyboardAvoider>
      <Screen topInset={false} contentStyle={styles.content}>
        <AppBar title="Restore identity" onLeading={onBack ?? noop} />

        <View style={styles.body}>
          <Text style={styles.intro}>
            Restore your identity from an encrypted backup. Your backup is decrypted on this device
            — nothing is uploaded.
          </Text>

          <RowCard onPress={busy ? noop : (onPickFile ?? noop)} style={styles.fileRow}>
            <View style={styles.fileIcon}>
              <Icon name="description" size={20} color={colors.primary} />
            </View>
            <View style={styles.fileCopy}>
              {selectedFile ? (
                <>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {selectedFile.name}
                  </Text>
                  <Text style={styles.fileMeta}>{selectedFile.size}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.fileName} numberOfLines={1}>
                    Choose a backup file
                  </Text>
                  <Text style={styles.fileMeta}>Tap to select your .aesmsg backup</Text>
                </>
              )}
            </View>
            <Icon
              name={selectedFile ? "check_circle" : "chevron_right"}
              size={20}
              fill={selectedFile !== null}
              color={selectedFile ? colors.emerald : colors.onSurfaceVariant}
            />
          </RowCard>

          <Animated.View style={[styles.passBlock, { transform: [{ translateX }] }]}>
            <Field
              placeholder="Backup passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              eye
            />
            <Text style={styles.passNote}>This passphrase never leaves your device.</Text>
          </Animated.View>

          {error === "bad-passphrase" ? (
            <ErrorCard>
              <Text style={styles.errorText}>
                That passphrase didn't unlock this backup. No backup data is recoverable without it.
              </Text>
            </ErrorCard>
          ) : null}
          {error === "invalid-file" ? (
            <ErrorCard>
              <Text style={styles.errorText}>This isn't a valid backup file.</Text>
            </ErrorCard>
          ) : null}

          <Chip tone="green" icon="lock">
            Decrypted locally
          </Chip>
        </View>

        <View style={styles.footer}>
          <Button icon="restore" disabled={!canRestore} onPress={() => onRestore?.(passphrase)}>
            {busy ? "Restoring…" : "Restore"}
          </Button>
        </View>
      </Screen>
    </KeyboardAvoider>
  );
}

export default ImportBackupScreen;

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  body: { gap: 16 },
  intro: { ...typo.body, color: colors.onSurfaceVariant },
  fileRow: { padding: 16 },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fileCopy: { flex: 1 },
  fileName: { ...typo.body, fontWeight: "500", color: colors.onSurface },
  fileMeta: { fontSize: 12, color: colors.onSurfaceVariant },
  passBlock: { gap: 8 },
  passNote: { fontSize: 12, color: colors.onSurfaceVariant },
  errorText: { ...typo.body, color: colors.onSurface },
  footer: { paddingTop: 24 },
});
