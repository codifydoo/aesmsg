import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, BottomSheet, Button, Chip, Field, Icon, SegmentedControl } from "@/src/components";
import type { Contact } from "@/src/contacts/contacts-data";
import { contactRecordToContact } from "@/src/contacts/contacts-display";
import { listContacts } from "@/src/contacts/contacts-store";
import { trustIndicator } from "@/src/contacts/trust-status";
import { looksLikePublicKey, type Recipient } from "@/src/create/recipient";
import { colors, fonts, type } from "@/src/theme";

// 12 · Recipient Picker (grp-create.jsx · S_RecipientPicker). A BottomSheet to choose who a message
// seals to. Three design affordances:
//   - a (presentational) contact search field,
//   - a segmented control: "Paste public key" | "Scan QR",
//   - the verified-contact list (reuses the SAMPLE_CONTACTS mock store + the trustIndicator helper).
//
// Picking a contact yields a { kind: "contact" } recipient; pasting/scanning a key yields a
// { kind: "pasted" } one. The result is handed back to ComposeScreen via onSelect and feeds the
// EXISTING seal call unchanged — this sheet only shapes the choice, it never seals or hits crypto.
//
// Real camera scanning is a follow-up: the "Scan QR" tab shows a token-styled placeholder (no
// expo-camera dependency), so this slice stays presentational while the paste path is fully wired.

type Tab = "paste" | "scan";

function TrustChip({ contactStatus }: { contactStatus: Contact["status"] }) {
  const i = trustIndicator(contactStatus);
  if (i.kind === "glyph") {
    return (
      <Chip tone="green" icon="check_circle" fill>
        Verified
      </Chip>
    );
  }
  return (
    <Chip tone={i.tone} icon={i.icon} fill={i.fill}>
      {i.label}
    </Chip>
  );
}

export interface RecipientPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (recipient: Recipient) => void;
}

export function RecipientPickerSheet({ visible, onClose, onSelect }: RecipientPickerSheetProps) {
  const [tab, setTab] = useState<Tab>("paste");
  const [pasted, setPasted] = useState("");
  const [contacts, setContacts] = useState<{ contact: Contact; publicKey: string }[]>([]);

  // Load the real saved contacts (encrypted on-device store) when the sheet opens. Each persisted
  // ContactRecord is adapted to the presentational Contact view-model; picking one yields a
  // recipient carrying its REAL public key, so the seal path is identical to the paste path.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const records = await listContacts();
      if (!cancelled) {
        setContacts(
          records.map((r) => ({ contact: contactRecordToContact(r), publicKey: r.publicKey })),
        );
      }
    })().catch(() => {
      // A load failure leaves the saved-contacts list empty; the paste tab still works. Surfaced as
      // an empty list rather than a crash (zero-knowledge metadata read must never brick compose).
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const canUsePasted = looksLikePublicKey(pasted);

  function choosePasted() {
    if (!canUsePasted) return;
    onSelect({ kind: "pasted", publicKeyString: pasted.trim() });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.heading} accessibilityRole="header">
        Send to
      </Text>

      {/* Presentational search affordance — contact filtering is a follow-up. */}
      <View style={styles.search} accessibilityRole="search" accessibilityLabel="Search contacts">
        <Icon name="search" size={18} color={colors.outline} />
        <Text style={styles.searchPlaceholder}>Search contacts</Text>
      </View>

      <View style={styles.seg}>
        <SegmentedControl
          options={[
            { key: "paste", label: "Paste public key" },
            { key: "scan", label: "Scan QR" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </View>

      {tab === "paste" ? (
        <View style={styles.pasteWrap}>
          <Field
            mono
            placeholder="Paste the recipient's public key"
            value={pasted}
            onChangeText={setPasted}
          />
          <Button icon="lock" disabled={!canUsePasted} onPress={choosePasted}>
            Use this key
          </Button>
        </View>
      ) : (
        // Token-styled camera placeholder (no expo-camera dep). Real scanning is a follow-up.
        <View
          style={styles.scanPlaceholder}
          accessibilityRole="image"
          accessibilityLabel="QR scanner"
        >
          <Icon name="qr_code_scanner" size={40} color={colors.onSurfaceVariant} />
          <Text style={styles.scanText}>Camera scanning is coming soon</Text>
        </View>
      )}

      <Text style={styles.listLabel}>Saved contacts</Text>
      {contacts.length === 0 ? (
        <Text style={styles.emptyHint}>
          No saved contacts yet. Paste a public key above, or add a contact from the Contacts tab.
        </Text>
      ) : (
        <View style={styles.list}>
          {contacts.map(({ contact: c, publicKey }) => (
            <Pressable
              key={c.id}
              onPress={() => onSelect({ kind: "contact", contact: c, publicKeyString: publicKey })}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${trustIndicator(c.status).a11yLabel}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Avatar initials={c.name} size={38} />
              <View style={styles.rowMain}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.name}
                </Text>
                {/* Mono is reserved for fingerprints / public keys / secure links. */}
                <Text style={styles.fp} numberOfLines={1}>
                  {c.fingerprint}
                </Text>
              </View>
              <TrustChip contactStatus={c.status} />
            </Pressable>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.h2, color: colors.onSurface, marginBottom: 14 },
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
  emptyHint: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  seg: { marginTop: 14 },
  pasteWrap: { marginTop: 14, gap: 10 },
  scanPlaceholder: {
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  scanText: { fontSize: 13, color: colors.onSurfaceVariant },
  listLabel: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.72,
    textTransform: "uppercase",
    color: colors.onSurfaceVariant,
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 14,
  },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  rowMain: { flex: 1, minWidth: 0 },
  name: { ...type.body, fontWeight: "500", color: colors.onSurface },
  fp: { fontFamily: fonts.mono, fontSize: 11, color: colors.outline, marginTop: 2 },
});
