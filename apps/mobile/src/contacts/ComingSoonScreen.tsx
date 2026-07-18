import { StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Icon, Medallion, Screen } from "@/src/components";
import { colors } from "@/src/theme";

// Placeholder destination for flows that need a native capability not wired up yet.
//
// FOLLOW-UP (tracked): screen 37 "Scan QR" needs the device camera, which the Foundation phase
// owns (expo-camera / barcode scanning + permissions). Rather than ship a fake scanner, this screen
// states the capability is coming. "Paste public key" lands here too for now — clipboard ingestion
// + public-key parsing/validation is the same follow-up slice. Neither path fabricates a contact.

export interface ComingSoonScreenProps {
  title: string;
  /** What is coming, e.g. "Camera scanning is coming soon." */
  message: string;
  icon?: string;
  onBack: () => void;
}

export function ComingSoonScreen({
  title,
  message,
  icon = "qr_code_scanner",
  onBack,
}: ComingSoonScreenProps) {
  return (
    <View style={styles.root}>
      <AppBar title={title} onLeading={onBack} />
      <Screen topInset={false} contentStyle={styles.content}>
        <Medallion size={72}>
          <Icon name={icon} size={32} color={colors.onSurfaceVariant} />
        </Medallion>
        <Text style={styles.heading} accessibilityRole="header">
          Coming soon
        </Text>
        <Text style={styles.body}>{message}</Text>
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
