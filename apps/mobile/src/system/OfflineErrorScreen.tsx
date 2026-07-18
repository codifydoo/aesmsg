import { StyleSheet, Text, View } from "react-native";
import { Button, Icon } from "@/src/components";
import { colors, space, type } from "@/src/theme";

// OfflineErrorScreen — the global offline / can't-reach-data state (57 · Offline / Error in
// grp-system.jsx). The design pairs a thin amber status banner ("You're offline.") with a centered
// `cloud_off` glyph, a calm headline, a reassurance that the user's plaintext is safe on-device, and
// a Retry button.
//
// COLOR SEMANTIC: this is a transient/ambient state, NOT a destructive one — so it stays amber
// (tertiary) + neutral, never red. The copy reinforces the zero-knowledge model: only the encrypted
// data is unreachable; the plaintext never left the device.
//
// Presentational and props-driven (title/body overridable, onRetry optional) so it can back a tab's
// network-error state or a one-off fetch failure.

export interface OfflineErrorScreenProps {
  /** Optional thin status banner label. Default "You're offline." Pass null/empty to hide it. */
  bannerLabel?: string | null;
  /** Headline. Default "Can't reach encrypted data." */
  title?: string;
  /** Supporting line. Default reassures that plaintext is safe on the device. */
  body?: string;
  /** Retry handler. When omitted, the Retry button is hidden. */
  onRetry?: () => void;
}

const DEFAULT_TITLE = "Can't reach encrypted data.";
const DEFAULT_BODY =
  "The encrypted data can't be reached right now. Your plaintext is safe on this device.";

export function OfflineErrorScreen({
  bannerLabel = "You're offline.",
  title = DEFAULT_TITLE,
  body = DEFAULT_BODY,
  onRetry,
}: OfflineErrorScreenProps) {
  return (
    <View style={styles.root}>
      {bannerLabel ? (
        <View style={styles.banner} accessibilityRole="alert">
          <View style={styles.bannerDot} />
          <Text style={styles.bannerText}>{bannerLabel}</Text>
        </View>
      ) : null}

      <View style={styles.center}>
        <Icon name="cloud_off" size={48} color={colors.onSurfaceVariant} />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
        {onRetry ? (
          <Button icon="refresh" onPress={onRetry} style={styles.retry}>
            Retry
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    backgroundColor: colors.surfaceContainerHigh,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: colors.tertiary,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.onSurface,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  title: {
    ...type.h2,
    color: colors.onSurface,
    textAlign: "center",
  },
  body: {
    ...type.body,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 290,
  },
  retry: {
    width: "auto",
    paddingHorizontal: 28,
    marginTop: space.sm,
  },
});
