import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, Button, Icon, RowCard, Screen } from "@/src/components";
import { colors, fonts } from "@/src/theme";

// Screen 44 — Security Alert: Contact's Key Changed (design: grp-keys.jsx S_SecurityAlert).
// Raised when a re-scanned / re-pasted key for an EXISTING contact differs from the one on file — a
// possible MitM. AMBER is the tone throughout (attention, not danger): an amber-tinted medallion, the
// amber "new" fingerprint, amber accents — and deliberately NO red/destructive action.
//
// PURELY PRESENTATIONAL: it renders the REAL previous + new fingerprints handed in as props (derived
// by contacts/key-change.ts:keyChangeAlertView from the actual keys) — never a fabricated sample. It
// makes no store decision; it only gates it:
//   - "Update to new key" (primary) → onUpdateKey: the caller persists the new key via
//     updateContactKey, which RESETS the contact to unverified (re-verification required).
//   - "Keep current key" (quiet link) → onKeepCurrent: the stored key is left untouched.

export interface KeyChangedAlertScreenProps {
  contactName: string;
  /** Previously-verified fingerprint (short, mono) — the value the user last trusted. */
  previousFingerprint: string;
  /** Newly-detected fingerprint (short, mono) — the value to re-verify out-of-band. */
  newFingerprint: string;
  /** Adopt the new key: persists it and resets the contact to unverified (must re-verify). */
  onUpdateKey: () => void;
  /** Discard the scanned/pasted key; keep the current stored key unchanged. */
  onKeepCurrent: () => void;
}

export function KeyChangedAlertScreen({
  contactName,
  previousFingerprint,
  newFingerprint,
  onUpdateKey,
  onKeepCurrent,
}: KeyChangedAlertScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      {/* Amber-tinted medallion (on-tertiary #3e2e00 bg) — the design's alert treatment, distinct
          from the neutral kit Medallion used on empty/status screens. */}
      <View style={styles.medallion}>
        <Icon name="gpp_maybe" size={26} color={colors.tertiary} />
      </View>

      <Text style={styles.title}>This contact's key changed</Text>
      <Text style={styles.body}>
        The key you just scanned is different from the one on file for {contactName}. Updating
        replaces the saved key and marks this contact unverified until you compare the new
        fingerprint over a trusted channel.
      </Text>

      <RowCard style={styles.contactRow}>
        <Avatar initials={contactName} size={34} />
        <Text style={styles.contactName}>{contactName}</Text>
      </RowCard>

      {/* Two side-by-side cells (design 44): the previously-verified fingerprint in neutral grey and
          the new one in amber — the color carries the "this value changed / verify it" semantic. */}
      <View style={styles.fpRow}>
        <View style={styles.fpCell}>
          <Text style={styles.fpLabel}>Previous</Text>
          <Text style={styles.fpValue} selectable>
            {previousFingerprint}
          </Text>
        </View>
        <View style={styles.fpCell}>
          <Text style={[styles.fpLabel, styles.fpLabelNew]}>New</Text>
          <Text style={[styles.fpValue, styles.fpValueNew]} selectable>
            {newFingerprint}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button onPress={onUpdateKey}>Update to new key</Button>
        <Pressable
          onPress={onKeepCurrent}
          accessibilityRole="button"
          accessibilityLabel="Keep current key"
          hitSlop={8}
          style={styles.dismiss}
        >
          <Text style={styles.dismissText}>Keep current key</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "stretch", gap: 12 },
  // Amber-tinted alert medallion: 56px round, on-tertiary (#3e2e00) bg, centered glyph (design 44).
  medallion: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.onTertiary,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.24,
    color: colors.onSurface,
    textAlign: "center",
    marginTop: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginBottom: 4,
  },
  contactRow: { justifyContent: "center" },
  contactName: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  fpRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  // Each cell mirrors the design's sc-high card: surface-container-high bg, 1px border, radius 10,
  // padding 12.
  fpCell: {
    flex: 1,
    gap: 4,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    padding: 12,
  },
  fpLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.onSurfaceVariant,
  },
  fpLabelNew: { color: colors.tertiary },
  // Mono fingerprint value (mono is reserved for fingerprints/keys/links). Color carries the
  // semantic: grey = previously verified, amber = the changed/unverified value.
  fpValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 0.52, // 0.04em * 13
    color: colors.onSurfaceVariant,
  },
  fpValueNew: { color: colors.tertiary },
  actions: { gap: 12, marginTop: 12 },
  // "Dismiss for now" — a quiet centered text link (design 44), not a button.
  dismiss: { alignSelf: "center", paddingVertical: 4 },
  dismissText: { color: colors.onSurfaceVariant, fontSize: 14, fontWeight: "500" },
});
