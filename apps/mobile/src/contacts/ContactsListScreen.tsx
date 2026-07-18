import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, Chip, Icon, RowCard, Screen } from "@/src/components";
import type { Contact } from "@/src/contacts/contacts-data";
import { trustIndicator } from "@/src/contacts/trust-status";
import { colors, fonts } from "@/src/theme";

// 34 · Contacts List (grp-contacts.jsx · S_ContactsList).
// A top-right add Icon (no page title — the tab bar already labels "Contacts"); a presentational
// (non-functional) search field; the verify-before-trust caption; then a list of contact RowCards.
// Each row: Avatar (initials), name, mono short
// fingerprint, and a trailing trust indicator resolved by the pure trustIndicator() helper —
// emerald "verified" glyph, or an amber "Unverified" / "Key changed" chip.

export interface ContactsListScreenProps {
  contacts: Contact[];
  onAdd: () => void;
  onSelect: (id: string) => void;
}

function TrustIndicator({ status }: { status: Contact["status"] }) {
  const i = trustIndicator(status);
  if (i.kind === "glyph") {
    return (
      <Icon
        name={i.icon}
        size={20}
        fill={i.fill}
        color={colors.emerald}
        accessibilityLabel={i.a11yLabel}
      />
    );
  }
  return (
    <Chip tone={i.tone} icon={i.icon} fill={i.fill}>
      {i.label}
    </Chip>
  );
}

function ContactRow({ contact, onSelect }: { contact: Contact; onSelect: (id: string) => void }) {
  const i = trustIndicator(contact.status);
  return (
    <RowCard onPress={() => onSelect(contact.id)} style={styles.row}>
      <Avatar initials={contact.name} />
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={1}>
          {contact.name}
        </Text>
        {/* Mono is reserved for fingerprints / public keys / secure links. */}
        <Text style={styles.fp} numberOfLines={1}>
          {contact.fingerprint}
        </Text>
      </View>
      <View accessibilityLabel={`${contact.name}, ${i.a11yLabel}`} style={styles.trailing}>
        <TrustIndicator status={contact.status} />
      </View>
    </RowCard>
  );
}

export function ContactsListScreen({ contacts, onAdd, onSelect }: ContactsListScreenProps) {
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add contact"
          hitSlop={10}
          style={styles.addBtn}
        >
          <Icon name="add" size={26} color={colors.primary} />
        </Pressable>
      </View>

      {/* Presentational search field — not wired to filtering yet (follow-up). */}
      <View
        style={styles.search}
        accessibilityRole="search"
        accessibilityLabel="Search by name or fingerprint"
      >
        <Icon name="search" size={18} color={colors.outline} />
        <Text style={styles.searchPlaceholder}>Search by name or fingerprint</Text>
      </View>
      <Text style={styles.caption}>Verify a contact's fingerprint before you trust their key.</Text>

      <View style={styles.list}>
        {contacts.map((c) => (
          <ContactRow key={c.id} contact={c} onSelect={onSelect} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  addBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  searchPlaceholder: { color: colors.outline, fontSize: 15 },
  caption: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 10,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  list: { gap: 8 },
  row: { padding: 14 },
  rowMain: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  fp: { fontFamily: fonts.mono, fontSize: 11, color: colors.outline, marginTop: 2 },
  trailing: { flexShrink: 0 },
});
