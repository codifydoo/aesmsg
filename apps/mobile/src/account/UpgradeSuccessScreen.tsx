import { Pressable, StyleSheet, Text, View } from "react-native";
import { UPGRADE_UNLOCKED } from "@/src/account/account-data";
import { Button, Card, Icon, Screen } from "@/src/components";
import { colors, radii, type } from "@/src/theme";

// 53 · Upgrade Success (grp-account.jsx → S_UpgradeSuccess). A centered emerald success medallion,
// "Welcome to Pro", a zero-knowledge reassurance line ("Everything here still happens on your
// device."), a card listing what's unlocked, and a pinned footer with "Continue" + a
// "Manage subscription" link.
//
// PRESENTATIONAL: the unlocked-items list comes from the mock store (account-data.ts). Emerald =
// success/safe per the color-semantics invariant; copy stays calm/premium with no forbidden terms.

export interface UpgradeSuccessScreenProps {
  /** Dismiss the success screen and return to the app. */
  onDone?: (() => void) | undefined;
  /** Open Manage Subscription. */
  onManageSubscription?: (() => void) | undefined;
}

const noop = () => {};

export function UpgradeSuccessScreen({ onDone, onManageSubscription }: UpgradeSuccessScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.center}>
        <View style={styles.medallion}>
          <Icon name="check" size={44} color={colors.emerald} />
        </View>

        <Text style={styles.title} accessibilityRole="header">
          Welcome to Pro
        </Text>
        <Text style={styles.subtitle}>
          Your plan is active. Everything here still happens on your device.
        </Text>

        <Card style={styles.unlockedCard}>
          {UPGRADE_UNLOCKED.map((item) => (
            <View key={item} style={styles.itemRow}>
              <Icon name="check" size={18} color={colors.emerald} />
              <Text style={styles.itemLabel}>{item}</Text>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.footer}>
        <Button onPress={onDone ?? noop}>Continue</Button>
        <Pressable
          onPress={onManageSubscription ?? noop}
          accessibilityRole="button"
          accessibilityLabel="Manage subscription"
          style={styles.linkTap}
        >
          <Text style={styles.link}>Manage subscription</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  medallion: {
    width: 88,
    height: 88,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.emerald,
    backgroundColor: "rgba(111,210,154,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.h1, color: colors.onSurface, textAlign: "center" },
  subtitle: {
    ...type.body,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  unlockedCard: { width: "100%", gap: 12 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemLabel: { ...type.body, color: colors.onSurface },
  footer: { gap: 12, paddingTop: 12 },
  linkTap: { alignSelf: "center", paddingVertical: 4 },
  link: {
    textAlign: "center",
    color: colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
});
