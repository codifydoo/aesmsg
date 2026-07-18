import { StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Icon } from "@/src/components";
import { DECRYPTION_FAILED_COPY } from "@/src/reader/copy";
import { colors, type } from "@/src/theme";

// 29 · Decryption Failed (wrong key — no recovery). Presentational restyle to the design
// (grp-reader S_DecryptFailed) using the kit. The EXACT opaque body string (DECRYPTION_FAILED_COPY)
// is preserved.
//
// SECURITY: this is the wrong-key terminal. Per the product invariant, a wrong private key is
// unrecoverable on this device — no fallback, no "are you sure". We deliberately do NOT render the
// design mockup's "Import key backup" / "Open on another device" recovery affordances (they imply
// recovery this screen must not promise) and we surface NO server-derived metadata (no fingerprint,
// status, or counts) — the error icon medallion + the fixed no-recovery copy only.
//
// FE-2 / R7: the old "Try again" button re-POSTed /open on every tap — burning another of the
// link's limited opens (and destroying a view-once message) even though a wrong key can NEVER become
// the right key. Retry is GONE. The only action is a plain, non-consuming exit back to the app; the
// screen also has a working back affordance so it is never a dead end.

export interface DecryptionFailedScreenProps {
  /** Leave the reader without issuing any network call. */
  onClose: () => void;
}

export function DecryptionFailedScreen({ onClose }: DecryptionFailedScreenProps) {
  return (
    <View style={styles.root}>
      <AppBar onLeading={onClose} />

      <View style={styles.body}>
        <View style={styles.medallion}>
          <Icon name="lock_reset" size={44} color={colors.error} />
        </View>

        <Text style={styles.title}>Decryption failed</Text>
        <Text style={styles.copy}>{DECRYPTION_FAILED_COPY}</Text>
      </View>

      <View style={styles.footer}>
        <Button kind="outline" onPress={onClose}>
          Close
        </Button>
        <Text style={styles.footnote}>
          Keys never leave the device that created them. There is no way to recover this without the
          matching private key. Trying again won't help.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    paddingHorizontal: 22,
    paddingBottom: 16,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  medallion: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: "rgba(255,180,171,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.h1, color: colors.onSurface, textAlign: "center" },
  copy: { ...type.body, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 290 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8, gap: 14 },
  footnote: { fontSize: 12, color: colors.onSurfaceVariant, textAlign: "center" },
});
