import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/src/components";
import { colors, space, type } from "@/src/theme";

// GenericEmptyState — the reusable centered empty state (56 · Generic Empty in grp-system.jsx).
// The design centers a single low-emphasis `inbox` glyph (size 48, weight 300, on-surface-variant)
// over a `t-body-lg` headline + `t-body` supporting line ("You're all caught up" / "Activity on your
// links and contacts shows up here.") — a bare glyph, NOT framed in a medallion. We accept an optional
// action node (typically a kit Button) for empty states that also offer a next step.
//
// Props-driven so any feature can reuse it (empty Activity, empty Links, empty Contacts, …). Purely
// presentational — no data, no navigation.

export interface GenericEmptyStateProps {
  /** Material Symbols name shown above the copy (e.g. "inbox", "link_off", "contacts"). */
  icon: string;
  /** Headline, e.g. "You're all caught up". */
  title: string;
  /** Supporting line under the headline. */
  body?: string;
  /** Optional call-to-action rendered below the copy (typically a kit Button). */
  action?: ReactNode;
}

export function GenericEmptyState({ icon, title, body, action }: GenericEmptyStateProps) {
  return (
    <View style={styles.root}>
      <Icon name={icon} size={48} color={colors.onSurfaceVariant} weight={300} />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    gap: 14,
    backgroundColor: colors.background,
  },
  title: {
    ...type.bodyLg,
    color: colors.onSurface,
    textAlign: "center",
    fontWeight: "500",
  },
  body: {
    ...type.body,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 270,
  },
  action: {
    marginTop: space.sm,
    alignSelf: "stretch",
  },
});
