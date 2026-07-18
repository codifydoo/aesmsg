import type { PublicKeyString } from "@aesmsg/crypto";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, Card, Chip, ListGroup, ListRow, Screen, SectionLabel } from "@/src/components";
import {
  IDENTITY_LABEL,
  keyDerivedInitials,
  useShortFingerprint,
} from "@/src/identity/identity-display";
import { useEntitlement } from "@/src/pro/entitlement-context";
import { colors, fonts } from "@/src/theme";

// 45 · Settings Root (grp-settings.jsx → S_SettingsRoot). A profile card (avatar, device-local
// identity label, mono short fingerprint, a violet plan chip), three grouped sections (Security /
// Preferences / Account), and the footer caption. Thin & presentational: navigation is delegated to
// onOpen(section); the Lock/Wipe actions are reachable from the security and privacy screens this
// routes to.
//
// TRUST HONESTY: the plan chip reflects the REAL entitlement (useEntitlement), not a hardcoded "Free".
// The emerald "verified" glyph that used to sit next to the user's OWN fingerprint is GONE —
// green/"verified" is reserved for CONTACTS you have verified by fingerprint; self-verification is
// meaningless and misuses the trust color.

/** The destinations reachable from the Settings root. */
export type SettingsSection =
  | "security"
  | "privacy"
  | "keys"
  | "notifications"
  | "advanced"
  | "account"
  | "activity"
  | "help"
  | "about";

export interface SettingsRootScreenProps {
  /** Navigate to a settings sub-screen / destination. */
  onOpen?: ((section: SettingsSection) => void) | undefined;
  /** Re-lock the app (surfaced here and on the Security screen). */
  onLock?: (() => void) | undefined;
  /** Begin the wipe-this-device's-identity flow (handled with the WipeConfirmModal on Privacy). */
  onWipe?: (() => void) | undefined;
  /** Real public key — drives the key-derived avatar + the real short fingerprint. */
  publicKeyString?: PublicKeyString | undefined;
}

export function SettingsRootScreen({ onOpen, onLock, publicKeyString }: SettingsRootScreenProps) {
  const shortFingerprint = useShortFingerprint(publicKeyString);
  const initials = keyDerivedInitials(shortFingerprint);
  const { entitlement } = useEntitlement();
  return (
    <Screen>
      <View style={styles.stack}>
        <Card style={styles.profileCard}>
          <Avatar initials={initials} size={48} />
          <View style={styles.profileMain}>
            <Text style={styles.profileName}>{IDENTITY_LABEL}</Text>
            <Text style={styles.fp} selectable>
              {shortFingerprint}
            </Text>
          </View>
          <Chip tone="violet">{entitlement.isPro ? "Pro" : "Free"}</Chip>
        </Card>

        <View>
          <SectionLabel>Security</SectionLabel>
          <ListGroup>
            <ListRow icon="security" title="Security" onPress={() => onOpen?.("security")} />
            <ListRow icon="visibility_off" title="Privacy" onPress={() => onOpen?.("privacy")} />
            <ListRow icon="vpn_key" title="Keys" onPress={() => onOpen?.("keys")} />
            {/* Manual lock — drops the in-memory private key immediately (e.g. before handing over the
                phone). It's an ACTION, not navigation, so no chevron; calling onLock flips the app to
                "locked", which the root renders as the designed re-auth gate. */}
            <ListRow icon="lock" title="Lock now" trailing={null} onPress={() => onLock?.()} />
          </ListGroup>
        </View>

        <View>
          <SectionLabel>Preferences</SectionLabel>
          <ListGroup>
            <ListRow
              icon="notifications"
              title="Notifications"
              onPress={() => onOpen?.("notifications")}
            />
            <ListRow icon="tune" title="Advanced" onPress={() => onOpen?.("advanced")} />
          </ListGroup>
        </View>

        <View>
          <SectionLabel>Account</SectionLabel>
          <ListGroup>
            <ListRow icon="person" title="Account" onPress={() => onOpen?.("account")} />
            <ListRow icon="notifications" title="Activity" onPress={() => onOpen?.("activity")} />
            <ListRow icon="help" title="Help & FAQ" onPress={() => onOpen?.("help")} />
            <ListRow icon="info" title="About & Legal" onPress={() => onOpen?.("about")} />
          </ListGroup>
        </View>

        <Text style={styles.footer}>aesmsg 1.0.0 · Private keys stay on this device</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileMain: { flex: 1, minWidth: 0 },
  profileName: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "500",
    color: colors.onSurface,
  },
  fp: { fontFamily: fonts.mono, fontSize: 11, color: colors.onSurfaceVariant, marginTop: 3 },
  footer: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
});
