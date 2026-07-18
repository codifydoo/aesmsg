import type { PublicKeyString } from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
import { StyleSheet, Text, View } from "react-native";
import { AppBar, Icon, ListGroup, ListRow, Screen } from "@/src/components";
import { useShortFingerprint } from "@/src/identity/identity-display";
import { colors, fonts } from "@/src/theme";

// 48 · Advanced (grp-settings.jsx → S_Advanced). AppBar "Advanced"; a grouped list with the
// encryption format, the public-key fingerprint (mono, copy), and a Debug-logs row; plus the HPKE
// explainer caption. Thin & presentational.
//
// The fingerprint is the REAL one, derived from `publicKeyString` via the shared useShortFingerprint
// hook (the same source the Keys / Settings-root screens use) — never a fabricated sample. The old
// mock "Device ID" row is GONE: the app has no stable app-scoped device id to show (the only
// device-scoped secret is the biometric-gated key-wrap secret, which must never be surfaced), and
// fabricating one on a trust screen is exactly what this pass removes. The encryption-format label is
// a real, static description of the crypto @aesmsg/crypto actually uses.

const ENCRYPTION_FORMAT = "HPKE · X25519 / AES-256-GCM"; // real protocol, not fabricated live data
const FINGERPRINT_GROUPS = 4; // design shows 4 hex groups: "E82F 4D11 A9C2 77BE"
const noop = () => {};

export interface AdvancedScreenProps {
  onBack?: (() => void) | undefined;
  /** The real public key — its fingerprint is shown (mono, copyable). */
  publicKeyString?: PublicKeyString | undefined;
  /** Open the Debug-logs screen (presentational chevron row for now). */
  onOpenDebugLogs?: (() => void) | undefined;
}

export function AdvancedScreen({ onBack, publicKeyString, onOpenDebugLogs }: AdvancedScreenProps) {
  const fp = useShortFingerprint(publicKeyString, FINGERPRINT_GROUPS);
  const copyIcon = <Icon name="content_copy" size={18} color={colors.primary} />;

  return (
    <Screen topInset={false}>
      <AppBar title="Advanced" onLeading={onBack ?? noop} />

      <View style={styles.stack}>
        <Text style={styles.intro}>Technical details for advanced users.</Text>

        <ListGroup>
          <ListRow
            title="Encryption format"
            sub={ENCRYPTION_FORMAT}
            trailing={<Text style={styles.monoTrailing}>HPKE</Text>}
          />
          <ListRow
            title="Public key fingerprint"
            sub={
              <Text style={styles.monoSub} selectable>
                {fp}
              </Text>
            }
            trailing={copyIcon}
            onPress={() => {
              if (fp) void Clipboard.setStringAsync(fp);
            }}
          />
          <ListRow
            icon="receipt_long"
            title="Debug logs"
            sub="Plaintext and keys are never written to logs."
            onPress={onOpenDebugLogs ?? noop}
          />
        </ListGroup>

        <Text style={styles.caption}>
          HPKE seals each message to the recipient's public key. Private keys stay on your device.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  intro: { fontSize: 15, lineHeight: 23, color: colors.onSurfaceVariant },
  monoTrailing: { fontFamily: fonts.mono, fontSize: 13, color: colors.onSurfaceVariant },
  monoSub: { fontFamily: fonts.mono, fontSize: 11, color: colors.onSurfaceVariant, marginTop: 1 },
  caption: { fontSize: 12, lineHeight: 18, color: colors.onSurfaceVariant },
});
