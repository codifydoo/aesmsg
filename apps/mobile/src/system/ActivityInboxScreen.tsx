import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, LargeTitle, Medallion, RowCard, Screen, SectionLabel } from "@/src/components";
import {
  type ActivityEvent,
  activityVisual,
  groupActivity,
  relativeTime,
  unreadCount,
} from "@/src/system/activity-data";
import { colors } from "@/src/theme";

// 54 · Activity / Notifications Inbox (grp-system.jsx · S_Activity). A LargeTitle "Activity" with a
// "Mark all read" affordance, then events grouped under Today / Yesterday / Earlier. Each row shows a
// tinted icon tile (amber for caution kinds, neutral surface otherwise), the event title + a one-line
// metadata-only context, a relative-time label, and an unread dot.
//
// PRODUCT INVARIANT reinforced here: rows describe COUNTS / METADATA ONLY — "Acme staging key was
// viewed", "expires in 1h", "Ciphertext purged from the server" — never any message content. The
// screen is thin & presentational: the feed + all grouping / relative-time logic live in the tested
// ./activity-data module; navigation + marking read are delegated to callbacks.

export interface ActivityInboxScreenProps {
  /**
   * The activity feed to render. Defaults to EMPTY — there is no real event source yet, so the honest
   * default is the empty state (no fabricated sample events). A future metadata-only feed passes its
   * real events here.
   */
  events?: ActivityEvent[];
  /** Reference "now" used for relative labels + grouping. Defaults to the current instant. */
  now?: number;
  /** Mark every event read (only shown when something is unread). */
  onMarkAllRead?: (() => void) | undefined;
  /** Open the detail behind an event (presentational; wired in Integration). */
  onOpenEvent?: ((event: ActivityEvent) => void) | undefined;
}

export function ActivityInboxScreen({
  events = [],
  now = Date.now(),
  onMarkAllRead,
  onOpenEvent,
}: ActivityInboxScreenProps) {
  const groups = useMemo(() => groupActivity(events, now), [events, now]);
  const hasUnread = unreadCount(events) > 0;

  if (groups.length === 0) {
    return <ActivityEmpty />;
  }

  return (
    <Screen contentStyle={styles.content}>
      <LargeTitle
        title="Activity"
        trailing={
          hasUnread ? (
            <Pressable
              onPress={onMarkAllRead}
              accessibilityRole="button"
              accessibilityLabel="Mark all read"
              hitSlop={8}
            >
              <Text style={styles.markAll}>Mark all read</Text>
            </Pressable>
          ) : undefined
        }
      />

      {groups.map((group) => (
        <View key={group.bucket} style={styles.section}>
          <SectionLabel>{group.bucket}</SectionLabel>
          <View style={styles.rows}>
            {group.events.map((event) => (
              <ActivityRow
                key={event.id}
                event={event}
                now={now}
                onPress={onOpenEvent ? () => onOpenEvent(event) : undefined}
              />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

function ActivityRow({
  event,
  now,
  onPress,
}: {
  event: ActivityEvent;
  now: number;
  onPress?: (() => void) | undefined;
}) {
  const visual = activityVisual(event.kind);
  const amber = visual.tone === "amber";
  const a11yLabel = `${event.title}. ${event.context}. ${relativeTime(event.timestamp, now)}${
    event.unread ? ". Unread" : ""
  }`;

  // exactOptionalPropertyTypes: only pass onPress when defined so a target-less row stays inert.
  return (
    <RowCard {...(onPress ? { onPress } : {})} style={styles.rowCard}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.iconTile, amber && styles.iconTileAmber]}
      >
        <Icon
          name={visual.icon}
          size={18}
          color={amber ? colors.tertiary : colors.onSurfaceVariant}
        />
      </View>
      <View style={styles.main} accessibilityLabel={a11yLabel}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.context}>{event.context}</Text>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.time}>{relativeTime(event.timestamp, now)}</Text>
        {event.unread ? <View style={styles.unreadDot} /> : null}
      </View>
    </RowCard>
  );
}

function ActivityEmpty() {
  // Mirrors the design's generic empty (56 · S_GenericEmpty), scoped to Activity.
  return (
    <Screen contentStyle={styles.emptyContent}>
      <Medallion size={72}>
        <Icon name="inbox" size={32} color={colors.onSurfaceVariant} weight={300} />
      </Medallion>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        You're all caught up
      </Text>
      <Text style={styles.emptyBody}>Activity on your links and contacts shows up here.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
  markAll: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  section: { gap: 8 },
  rows: { gap: 8 },
  rowCard: { alignItems: "flex-start" },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 9999,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerHigh,
  },
  iconTileAmber: { backgroundColor: "rgba(231,195,101,0.12)" },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  context: { fontSize: 13, color: colors.onSurfaceVariant, marginTop: 1 },
  trailing: { alignItems: "flex-end", gap: 6 },
  time: { fontSize: 11, color: colors.outline },
  unreadDot: { width: 7, height: 7, borderRadius: 9999, backgroundColor: colors.primary },
  // ── empty state ──
  emptyContent: { flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 14 },
  emptyTitle: { fontSize: 18, lineHeight: 29, color: colors.onSurface },
  emptyBody: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 270,
  },
});
