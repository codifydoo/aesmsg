import { StyleSheet, Text, View } from "react-native";
import { Button, Icon } from "@/src/components";
import { colors, type } from "@/src/theme";

// 31 · Already Opened (grp-reader S_AlreadyOpened). Presentational terminal for a link that
// reached its open limit.
//
// SECURITY NOTE: this screen is NOT currently wired to a live error path. The server collapses
// max-opens-consumed with revoked / expired into a single opaque status (404/410), and surfacing
// "this was opened out" specifically would leak which a "no longer available" link is — forbidden
// by the product invariant. So classifyReaderError provably never returns "already-opened"; every
// such case routes to LinkUnavailable (30) instead. This screen ships presentationally for when a
// sanctioned, non-leaky exhausted signal exists (e.g. a sender-side view, or a future opt-in API),
// and the reader-error outcome union reserves the name. `onDone` is optional.
export interface AlreadyOpenedScreenProps {
  onDone?: () => void;
}

export function AlreadyOpenedScreen({ onDone }: AlreadyOpenedScreenProps) {
  return (
    <View style={styles.root}>
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmark}>aesmsg</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.medallion}>
          <Icon name="history" size={30} color={colors.onSurfaceVariant} />
        </View>
        <Text style={styles.title}>This secure link was{"\n"}already opened</Text>
        <Text style={styles.copy}>
          This link reached its open limit and is no longer available.
        </Text>
      </View>

      {onDone ? (
        <View style={styles.footer}>
          <Button kind="outline" onPress={onDone}>
            Done
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  wordmarkRow: { alignItems: "center", paddingVertical: 8, paddingTop: 16 },
  wordmark: { ...type.h2, fontSize: 16, fontWeight: "600", color: colors.onSurface },
  body: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  medallion: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.h2, color: colors.onSurface, textAlign: "center" },
  copy: { ...type.body, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 270 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8 },
});
