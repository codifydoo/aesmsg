import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { RevokeFailure } from "@/src/settings/wipe-orchestration";
import { colors } from "@/src/theme";

// Multi-phase "wipe this device's identity" confirm (PG-14 / R11). The screen owns the orchestration
// and drives the phase; this modal is presentational.
//
//   confirm   → type WIPE to arm the destructive action. Copy is honest device-local language: no
//               phantom "account", states irreversibility, that we try to revoke live links first,
//               and that copies decrypted elsewhere are unaffected.
//   revoking  → progress while we best-effort revoke each live link before touching the keys.
//   failures  → AMBER warning: these links could NOT be revoked and will stay live + unrevokable
//               after the wipe (the keys/tokens needed to revoke them are about to be destroyed).
//               Requires an explicit acknowledgement checkbox before "Wipe anyway" arms; also offers
//               Try again / Cancel so the user is never silently wiped.
//   wiping    → final purge in progress.
//
// Red = destructive (wipe). Amber = the "these links stay live" warning. Never red for the warning.

const CONFIRM_WORD = "WIPE";

export type WipePhase =
  | { kind: "confirm" }
  | { kind: "revoking"; done: number; total: number }
  | { kind: "failures"; failures: RevokeFailure[] }
  | { kind: "wiping" };

export interface WipeConfirmModalProps {
  visible: boolean;
  phase: WipePhase;
  /** Live tracked links we'll attempt to revoke first — surfaced in the confirm copy. */
  liveLinkCount: number;
  /** Cancel from the confirm or failures phase (never wipes). */
  onCancel: () => void;
  /** Confirm phase: typed WIPE + tapped Wipe → start the revoke-then-wipe orchestration. */
  onConfirm: () => void;
  /** Failures phase: acknowledged the live/unrevokable links → wipe anyway. */
  onProceedDespiteFailures: () => void;
  /** Failures phase: retry the revoke pass instead of wiping. */
  onRetry: () => void;
}

function failureLabel(failure: RevokeFailure): string {
  const { link } = failure;
  if (link.label?.trim()) return link.label.trim();
  return `Link ${link.id.slice(0, 8)}…`;
}

export function WipeConfirmModal({
  visible,
  phase,
  liveLinkCount,
  onCancel,
  onConfirm,
  onProceedDespiteFailures,
  onRetry,
}: WipeConfirmModalProps) {
  const [text, setText] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const armed = text.trim().toUpperCase() === CONFIRM_WORD;
  const busy = phase.kind === "revoking" || phase.kind === "wiping";

  // Reset the typed word + acknowledgement whenever the modal closes or returns to the confirm
  // phase, so a fresh attempt never inherits a prior armed state.
  useEffect(() => {
    if (!visible || phase.kind === "confirm") {
      setText("");
    }
    if (!visible || phase.kind !== "failures") {
      setAcknowledged(false);
    }
  }, [visible, phase.kind]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Only allow hardware-back dismissal in the two idle phases — never mid-revoke / mid-wipe.
      onRequestClose={busy ? () => {} : onCancel}
    >
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View style={styles.card}>
          {phase.kind === "confirm" && (
            <>
              <Text style={styles.title}>Wipe this device's identity?</Text>
              <Text style={styles.body}>
                This permanently deletes your private key and all keys from this device. Anything
                sealed to this identity becomes unreadable here. This cannot be undone — there is no
                backup and no recovery.
              </Text>
              {liveLinkCount > 0 ? (
                <Text style={styles.body}>
                  First we'll try to revoke your {liveLinkCount} live{" "}
                  {liveLinkCount === 1 ? "link" : "links"} so recipients can no longer open them.
                  Any we can't reach stay live until they expire.
                </Text>
              ) : (
                <Text style={styles.body}>You have no live links to revoke on this device.</Text>
              )}
              <Text style={styles.subtle}>
                Copies already decrypted on another device are not affected.
              </Text>
              <Text style={styles.body}>Type {CONFIRM_WORD} to confirm.</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={CONFIRM_WORD}
                placeholderTextColor={colors.onSurfaceVariant}
                style={styles.input}
              />
              <View style={styles.row}>
                <Pressable style={styles.cancel} onPress={onCancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!armed}
                  style={[styles.destructive, !armed && styles.disabled]}
                  onPress={onConfirm}
                >
                  <Text style={styles.destructiveText}>Wipe</Text>
                </Pressable>
              </View>
            </>
          )}

          {phase.kind === "revoking" && (
            <View style={styles.progressWrap}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.title}>Revoking your links</Text>
              <Text style={styles.body}>
                Revoking {phase.done} of {phase.total}
                {phase.total === 1 ? " link" : " links"} before wiping…
              </Text>
            </View>
          )}

          {phase.kind === "failures" && (
            <>
              <Text style={styles.warnTitle}>
                {phase.failures.length}{" "}
                {phase.failures.length === 1 ? "link couldn't" : "links couldn't"} be revoked
              </Text>
              <Text style={styles.body}>
                We couldn't reach the server to revoke these links. If you wipe now they stay live
                until they expire, and you will not be able to revoke them — wiping destroys the
                keys needed to do so.
              </Text>
              <ScrollView style={styles.failList} contentContainerStyle={styles.failListContent}>
                {phase.failures.map((f) => (
                  <Text key={f.link.id} style={styles.failItem} numberOfLines={1}>
                    • {failureLabel(f)}
                  </Text>
                ))}
              </ScrollView>
              <Pressable
                style={styles.ackRow}
                onPress={() => setAcknowledged((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acknowledged }}
              >
                <View style={[styles.checkbox, acknowledged && styles.checkboxChecked]}>
                  {acknowledged && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.ackText}>
                  I understand these links stay live and unrevokable.
                </Text>
              </Pressable>
              <Pressable style={styles.retry} onPress={onRetry}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
              <View style={styles.row}>
                <Pressable style={styles.cancel} onPress={onCancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!acknowledged}
                  style={[styles.destructive, !acknowledged && styles.disabled]}
                  onPress={onProceedDespiteFailures}
                >
                  <Text style={styles.destructiveText}>Wipe anyway</Text>
                </Pressable>
              </View>
            </>
          )}

          {phase.kind === "wiping" && (
            <View style={styles.progressWrap}>
              <ActivityIndicator color={colors.error} />
              <Text style={styles.title}>Wiping identity…</Text>
              <Text style={styles.body}>Deleting your keys and local data from this device.</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.surfaceContainer, borderRadius: 16, padding: 20, gap: 14 },
  title: { color: colors.error, fontSize: 18, fontWeight: "700" },
  warnTitle: { color: colors.tertiary, fontSize: 18, fontWeight: "700" },
  body: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  subtle: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    padding: 12,
    color: colors.onSurface,
    fontFamily: "monospace",
  },
  row: { flexDirection: "row", gap: 12 },
  cancel: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  cancelText: { color: colors.onSurface, textAlign: "center", fontWeight: "600" },
  destructive: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.error },
  destructiveText: { color: "#3a0a08", textAlign: "center", fontWeight: "700" },
  disabled: { opacity: 0.4 },
  progressWrap: { alignItems: "center", gap: 12, paddingVertical: 8 },
  // Amber-tinted failure list (a distinct surface from the destructive red actions below it).
  failList: {
    maxHeight: 140,
    borderWidth: 1,
    borderColor: "rgba(231,195,101,0.35)",
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLow,
  },
  failListContent: { padding: 12, gap: 6 },
  failItem: { color: colors.onSurface, fontSize: 13, lineHeight: 18 },
  ackRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.tertiary },
  checkboxMark: { color: colors.onTertiary, fontSize: 14, fontWeight: "900", lineHeight: 16 },
  ackText: { flex: 1, color: colors.onSurface, fontSize: 13, lineHeight: 18 },
  retry: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  retryText: { color: colors.primary, textAlign: "center", fontWeight: "700" },
});
