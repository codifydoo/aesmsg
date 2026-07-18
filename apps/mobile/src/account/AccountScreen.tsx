import type { PublicKeyString } from "@aesmsg/crypto";
import * as Application from "expo-application";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { PlanId } from "@/src/account/account-data";
import { formatAppVersion, formatDeviceLabel, osDisplayName } from "@/src/account/account-device";
import {
  Avatar,
  Chip,
  Icon,
  LargeTitle,
  ListGroup,
  ListRow,
  Screen,
  SectionLabel,
} from "@/src/components";
import {
  IDENTITY_LABEL,
  keyDerivedInitials,
  useShortFingerprint,
} from "@/src/identity/identity-display";
import { colors, fonts, radii, type } from "@/src/theme";

// 50 · Account / Profile (grp-account.jsx → S_Account). Large "Account" title, a profile card
// (avatar + honest device-local identity label), a plan-status row that opens the paywall (free) or
// manage-subscription (pro), an Identity & device list, and the "we don't store a profile for you"
// reassurance.
//
// TRUST DATA IS REAL, NOT MOCKED:
//   • The avatar + key fingerprint derive from the real resolved identity (useShortFingerprint /
//     keyDerivedInitials — the same source the Keys screen uses). No fabricated fingerprint.
//   • "This device" shows the real OS + version (react-native Platform); "App version" comes from
//     expo-application. Neither is a constant.
//   • The old "Key created" row is GONE — the app persists no key-creation timestamp, so showing one
//     would have been a fabricated date. When a real creation timestamp exists, re-add the row.
//
// KNOWN GAP: the hardware model ("iPhone 16 Pro") needs `expo-device`, which is not a dependency; we
// deliberately do not add a native dep to fabricate a model, so "This device" shows OS + version.
//
// Lock / Wipe deliberately do NOT live here: the design's screen 50 has no such rows. Re-locking and
// the destructive "Wipe keys from this device" affordance belong to Settings (Danger zone) and the
// dedicated Wipe Identity screen (42/43), which already own that flow.

export interface AccountScreenProps {
  /** Current plan — drives the plan row (Free → upgrade, Pro → manage). */
  planId?: PlanId;
  /** Real public key — drives the key-derived avatar + the real short fingerprint. */
  publicKeyString?: PublicKeyString | undefined;
  /** Open the paywall (shown on the Free plan). */
  onUpgrade?: (() => void) | undefined;
  /** Open Manage Subscription (shown on Pro). */
  onManageSubscription?: (() => void) | undefined;
}

const noop = () => {};

// Real OS version string. iOS reports the marketing version via Platform.Version ("18.2"); Android's
// Platform.Version is the API level, so we prefer constants.Release (the marketing version, e.g. "14").
function deviceOsVersion(): string {
  if (Platform.OS === "android") {
    return Platform.constants.Release ?? String(Platform.Version);
  }
  return String(Platform.Version);
}

export function AccountScreen({
  planId = "free",
  publicKeyString,
  onUpgrade,
  onManageSubscription,
}: AccountScreenProps) {
  const isPro = planId === "pro";
  const shortFingerprint = useShortFingerprint(publicKeyString, 2);
  const initials = keyDerivedInitials(shortFingerprint);
  const deviceLabel = formatDeviceLabel(osDisplayName(Platform.OS), deviceOsVersion());
  const appVersion = formatAppVersion(Application.nativeApplicationVersion);

  return (
    <Screen contentStyle={styles.content}>
      <LargeTitle title="Account" />

      {/* Profile card — device-local, key-derived identity (no editable/fabricated display name) */}
      <View style={styles.profileCard}>
        <Avatar initials={initials} size={52} />
        <View style={styles.profileMain}>
          <Text style={styles.profileName}>{IDENTITY_LABEL}</Text>
          <Text style={styles.profileNote}>Stored on this device only.</Text>
        </View>
      </View>

      {/* Plan-status row — Free → upgrade, Pro → manage */}
      <Pressable
        onPress={(isPro ? onManageSubscription : onUpgrade) ?? noop}
        accessibilityRole="button"
        accessibilityLabel={isPro ? "Manage subscription" : "Upgrade to Pro"}
        style={({ pressed }) => [styles.planRow, pressed && styles.cardPressed]}
      >
        <View style={styles.planLeft}>
          <Chip tone="violet">{isPro ? "Pro" : "Free"}</Chip>
          <Text style={styles.planLabel}>{isPro ? "Manage subscription" : "Upgrade to Pro"}</Text>
        </View>
        <Icon name="chevron_right" size={20} color={colors.outline} />
      </Pressable>

      {/* Identity & device — every value here is real (fingerprint / OS / app version) */}
      <View>
        <SectionLabel>Identity & device</SectionLabel>
        <ListGroup>
          <ListRow
            title="Key fingerprint"
            trailing={<Text style={styles.monoValue}>{shortFingerprint}</Text>}
          />
          {deviceLabel ? <ListRow title="This device" value={deviceLabel} trailing={null} /> : null}
          {appVersion ? <ListRow title="App version" value={appVersion} trailing={null} /> : null}
        </ListGroup>
      </View>

      <Text style={styles.footnote}>
        We don't store a profile for you. This is everything on this device.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderTopColor: "rgba(255,255,255,0.09)",
    borderRadius: radii.lg,
    padding: 16,
  },
  cardPressed: { backgroundColor: colors.surfaceContainer },
  profileMain: { flex: 1, minWidth: 0 },
  profileName: { ...type.h2, fontSize: 18, color: colors.onSurface },
  profileNote: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderTopColor: "rgba(255,255,255,0.09)",
    borderRadius: radii.lg,
    padding: 16,
  },
  planLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  planLabel: { ...type.body, fontWeight: "500", color: colors.onSurface },
  monoValue: { fontFamily: fonts.mono, fontSize: 12, color: colors.onSurfaceVariant },
  footnote: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
});
