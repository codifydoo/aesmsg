import { StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Icon, Medallion, Screen } from "@/src/components";
import { colors } from "@/src/theme";

// Shown when a picked "Import contact file" isn't a valid aesmsg contact card — non-JSON, missing the
// contact-card type tag (e.g. an identity-backup file picked by mistake), or a malformed key. One
// message covers every failure per the design; it is a first-class state, not a toast or a crash.

export interface ImportContactErrorScreenProps {
  onBack: () => void;
}

export function ImportContactErrorScreen({ onBack }: ImportContactErrorScreenProps) {
  return (
    <View style={styles.root}>
      <AppBar title="Import contact file" onLeading={onBack} />
      <Screen topInset={false} contentStyle={styles.content}>
        <Medallion size={72}>
          <Icon name="warning" size={32} color={colors.onSurfaceVariant} />
        </Medallion>
        <Text style={styles.heading} accessibilityRole="header">
          Couldn't import
        </Text>
        <Text style={styles.body}>
          This isn't a valid aesmsg contact file. Ask your contact to export a new contact card and
          try again.
        </Text>
        <View style={styles.actions}>
          <Button kind="outline" onPress={onBack}>
            Back
          </Button>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  heading: { fontSize: 24, fontWeight: "500", letterSpacing: -0.24, color: colors.onSurface },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 280,
  },
  actions: { width: "100%", gap: 10, marginTop: 8 },
});
