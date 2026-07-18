import {
  fingerprint as computeFingerprint,
  type Fingerprint,
  type PublicKeyString,
  truncateFingerprint,
} from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Card, CautionCard, Icon, Screen } from "@/src/components";
import { colors, fonts, type } from "@/src/theme";
import { formatFingerprintLines } from "./fingerprint-lines";
import { KeyQrCode } from "./KeyQrCode";

// Rotate success — after a successful rotation, surface the NEW public key + fingerprint prominently
// (QR + mono block) so the user can immediately re-share it and their contacts can re-verify. The
// amber caution restates the one real caveat: contacts must re-verify this new fingerprint (their
// device will flag your key as changed — that's the intended MitM defense, working as designed).
//
// PRESENTATIONAL: rotation already happened; this screen just displays the new key passed in props.

export interface RotateSuccessScreenProps {
  /** The NEW active public key (returned by the rotate action). */
  newPublicKey: PublicKeyString;
  /** Dismiss back to My Public Key. */
  onDone?: () => void;
}

const noop = () => {};

export function RotateSuccessScreen({ newPublicKey, onDone }: RotateSuccessScreenProps) {
  const [fp, setFp] = useState<Fingerprint | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeFingerprint(newPublicKey)
      .then((f) => {
        if (!cancelled) setFp(f);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [newPublicKey]);

  const shortFp = fp ? truncateFingerprint(fp, 8) : "";
  const fpLines = formatFingerprintLines(shortFp);

  return (
    <Screen topInset={false} contentStyle={styles.content}>
      <AppBar title="Key rotated" onLeading={onDone ?? noop} />

      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Icon name="check_circle" size={22} fill color={colors.emerald} />
        </View>
        <Text style={styles.headerText}>Your new key is active</Text>
      </View>

      <Card style={styles.card}>
        <KeyQrCode value={newPublicKey} />
        {fpLines.length > 0 ? (
          <View accessibilityLabel="Your new fingerprint" style={styles.fpBlock}>
            {fpLines.map((line) => (
              <Text key={line} style={styles.fpLine} selectable>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>

      <CautionCard style={styles.caution}>
        <Icon name="verified_user" size={20} color={colors.tertiary} />
        <Text style={styles.cautionText}>
          Share this new fingerprint so your contacts can re-verify you. Their app will show your
          key as changed until they do — that's the check working as intended.
        </Text>
      </CautionCard>

      <View style={styles.footer}>
        <Button
          icon="ios_share"
          onPress={() => {
            Share.share({ message: newPublicKey }).catch(() => {});
          }}
        >
          Share new public key
        </Button>
        <Button
          kind="outline"
          icon="content_copy"
          onPress={() => {
            Clipboard.setStringAsync(newPublicKey).catch(() => {});
          }}
        >
          Copy public key
        </Button>
        <Button kind="ghost" onPress={() => (onDone ?? noop)()}>
          Done
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(111,210,154,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { ...type.h2, fontSize: 18, color: colors.onSurface, flex: 1 },
  card: { alignItems: "center", gap: 14, padding: 20 },
  fpBlock: { alignItems: "center" },
  fpLine: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 0.52, // 0.04em * 13
    lineHeight: 22,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  caution: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cautionText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
  footer: { gap: 10, paddingTop: 4 },
});
