import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppBar,
  Avatar,
  Button,
  Chip,
  Fingerprint,
  ListGroup,
  ListRow,
  SectionLabel,
} from "@/src/components";
import type { Contact } from "@/src/contacts/contacts-data";
import { colors } from "@/src/theme";

// 35 · Contact Detail (grp-contacts.jsx · S_ContactDetail).
// AppBar "Contact Details" + trailing more_horiz; centered big Avatar + name + green "Verified" Chip;
// "Public Key Fingerprint" SectionLabel + Fingerprint block + Copy / Scan-QR outline buttons; a
// Last-used / Key-created ListGroup; footer primary "Send secure message" + red "Remove contact".
//
// Color semantics: the green Verified chip = a verified key; "Remove contact" is the only red
// affordance (a destructive action). Nothing here implies the server holds anything but ciphertext.

export interface ContactDetailScreenProps {
  contact: Contact;
  onBack: () => void;
  onMore?: () => void;
  onScanQr: () => void;
  onSend: () => void;
  onRemove: () => void;
  /** Tap a verifiable contact's chip / open the verify flow. */
  onVerify?: () => void;
}

export function ContactDetailScreen({
  contact,
  onBack,
  onMore,
  onScanQr,
  onSend,
  onRemove,
  onVerify,
}: ContactDetailScreenProps) {
  const [copied, setCopied] = useState(false);
  const fpText = contact.fullFingerprint ?? contact.fingerprint;

  async function copyFingerprint() {
    await Clipboard.setStringAsync(fpText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={styles.root}>
      <AppBar
        title="Contact Details"
        onLeading={onBack}
        trailing="more_horiz"
        {...(onMore ? { onTrailing: onMore } : {})}
      />

      <View style={styles.content}>
        <View style={styles.idBlock}>
          <Avatar initials={contact.name} size={72} />
          <Text style={styles.name} accessibilityRole="header">
            {contact.name}
          </Text>
          {contact.status === "verified" ? (
            <Chip tone="green" icon="verified">
              Verified
            </Chip>
          ) : (
            <Pressable
              onPress={onVerify}
              accessibilityRole="button"
              accessibilityLabel="Verify identity"
            >
              <Chip tone="amber" icon="priority_high" fill={false}>
                {contact.status === "changed" ? "Key changed" : "Unverified"}
              </Chip>
            </Pressable>
          )}
        </View>

        <View>
          <SectionLabel>Public Key Fingerprint</SectionLabel>
          <Fingerprint groups={fpText} />
          <View style={styles.fpActions}>
            <Button
              kind="outline"
              icon="content_copy"
              onPress={copyFingerprint}
              style={styles.fpBtn}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button kind="outline" icon="qr_code_scanner" onPress={onScanQr} style={styles.fpBtn}>
              Scan QR
            </Button>
          </View>
        </View>

        <ListGroup>
          <ListRow title="Last used" value={contact.lastUsed ?? "—"} trailing={null} />
          <ListRow title="Key created" value={contact.keyCreated ?? "—"} trailing={null} />
        </ListGroup>
      </View>

      <View style={styles.footer}>
        <Button icon="lock" onPress={onSend}>
          Send secure message
        </Button>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove contact"
          style={styles.removeWrap}
        >
          <Text style={styles.remove}>Remove contact</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 4, gap: 16 },
  idBlock: { alignItems: "center", gap: 10 },
  name: { fontSize: 26, fontWeight: "600", letterSpacing: -0.52, color: colors.onSurface },
  fpActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  fpBtn: { flex: 1, minHeight: 46 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8, gap: 10 },
  removeWrap: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  remove: { color: colors.error, fontSize: 14, fontWeight: "500", textAlign: "center" },
});
