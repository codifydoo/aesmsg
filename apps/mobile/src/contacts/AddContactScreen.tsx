import { StyleSheet, Text, View } from "react-native";
import { AppBar, Icon, RowCard, Screen } from "@/src/components";
import { colors } from "@/src/theme";

// 36 · Add Contact (grp-contacts.jsx · S_AddContact).
// AppBar "Add contact"; three method RowCards (icon tile + title + sub + chevron); a footer info note
// reminding the user to verify the fingerprint out-of-band before sending sensitive information.
//
// Note: the design's "Import contact file" uses Material Symbols "upload_file", which is not in the
// RN icon map — we use "cloud_upload" (mapped, same affordance) so it renders a real glyph.

export type AddContactMethod = "scan" | "paste" | "import";

export interface AddContactScreenProps {
  onBack: () => void;
  onPick: (method: AddContactMethod) => void;
}

const METHODS: { key: AddContactMethod; icon: string; title: string; sub: string }[] = [
  {
    key: "scan",
    icon: "qr_code_scanner",
    title: "Scan QR code",
    sub: "Point your camera at their key QR",
  },
  {
    key: "paste",
    icon: "content_paste",
    title: "Paste public key",
    sub: "From clipboard or a message",
  },
  {
    key: "import",
    icon: "cloud_upload",
    title: "Import contact file",
    sub: "A .aesmsg key file they shared",
  },
];

export function AddContactScreen({ onBack, onPick }: AddContactScreenProps) {
  return (
    <View style={styles.root}>
      <AppBar title="Add contact" onLeading={onBack} />
      <Screen topInset={false} contentStyle={styles.content}>
        <Text style={styles.lead}>Choose how to add your contact's public key.</Text>

        <View style={styles.methods}>
          {METHODS.map((m) => (
            <RowCard key={m.key} onPress={() => onPick(m.key)} style={styles.method}>
              <View style={styles.tile}>
                <Icon name={m.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.methodMain}>
                <Text style={styles.methodTitle}>{m.title}</Text>
                <Text style={styles.methodSub}>{m.sub}</Text>
              </View>
              <Icon name="chevron_right" size={20} color={colors.outline} />
            </RowCard>
          ))}
        </View>

        <View style={styles.note}>
          <Icon name="info" size={18} color={colors.onSurfaceVariant} />
          <Text style={styles.noteText}>
            Verify this fingerprint with your contact before sending sensitive information.
          </Text>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { gap: 14, paddingTop: 4 },
  lead: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 23 },
  methods: { gap: 10 },
  method: { padding: 16 },
  tile: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  methodMain: { flex: 1, minWidth: 0 },
  methodTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  methodSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  noteText: { flex: 1, fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 20 },
});
