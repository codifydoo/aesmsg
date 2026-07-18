import { StyleSheet, Text, View } from "react-native";
import { Chip, RowCard } from "@/src/components";
import { isDimmedStatus, isExpiringStatus, statusDescriptor } from "@/src/links/link-status";
import type { Link } from "@/src/links/links-data";
import { formatOpens } from "@/src/links/opens-format";
import { colors } from "@/src/theme";

// LinkRowCard — one row in the Links list. Mirrors grp-links.jsx `LinkListRow`:
//   space-between RowCard, title "<subject> → <recipient>" (600, single-line ellipsis), a sub line
//   "<relative time> · <opens>", and a right-aligned status Chip. Expiring rows get a 2px tertiary
//   (amber) left border; revoked/expired rows dim to ~0.55. Thin & presentational — all branching
//   comes from the pure link-status / opens-format helpers.

export interface LinkRowCardProps {
  link: Link;
  onPress?: () => void;
}

export function LinkRowCard({ link, onPress }: LinkRowCardProps) {
  const { tone, icon, label } = statusDescriptor(link.status);
  const dim = isDimmedStatus(link.status);
  const expiring = isExpiringStatus(link.status);
  // Per the design, the inert end-states (revoked / expired) show only the relative time —
  // no opens line. Active rows show "<used>/<max> opens".
  const opens = !dim;

  return (
    <RowCard
      {...(onPress ? { onPress } : {})}
      style={[styles.row, expiring && styles.expiring, dim && styles.dim]}
    >
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {link.to}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {link.time}
          {opens ? ` · ${formatOpens(link.opensUsed, link.opensMax)}` : ""}
        </Text>
      </View>
      <Chip tone={tone} icon={icon} fill={tone === "green"}>
        {label}
      </Chip>
    </RowCard>
  );
}

const styles = StyleSheet.create({
  row: {
    justifyContent: "space-between",
  },
  expiring: {
    borderLeftWidth: 2,
    borderLeftColor: colors.tertiary,
  },
  dim: {
    opacity: 0.55,
  },
  main: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.onSurface,
  },
  sub: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
});
