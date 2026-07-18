import { StyleSheet, Text, View } from "react-native";
import { Button, Icon, Medallion, Screen } from "@/src/components";
import { colors } from "@/src/theme";

// 39 · Contacts Empty State (grp-contacts.jsx · S_ContactsEmpty).
// A centered "group" icon medallion, "No contacts yet", a body line, and two actions: a primary
// "Scan public key" and an outline "Paste public key". Shown when the contact store is empty.

export interface ContactsEmptyScreenProps {
  onScan: () => void;
  onPaste: () => void;
}

export function ContactsEmptyScreen({ onScan, onPaste }: ContactsEmptyScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <Medallion size={72}>
        <Icon name="group" size={32} color={colors.onSurfaceVariant} />
      </Medallion>
      <Text style={styles.title} accessibilityRole="header">
        No contacts yet
      </Text>
      <Text style={styles.body}>Add a public key to start sending encrypted messages.</Text>

      <View style={styles.actions}>
        <Button icon="qr_code_scanner" onPress={onScan}>
          Scan public key
        </Button>
        <Button kind="outline" icon="content_paste" onPress={onPaste} style={styles.pasteBtn}>
          Paste public key
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  title: { fontSize: 24, fontWeight: "500", letterSpacing: -0.24, color: colors.onSurface },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 270,
  },
  actions: { width: "100%", gap: 10, marginTop: 8 },
  pasteBtn: { minHeight: 52 },
});
