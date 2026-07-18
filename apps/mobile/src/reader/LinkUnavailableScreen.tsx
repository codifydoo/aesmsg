import { StyleSheet, Text, View } from "react-native";
import { Button, Icon } from "@/src/components";
import { LINK_UNAVAILABLE_COPY } from "@/src/reader/copy";
import { colors, type } from "@/src/theme";

// 30 · Link Unavailable. Presentational restyle to the design (grp-reader S_LinkUnavailable) using
// the kit. SECURITY: the single opaque terminal for revoked / expired / max-opens / never-existed —
// it surfaces NO server-derived metadata, only the fixed LINK_UNAVAILABLE_COPY. `onDone` is
// optional (the deep-link entry in App.tsx has no parent route to pop to today).
export interface LinkUnavailableScreenProps {
  onDone?: () => void;
}

export function LinkUnavailableScreen({ onDone }: LinkUnavailableScreenProps) {
  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <Icon name="link_off" size={48} color={colors.outline} />
        <Text style={styles.copy}>{LINK_UNAVAILABLE_COPY}</Text>
      </View>
      {onDone ? (
        <View style={styles.footer}>
          <Button onPress={onDone}>Done</Button>
        </View>
      ) : null}
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
    gap: 24,
  },
  copy: { ...type.bodyLg, color: colors.onSurface, textAlign: "center", maxWidth: 280 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8 },
});
