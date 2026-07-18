import { StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Chip, Icon } from "@/src/components";
import type { Link } from "@/src/links/links-data";
import { colors } from "@/src/theme";

// RevokeConfirmSheet (21) — mirrors grp-links.jsx `S_RevokeConfirm`: a BottomSheet with a centered
// error-container circle + "block" Icon, the "Revoke this link?" heading, the purge / cannot-undo
// copy, the link's amber attention Chip, then a danger "Revoke link" button and a neutral "Cancel"
// button. Revoke is the destructive action (error semantics); Cancel is inert (neutral).
//
// Product invariant in copy: revoking purges the ciphertext from the server (zero-knowledge backend)
// and cannot be undone — no "are you sure" beyond this single explicit confirmation.
//
// Revoke is a network action, so the sheet reflects its lifecycle: `busy` disables the buttons and
// shows a "Revoking…" label; `error` surfaces an inline failure line so the user can retry (the link
// stays live on failure — see revokeTrackedLinkOutcome).

export interface RevokeConfirmSheetProps {
  visible: boolean;
  link: Link | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** True while the revoke request is in flight — disables the actions + shows a busy label. */
  busy?: boolean;
  /** Inline error copy shown when the last revoke attempt failed (link is kept live for retry). */
  error?: string | null;
}

export function RevokeConfirmSheet({
  visible,
  link,
  onCancel,
  onConfirm,
  busy = false,
  error = null,
}: RevokeConfirmSheetProps) {
  // The chip mirrors the design's "Q3 board deck · expires in 3h": the link subject (text before
  // the " → recipient") plus its expiry label.
  const subject = link ? link.to.split(" → ")[0] : "";
  const chipLabel = link ? `${subject} · expires ${link.expiresLabel}` : "";

  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Icon name="block" size={26} color={colors.onErrorContainer} />
        </View>

        <Text style={styles.title}>Revoke this link?</Text>
        <Text style={styles.copy}>
          Revoking purges the ciphertext from the server and cannot be undone. Recipients can no
          longer open this link.
        </Text>

        {link ? (
          <View style={styles.chipRow}>
            <Chip tone="amber" icon="schedule" fill={false}>
              {chipLabel}
            </Chip>
          </View>
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button kind="danger" onPress={onConfirm} disabled={busy}>
          {busy ? "Revoking…" : "Revoke link"}
        </Button>
        <Button kind="ghost" onPress={onCancel} style={styles.cancel} disabled={busy}>
          Cancel
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "500",
    letterSpacing: -0.24,
    color: colors.onSurface,
    textAlign: "center",
  },
  copy: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 14,
  },
  chipRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 18,
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.error,
    textAlign: "center",
    marginBottom: 14,
  },
  actions: {
    gap: 10,
  },
  cancel: {
    // Neutral cancel sits on the sheet's surface-container-highest wash, matching the design's
    // .btn with var(--sc-highest) background.
    backgroundColor: colors.surfaceContainerHighest,
  },
});
