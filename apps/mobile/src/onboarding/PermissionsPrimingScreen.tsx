import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, Icon, Screen } from "@/src/components";
import { colors, radii, type as typo } from "@/src/theme";

// Screen 7 — Permissions Priming (design: grp-onboarding.jsx S_Permissions).
//
// A soft priming screen before the OS permission prompts: a shield medallion header, then a Camera
// card and a Notifications card, each with an emerald on-device reassurance line, plus Continue +
// "Not now". This is the place users learn that the camera scan stays on device and notifications
// are pings, never contents — so the reassurance copy is verbatim from the design.
//
// PRESENTATIONAL: requesting the actual OS permissions is a FOLLOW-UP (no expo-camera /
// expo-notifications deps here). Exposes onContinue / onSkip for Integration to wire.

export interface PermissionsPrimingScreenProps {
  /** Continue → proceed to request the OS permissions (follow-up), then next step. */
  onContinue: () => void;
  /** "Not now" → skip priming; permissions can be granted later from Settings. */
  onSkip: () => void;
}

const CARDS: ReadonlyArray<{ icon: string; tag: string; body: string; foot: string }> = [
  {
    icon: "photo_camera",
    tag: "CAMERA",
    body: "Scan a contact's QR code to verify their public key in person.",
    foot: "Stays on device. Nothing is uploaded.",
  },
  {
    icon: "notifications",
    tag: "NOTIFICATIONS",
    body: "Know when a link is opened or about to expire.",
    foot: "We send a ping, never the contents.",
  },
];

export function PermissionsPrimingScreen({ onContinue, onSkip }: PermissionsPrimingScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
          <Icon name="shield_lock" size={30} color={colors.primary} fill />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Two quick permissions
        </Text>
        <Text style={styles.body}>You can change these anytime in Settings.</Text>
      </View>

      <View style={styles.cards}>
        {CARDS.map((card) => (
          <Card key={card.tag} style={styles.card}>
            <View style={styles.cardRow}>
              <Icon name={card.icon} size={22} color={colors.primary} />
              <View style={styles.cardCopy}>
                <Text style={styles.cardTag}>{card.tag}</Text>
                <Text style={styles.cardBody}>{card.body}</Text>
                <Text style={styles.cardFoot}>{card.foot}</Text>
              </View>
            </View>
          </Card>
        ))}
      </View>

      <View style={styles.footer}>
        <Button onPress={onContinue}>Continue</Button>
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          hitSlop={8}
        >
          <Text style={styles.skip}>Not now</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

export default PermissionsPrimingScreen;

const styles = StyleSheet.create({
  content: { gap: 16 },
  hero: { alignItems: "center", gap: 10, paddingTop: 8 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...typo.h2, color: colors.onSurface, textAlign: "center" },
  body: { ...typo.body, color: colors.onSurfaceVariant, textAlign: "center" },
  cards: { gap: 12 },
  card: { padding: 16 },
  cardRow: { flexDirection: "row", gap: 12 },
  cardCopy: { flex: 1 },
  cardTag: { ...typo.label, color: colors.onSurfaceVariant },
  cardBody: { ...typo.body, color: colors.onSurface, marginTop: 6 },
  cardFoot: { fontSize: 12, color: colors.emerald, marginTop: 8 },
  footer: { paddingTop: 8, gap: 12 },
  skip: { textAlign: "center", color: colors.onSurfaceVariant, fontSize: 15, fontWeight: "500" },
});
