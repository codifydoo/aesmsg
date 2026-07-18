import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, Screen, SegmentedControl } from "@/src/components";
import { LinkRowCard } from "@/src/links/LinkRowCard";
import type { Link } from "@/src/links/links-data";
import { filterByStatus, filterEmptyCopy, type LinkFilter } from "@/src/links/links-filter";
import { colors } from "@/src/theme";

// LinksListScreen (19) — segmented control (All / Active / Expired) + a scrolling list of link
// RowCards. Mirrors grp-links.jsx `S_LinksList` (minus the redundant page title — the tab bar
// already labels "Links"). Filtering is delegated to
// the pure links-filter helper; this screen is thin & presentational and fully controlled by props.
//
// When `offline` is set, a calm neutral banner explains that live status couldn't be fetched, so the
// rows below show last-known/"Status unknown" rather than a false "Revoked" (FE-4/R4).

const FILTER_OPTIONS: { key: LinkFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
];

export interface LinksListScreenProps {
  links: Link[];
  onOpenLink: (id: string) => void;
  /** Show the offline/unreachable banner (the live-status fetch failed). */
  offline?: boolean;
  /** Pull-to-refresh handler; when set, the list becomes a RefreshControl-backed ScrollView. */
  onRefresh?: () => void;
  /** Whether a refresh is in flight (drives the pull-to-refresh spinner). */
  refreshing?: boolean;
}

export function LinksListScreen({
  links,
  onOpenLink,
  offline = false,
  onRefresh,
  refreshing = false,
}: LinksListScreenProps) {
  const [filter, setFilter] = useState<LinkFilter>("all");
  const visible = useMemo(() => filterByStatus(links, filter), [links, filter]);
  // "You have links, but none match this segment" — a first-class empty state distinct from the
  // first-run "No secure links yet" screen (which LinksFlow shows when the whole list is empty).
  const emptyCopy = visible.length === 0 ? filterEmptyCopy(filter) : null;

  const body = (
    <>
      {offline ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Icon name="cloud_off" size={18} color={colors.onSurfaceVariant} />
          <Text style={styles.offlineText}>
            Can't reach the server. Showing last-known status — some links may have changed.
          </Text>
        </View>
      ) : null}
      <View style={styles.seg}>
        <SegmentedControl
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(k) => setFilter(k as LinkFilter)}
        />
      </View>
      {emptyCopy ? (
        <View style={styles.filterEmpty}>
          <Icon name="inbox" size={28} color={colors.onSurfaceVariant} />
          <Text style={styles.filterEmptyTitle}>{emptyCopy.title}</Text>
          <Text style={styles.filterEmptyBody}>{emptyCopy.body}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visible.map((link) => (
            <LinkRowCard key={link.id} link={link} onPress={() => onOpenLink(link.id)} />
          ))}
        </View>
      )}
    </>
  );

  // With a refresh handler wired, render a dedicated ScrollView so it can carry a RefreshControl
  // (RefreshControl must live on the scroll view itself). The content padding mirrors the kit's
  // Screen so the layout is visually identical to the non-refresh path.
  if (onRefresh) {
    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {body}
        </ScrollView>
      </View>
    );
  }

  return <Screen>{body}</Screen>;
}

const styles = StyleSheet.create({
  // Mirrors the kit Screen container (flex + background) + its `.sm-scroll` padding so the
  // pull-to-refresh ScrollView path looks identical to the default Screen path.
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 120,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  offlineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurfaceVariant,
  },
  seg: {
    marginBottom: 12,
  },
  list: {
    gap: 10,
  },
  filterEmpty: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  filterEmptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.onSurface,
    textAlign: "center",
  },
  filterEmptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 260,
  },
});
