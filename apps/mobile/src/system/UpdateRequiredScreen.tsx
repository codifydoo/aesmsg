import { StyleSheet, Text, View } from "react-native";
import { Button, Icon } from "@/src/components";
import { colors, space, type } from "@/src/theme";

// UpdateRequiredScreen — the blocking "Update required" gate (63 · Update Required in grp-system.jsx).
// The design centers a `system_update` glyph in a surface-container-high circle, a "Time for an
// update" headline, copy explaining a new version is required to keep messages secure, and a footer
// with an "Update" button + the target version label.
//
// PRESENTATIONAL ONLY — this is a hard gate the user cannot dismiss (no back affordance); Integration
// renders it in front of everything and wires onUpdate to Linking.openURL(storeUrlForPlatform(...))
// from ./update-version. The decision of WHETHER to show it (installed < minimum) is the pure
// isUpdateRequired() in ./update-version.

const noop = () => {};

export interface UpdateRequiredScreenProps {
  /** Headline. Default "Time for an update". */
  title?: string;
  /** Supporting copy. Default explains the update keeps messages secure. */
  body?: string;
  /** Button label. Default "Update". */
  actionLabel?: string;
  /** Version label shown under the button (e.g. "Version 2.4.0"). */
  versionLabel?: string;
  /** Fired when the user taps Update — wire to opening the platform store. */
  onUpdate?: () => void;
}

const DEFAULT_BODY = "A new version is required to keep your messages secure. Update to continue.";

export function UpdateRequiredScreen({
  title = "Time for an update",
  body = DEFAULT_BODY,
  actionLabel = "Update",
  versionLabel,
  onUpdate,
}: UpdateRequiredScreenProps) {
  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Icon name="system_update" size={30} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>

      <View style={styles.footer}>
        <Button onPress={onUpdate ?? noop}>{actionLabel}</Button>
        {versionLabel ? <Text style={styles.version}>{versionLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...type.h1,
    color: colors.onSurface,
    textAlign: "center",
  },
  body: {
    ...type.body,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 280,
  },
  footer: {
    paddingHorizontal: 22,
    paddingBottom: 8,
    paddingTop: 12,
    alignItems: "center",
    gap: 10,
  },
  version: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
});
