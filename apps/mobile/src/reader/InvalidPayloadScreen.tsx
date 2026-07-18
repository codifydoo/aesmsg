import { StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Icon } from "@/src/components";
import { colors, type } from "@/src/theme";

// 33 · Invalid Payload (grp-reader S_InvalidPayload). Shown when the link is structurally not a
// aesmsg link — the server returned 400 bad_request because the id failed its format check.
// Presentational; exposes optional onClose (top bar) and onDone (footer).
//
// SECURITY: this is a STRUCTURAL signal, not a metadata leak. A 400 means "this is not a
// aesmsg link format", which is distinct from a valid-but-gone link (404/410 → LinkUnavailable).
// It surfaces no server-derived metadata — only the fixed "not created by aesmsg" copy.
export interface InvalidPayloadScreenProps {
  onClose?: () => void;
  onDone?: () => void;
}

export function InvalidPayloadScreen({ onClose, onDone }: InvalidPayloadScreenProps) {
  return (
    <View style={styles.root}>
      <AppBar leading={onClose ? "close" : null} onLeading={onClose ?? noop} />

      <View style={styles.body}>
        <View style={styles.medallion}>
          <Icon name="link_off" size={30} color={colors.outline} />
        </View>
        <Text style={styles.title}>This does not look like a{"\n"}valid secure message</Text>
        <Text style={styles.copy}>The link may be incomplete or was not created by aesmsg.</Text>
      </View>

      {onDone ? (
        <View style={styles.footer}>
          <Button onPress={onDone}>Done</Button>
        </View>
      ) : null}
    </View>
  );
}

function noop() {}

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
  copy: { ...type.body, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 280 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8 },
});
