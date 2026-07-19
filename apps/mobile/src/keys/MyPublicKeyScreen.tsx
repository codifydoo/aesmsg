import {
  fingerprint as computeFingerprint,
  type Fingerprint,
  type PublicKeyString,
  truncateFingerprint,
} from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import {
  AppBar,
  Avatar,
  BottomSheet,
  Button,
  Card,
  Field,
  ListRow,
  Screen,
} from "@/src/components";
import { isValidLabel } from "@/src/contacts/label";
import { IDENTITY_LABEL, keyDerivedInitials } from "@/src/identity/identity-display";
import { colors, fonts, type } from "@/src/theme";
import { formatFingerprintLines } from "./fingerprint-lines";
import { KeyQrCode } from "./KeyQrCode";

// Screen 40 — My Public Key / Identity Card (design: grp-keys.jsx S_MyPublicKey).
// Identity-card layout: avatar + name, the public-key QR, the fingerprint as a centered mono block,
// then Share / Copy affordances and a link to the encrypted-backup export. The zero-knowledge
// reassurance copy ("…so others can encrypt messages only your device can decrypt") reinforces the
// product invariant. Presentational: the real key + fingerprint come from props / @aesmsg/crypto.

export interface MyPublicKeyScreenProps {
  publicKeyString: PublicKeyString;
  /** Navigate to the Export Encrypted Backup screen (41). Wired by KeysFlow. */
  onExportBackup?: () => void;
  /** Start the Rotate Key flow (42). Wired by KeysFlow to the identity context's rotate action. */
  onRotateKey?: () => void;
  /** Open the contact-card export: prompts for a display name, then builds + shares the .aesmsg file.
   *  Wired by KeysFlow. */
  onExportContactCard?: (displayName: string) => void;
}

export function MyPublicKeyScreen({
  publicKeyString,
  onExportBackup,
  onRotateKey,
  onExportContactCard,
}: MyPublicKeyScreenProps) {
  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cardSheetOpen, setCardSheetOpen] = useState(false);
  const [cardName, setCardName] = useState("");

  useEffect(() => {
    let cancelled = false;
    computeFingerprint(publicKeyString)
      .then((f) => {
        if (!cancelled) setFp(f);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicKeyString]);

  // Human-verifiable short fingerprint: first 8 hex groups (full 16 bytes), then laid out as two
  // centered mono lines (matching the design's two-line fingerprint block).
  const shortFp = fp ? truncateFingerprint(fp, 8) : "";
  const fpLines = formatFingerprintLines(shortFp);

  return (
    <Screen contentStyle={styles.content} topInset={false}>
      <AppBar title="My public key" trailing="more_horiz" onTrailing={() => setMenuOpen(true)} />

      <Card style={styles.card}>
        <Avatar initials={keyDerivedInitials(shortFp)} size={52} />
        <View style={styles.identity}>
          <Text style={styles.name}>{IDENTITY_LABEL}</Text>
          <Text style={styles.subtitle}>Your device</Text>
        </View>

        <KeyQrCode value={publicKeyString} />

        {fpLines.length > 0 ? (
          <View accessibilityLabel="Your fingerprint" style={styles.fpBlock}>
            {fpLines.map((line) => (
              <Text key={line} style={styles.fpLine} selectable>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>

      <Text style={styles.reassurance}>
        Share this public key so others can encrypt messages only your device can decrypt.
      </Text>

      <View style={styles.footer}>
        <Button
          icon="ios_share"
          onPress={() => {
            // Channel-agnostic share sheet; the public key is safe to share (it is not a secret).
            Share.share({ message: publicKeyString }).catch(() => {});
          }}
        >
          Share public key
        </Button>
        <Button
          kind="outline"
          icon="content_copy"
          onPress={() => {
            Clipboard.setStringAsync(publicKeyString).catch(() => {});
          }}
        >
          Copy public key
        </Button>
        <Button
          kind="outline"
          icon="cloud_upload"
          onPress={() => {
            setCardName("");
            setCardSheetOpen(true);
          }}
        >
          Export contact card
        </Button>
        <Pressable
          onPress={onExportBackup}
          accessibilityRole="button"
          accessibilityLabel="Export encrypted backup"
          hitSlop={8}
          style={styles.link}
        >
          <Text style={styles.linkText}>Export encrypted backup</Text>
        </Pressable>
      </View>

      <BottomSheet visible={cardSheetOpen} onClose={() => setCardSheetOpen(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Export contact card</Text>
          <Text style={styles.sheetBody}>
            Choose the name your contact should see. They can edit it when they import your card.
          </Text>
          <Field placeholder="e.g. Elena Rodriguez" value={cardName} onChangeText={setCardName} />
          <Button
            icon="ios_share"
            disabled={!isValidLabel(cardName)}
            onPress={() => {
              setCardSheetOpen(false);
              onExportContactCard?.(cardName.trim());
            }}
          >
            Create contact card
          </Button>
        </View>
      </BottomSheet>

      {/* Overflow menu (the AppBar's more_horiz) — key maintenance. Rotate key (design screen 42) is
          now WIRED to real rotation (roadmap 2.4 / PG-1): it generates a new active keypair, retires
          the old one, and RETAINS the old key so messages already sent to it still open. The honest
          "contacts must re-verify" caveat is stated on the confirm screen, not here. The destructive
          Wipe stays in Settings, not here. */}
      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <ListRow
          icon="autorenew"
          iconColor={colors.primary}
          title="Rotate key"
          sub="Generate a new key. Messages already sent to your old key still open."
          onPress={() => {
            setMenuOpen(false);
            onRotateKey?.();
          }}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingHorizontal: 0 },
  card: { alignItems: "center", gap: 14, padding: 20, marginHorizontal: 22 },
  identity: { alignItems: "center" },
  name: { ...type.h2, fontSize: 20, color: colors.onSurface },
  subtitle: {
    ...type.label,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  fpBlock: { alignItems: "center" },
  fpLine: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 0.52, // 0.04em * 13
    lineHeight: 22, // ~1.7
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  reassurance: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginHorizontal: 22,
  },
  footer: { gap: 10, paddingHorizontal: 22, paddingTop: 8 },
  link: { alignSelf: "center", paddingVertical: 4 },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  sheet: { padding: 20, gap: 12 },
  sheetTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  sheetBody: { fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
});
