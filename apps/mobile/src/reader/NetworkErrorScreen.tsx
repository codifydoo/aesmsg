import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Icon, RowCard } from "@/src/components";
import { colors, type } from "@/src/theme";

// 32 · Network Error (grp-reader S_NetworkError). Shown when the ciphertext could not be fetched —
// a transport failure or transient server status. Presentational; exposes onRetry (re-attempt the
// fetch) and an optional onCancel.
//
// SECURITY / TRUST COPY: a network failure is client-side — nothing was decrypted and NO open was
// consumed (the open endpoint either was never reached or returned a transient non-2xx without
// handing over ciphertext). The reassurance copy ("No open was consumed") uses the emerald/info
// tone (safe), never an alarming red, because this is a recoverable, non-destructive state.
export interface NetworkErrorScreenProps {
  onRetry: () => void;
  onCancel?: () => void;
}

export function NetworkErrorScreen({ onRetry, onCancel }: NetworkErrorScreenProps) {
  return (
    <View style={styles.root}>
      <AppBar title="Secure link" leading={null} />

      <View style={styles.body}>
        <View style={styles.medallion}>
          <Icon name="cloud_off" size={38} color={colors.onSurfaceVariant} />
        </View>
        <Text style={styles.title}>Could not fetch the{"\n"}encrypted message</Text>
        <Text style={styles.copy}>
          Your plaintext is not at risk — nothing was decrypted, and this attempt did not use one of
          the link's opens.
        </Text>
        <RowCard style={styles.note}>
          <Icon name="info" size={18} color={colors.emerald} />
          <Text style={styles.noteText}>No open was consumed</Text>
        </RowCard>
      </View>

      <View style={styles.footer}>
        <Button icon="refresh" onPress={onRetry}>
          Retry
        </Button>
        {onCancel ? (
          <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  medallion: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.h2, color: colors.onSurface, textAlign: "center" },
  copy: { ...type.body, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 290 },
  note: { width: "100%", gap: 10 },
  noteText: { fontSize: 13, color: colors.onSurfaceVariant },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
    alignItems: "center",
  },
  cancel: { ...type.body, color: colors.onSurfaceVariant, fontWeight: "500" },
});
