import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, Toggle } from "@/src/components";
import { colors } from "@/src/theme";

// SwitchRow — a ListGroup row with a leading icon, title + sub, and a trailing Toggle. Mirrors the
// design's local `SwitchRow` in grp-settings.jsx (a `.lrow` with a `.licon`, `.lmain`, and a
// `<Toggle>`). Kept co-located in the settings feature (not a kit export) since it only composes
// existing primitives. The icon tile, hairline, and spacing match the kit's ListRow so groups read
// consistently. `__first` is injected by ListGroup to suppress the leading hairline.

export interface SwitchRowProps {
  icon?: string | undefined;
  title: ReactNode;
  sub?: ReactNode;
  value: boolean;
  onValueChange?: ((value: boolean) => void) | undefined;
  /** Render the row inert: dimmed, no toggle, with an "Available soon" trailing label. */
  disabled?: boolean | undefined;
  /** Set by ListGroup — true for the first row, which suppresses the top hairline. Internal. */
  __first?: boolean | undefined;
}

export function SwitchRow({
  icon,
  title,
  sub,
  value,
  onValueChange,
  disabled = false,
  __first = false,
}: SwitchRowProps) {
  return (
    <View
      style={[styles.row, disabled && styles.rowDisabled]}
      accessibilityState={disabled ? { disabled: true } : undefined}
    >
      {!__first && <View style={styles.hairline} />}
      {icon ? (
        <View style={styles.iconTile}>
          <Icon name={icon} size={18} color={colors.onSurfaceVariant} />
        </View>
      ) : null}
      <View style={styles.main}>
        {typeof title === "string" ? <Text style={styles.title}>{title}</Text> : title}
        {sub != null && (typeof sub === "string" ? <Text style={styles.sub}>{sub}</Text> : sub)}
      </View>
      {disabled ? (
        <Text style={styles.soon}>Available soon</Text>
      ) : (
        <Toggle
          value={value}
          onValueChange={onValueChange ?? (() => {})}
          // Name the switch after its row title so screen readers announce which setting it controls.
          {...(typeof title === "string" ? { accessibilityLabel: title } : {})}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
    position: "relative",
  },
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
  rowDisabled: { opacity: 0.6 },
  soon: { fontSize: 12, color: colors.onSurfaceVariant, fontWeight: "500", alignSelf: "center" },
});
