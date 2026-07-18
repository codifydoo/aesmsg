import { StyleSheet, Text, View } from "react-native";
import { AppBar, Avatar, Button, Card, Icon, RowCard, Screen } from "@/src/components";
import type { Contact } from "@/src/contacts/contacts-data";
import { formatFingerprintLines } from "@/src/keys/fingerprint-lines";
import { colors, fonts } from "@/src/theme";

// 38 · Verify Fingerprint (grp-contacts.jsx · S_VerifyFp).
// AppBar "Verify identity"; a contact RowCard (avatar + name + email); a large centered mono
// fingerprint Card (surface-container-high); a "Read aloud" RowCard; the compare-over-a-trusted-
// channel caption; footer "Mark as verified" + "Not now".
//
// Security UX: verification is comparing characters out-of-band — the screen never asserts the key
// is trusted on the user's behalf. The big block uses the JetBrains-mono treatment (fingerprints
// only). The fingerprint is laid out as the design's stacked pairs (two 4-char groups per line,
// e.g. "A1B2 C3D4") via the existing, unit-tested formatFingerprintLines helper — no bespoke,
// untested chunking lives in this screen.

export interface VerifyFingerprintScreenProps {
  contact: Contact;
  onBack: () => void;
  onMarkVerified: () => void;
  onNotNow: () => void;
  onReadAloud?: () => void;
}

export function VerifyFingerprintScreen({
  contact,
  onBack,
  onMarkVerified,
  onNotNow,
  // "Read aloud" is an affordance for verifying over a voice channel; the accessibility readout is
  // the a11y label on the block. Defaults to a no-op until the read-aloud sheet is wired (follow-up).
  onReadAloud = () => {},
}: VerifyFingerprintScreenProps) {
  // Two 4-char groups per line, matching the design's stacked verify block (screen 38).
  const lines = formatFingerprintLines(contact.fullFingerprint ?? contact.fingerprint, 4, 2);

  return (
    <View style={styles.root}>
      <AppBar title="Verify identity" onLeading={onBack} />

      <Screen topInset={false} contentStyle={styles.content}>
        <RowCard>
          <Avatar initials={contact.name} size={38} />
          <View style={styles.who}>
            <Text style={styles.name}>{contact.name}</Text>
            {contact.email ? <Text style={styles.email}>{contact.email}</Text> : null}
          </View>
        </RowCard>

        <Card style={styles.fpCard}>
          <Text style={styles.fp} selectable accessibilityLabel={`Fingerprint ${lines.join(" ")}`}>
            {lines.join("\n")}
          </Text>
        </Card>

        <RowCard onPress={onReadAloud} style={styles.readAloud}>
          <View style={styles.readAloudLeft}>
            <Icon name="volume_up" size={20} color={colors.primary} />
            <Text style={styles.readAloudLabel}>Read aloud</Text>
          </View>
          <Icon name="expand_more" size={20} color={colors.outline} />
        </RowCard>

        <Text style={styles.caption}>
          Compare these characters with your contact over a trusted channel.
        </Text>
      </Screen>

      <View style={styles.footer}>
        <Button icon="verified" onPress={onMarkVerified}>
          Mark as verified
        </Button>
        <Text style={styles.notNow} accessibilityRole="button" onPress={onNotNow}>
          Not now
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { gap: 16, paddingTop: 4 },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  email: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  fpCard: { backgroundColor: colors.surfaceContainerHigh, padding: 20 },
  fp: {
    fontFamily: fonts.mono,
    fontSize: 18,
    letterSpacing: 1.44, // 0.08em * 18
    lineHeight: 36, // ~2.0
    textAlign: "center",
    color: colors.onSurface,
  },
  readAloud: { justifyContent: "space-between" },
  readAloudLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  readAloudLabel: { fontSize: 15, color: colors.onSurface },
  caption: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 20,
  },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8, gap: 10 },
  notNow: {
    textAlign: "center",
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 10,
  },
});
