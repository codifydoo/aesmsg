import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/src/components/Icon";
import { colors } from "@/src/theme";

// ListRow — a row inside a ListGroup. Mirrors the design's `.lrow` (aesmsg.css): 14/16 padding,
// minHeight 52, a 30x30 rounded surface-container-high icon tile, a title (15) + optional sub (12,
// on-surface-variant), and a trailing slot defaulting to a chevron_right. `value` renders muted
// right-aligned text (e.g. a current setting). The hairline separator (top, inset 56px past the
// icon, per `.lrow + .lrow::before`) is drawn on every row except the first — ListGroup sets
// `__first` to suppress it on the leading row.

export interface ListRowProps {
  icon?: string;
  iconColor?: string;
  title: ReactNode;
  sub?: ReactNode;
  /** Right-aligned slot. Defaults to a chevron when onPress is set; pass null to omit. */
  trailing?: ReactNode;
  /** Muted right-aligned text (e.g. a current value). Rendered before `trailing`. */
  value?: string;
  onPress?: () => void;
  /** Set by ListGroup — true for the first row, which suppresses the top hairline. Internal. */
  __first?: boolean;
}

export function ListRow({
  icon,
  iconColor,
  title,
  sub,
  trailing,
  value,
  onPress,
  __first = false,
}: ListRowProps) {
  const hasChevron = trailing === undefined && onPress !== undefined;
  const trailingNode =
    trailing !== undefined ? (
      trailing
    ) : hasChevron ? (
      <Icon name="chevron_right" size={20} color={colors.outline} />
    ) : null;

  const content = (
    <>
      {!__first && <View style={styles.hairline} />}
      {icon ? (
        <View style={styles.iconTile}>
          <Icon name={icon} size={18} color={iconColor ?? colors.onSurfaceVariant} />
        </View>
      ) : null}
      <View style={styles.main}>
        {typeof title === "string" ? <Text style={styles.title}>{title}</Text> : title}
        {sub != null && (typeof sub === "string" ? <Text style={styles.sub}>{sub}</Text> : sub)}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {trailingNode}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  pressed: { backgroundColor: colors.surfaceContainer },
  hairline: {
    position: "absolute",
    top: 0,
    left: 56,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    opacity: 0.4,
  },
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, color: colors.onSurface },
  sub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  value: { fontSize: 15, color: colors.onSurfaceVariant },
});
