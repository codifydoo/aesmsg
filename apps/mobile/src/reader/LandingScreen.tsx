import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MessageMetadata } from "@/src/api/client";
import { AppBar, Button, CautionCard, Icon, Medallion } from "@/src/components";
import { landingNotice } from "@/src/reader/landing-notice";
import { friendlyExpiryRecap } from "@/src/system/format-countdown";
import { colors, type } from "@/src/theme";

// 23 · In-App Link Landing (pre-decrypt). The server no longer stores or returns the recipient
// fingerprint (metadata-leakage mitigation), so the pre-decrypt "Sealed for" row and the
// key-mismatch warning were removed: if the message wasn't sealed for this key, the open simply
// fails into the existing DecryptionFailed flow. The expiry recap remains, plus (FE-2 / R7) an
// explicit DECLINE affordance and, for single-open / final-open links, a caution that opening
// consumes the only view.

export interface LandingScreenProps {
  metadata: MessageMetadata;
  onOpen: () => void;
  /** Decline / back out WITHOUT consuming an open. Wired by the reader flow. */
  onBack?: () => void;
}

export function LandingScreen({ metadata, onOpen, onBack }: LandingScreenProps) {
  const notice = landingNotice(metadata);
  // Friendly, spelled-out countdown ("Expires in 2 hours") rather than a raw locale timestamp dump,
  // matching the calm countdowns used elsewhere. Captured once at mount — the landing is short-lived.
  const expiryRecap = friendlyExpiryRecap(metadata.expiresAt, Date.now());

  // Double-tap guard (FE-2 / R7): the first tap disables the button so a second rapid tap can't fire
  // a second onOpen before the flow transitions off the landing. Defense-in-depth alongside the
  // coordinator's in-flight guard, which is the true single-POST guarantee.
  const [opening, setOpening] = useState(false);
  const firedRef = useRef(false);
  const handleOpen = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setOpening(true);
    onOpen();
  };

  return (
    <View style={styles.root}>
      {onBack ? (
        <AppBar title="Secure message" onLeading={onBack} />
      ) : (
        <AppBar title="Secure message" leading={null} />
      )}

      <View style={styles.body}>
        <Medallion>
          <Icon name="encrypted" size={40} color={colors.primary} />
        </Medallion>

        <Text style={styles.title}>Secure message found</Text>

        <Text style={styles.meta}>{expiryRecap}</Text>
        {notice.opensLabel ? <Text style={styles.meta}>{notice.opensLabel}</Text> : null}

        <Text style={styles.lead}>
          Decryption happens on this device. Your private key never leaves it. If this message
          wasn't sealed for your key, it simply won't open.
        </Text>

        {notice.warning ? (
          <CautionCard style={styles.caution}>
            <View style={styles.cautionRow}>
              <Icon name="visibility" size={18} color={colors.tertiary} />
              <Text style={styles.cautionTitle}>Opens once</Text>
            </View>
            <Text style={styles.cautionBody}>{notice.warning}</Text>
          </CautionCard>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button icon="lock_open" onPress={handleOpen} disabled={opening}>
          {notice.lastView ? "Open message once" : "Open message"}
        </Button>
        {onBack ? (
          <Button kind="ghost" onPress={onBack} disabled={opening}>
            Not now
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    paddingHorizontal: 22,
    paddingBottom: 16,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  title: { ...type.h2, color: colors.onSurface, textAlign: "center" },
  meta: { ...type.body, color: colors.onSurfaceVariant, textAlign: "center" },
  lead: {
    ...type.body,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 290,
  },
  caution: { width: "100%" },
  cautionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  cautionTitle: { ...type.body, color: colors.tertiary, fontWeight: "600" },
  cautionBody: { fontSize: 13, lineHeight: 19, color: colors.onSurfaceVariant },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8, gap: 10 },
});
