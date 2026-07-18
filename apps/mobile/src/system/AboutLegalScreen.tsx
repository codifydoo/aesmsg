import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppBar, Card, Icon, ListGroup, ListRow, Screen } from "@/src/components";
import {
  ABOUT_LINKS,
  type AboutLink,
  APP_BUILD,
  APP_NAME,
  APP_VERSION,
  KEYS_ON_DEVICE_LINE,
  OPEN_SOURCE_LINE,
  SECURITY_MODEL_LINE,
} from "@/src/system/about-data";
import { colors, fonts } from "@/src/theme";

// 62 · About / Legal (grp-system.jsx · S_About). An AppBar "About", a centered app lockup (rounded
// lock tile + name + version/build), an "Open source under Apache 2.0 / View source" card, the
// one-line security model, a grouped list of legal/info links (Privacy Policy, Security overview,
// Terms, Open-source licenses, Acknowledgements), and the closing "Private keys stay on your device"
// caption. Presentational — every link delegates to onOpenLink; the screen itself holds no state.
//
// PRODUCT INVARIANT reinforced here: the security-model line + the closing caption restate that
// content is end-to-end encrypted, the backend is zero-knowledge, and private keys stay on the
// device — no server-side trust implied anywhere.

export interface AboutLegalScreenProps {
  /** Back navigation from the AppBar. */
  onBack?: (() => void) | undefined;
  /** Open a legal/info link by id (presentational; wired in Integration). */
  onOpenLink?: ((link: AboutLink) => void) | undefined;
  /** Open the source repository ("View source"). */
  onViewSource?: (() => void) | undefined;
}

const noop = () => {};

export function AboutLegalScreen({ onBack, onOpenLink, onViewSource }: AboutLegalScreenProps) {
  return (
    <>
      <AppBar title="About" onLeading={onBack ?? noop} />
      <Screen topInset={false} contentStyle={styles.content}>
        <View style={styles.lockup}>
          <View style={styles.appTile}>
            <Icon name="lock" size={32} color={colors.primary} />
          </View>
          <Text style={styles.appName} accessibilityRole="header">
            {APP_NAME}
          </Text>
          <Text style={styles.version}>
            Version {APP_VERSION} (build {APP_BUILD})
          </Text>
        </View>

        <Text style={styles.securityModel}>{SECURITY_MODEL_LINE}</Text>

        <Card style={styles.sourceCard}>
          <Text style={styles.sourceLabel}>{OPEN_SOURCE_LINE}</Text>
          <Pressable
            onPress={onViewSource}
            accessibilityRole="button"
            accessibilityLabel="View source"
            hitSlop={8}
          >
            <Text style={styles.viewSource}>View source</Text>
          </Pressable>
        </Card>

        <ListGroup>
          {ABOUT_LINKS.map((link) => (
            <ListRow
              key={link.id}
              icon={link.icon}
              title={link.title}
              onPress={() => onOpenLink?.(link)}
            />
          ))}
        </ListGroup>

        <Text style={styles.footer}>{KEYS_ON_DEVICE_LINE}</Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  lockup: { alignItems: "center", gap: 8, paddingVertical: 8 },
  appTile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "500",
    letterSpacing: -0.24,
    color: colors.onSurface,
  },
  version: { fontSize: 13, color: colors.onSurfaceVariant },
  securityModel: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  sourceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
  },
  sourceLabel: { flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface },
  viewSource: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  footer: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
});
