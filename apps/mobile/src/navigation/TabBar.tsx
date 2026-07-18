import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/src/components";
import { TABS, type Tab } from "@/src/navigation/tabs";
import { colors, radii } from "@/src/theme";

// Glassmorphic, pinned bottom tab bar. Mirrors the design's TabBarStatic (kit.jsx) + the
// .tabbar / .tab-* rules in aesmsg.css and S_TabBar (grp-shell.jsx, screen 10):
//   • 1px top hairline (outline-variant) over a near-opaque surface fill
//   • five equal slots, each = filled+primary (active) / outline+on-surface-variant icon
//     over an 11/500 label
//   • active slot shows a rounded primary-16%-alpha pill behind the icon + primary text
//   • a small bottom cushion (the App-level SafeAreaView owns the home-indicator inset)
//
// FOLLOW-UP: the design uses backdrop-filter: blur(22px) for true glass, which RN cannot do
// without expo-blur. We approximate with a near-opaque rgba(20,18,24,0.92) fill here; wiring an
// <BlurView> behind the row (and dropping the fill to the design's 0.62 alpha) is a deferred
// upgrade owned by the Foundation phase, which owns native deps.

export interface TabBarProps {
  active: Tab;
  onChange: (t: Tab) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {TABS.map((t) => {
          const selected = t.key === active;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t.label}
              style={styles.slot}
              onPress={() => onChange(t.key)}
            >
              <View style={styles.iconWrap}>
                {selected && <View style={styles.pill} />}
                <Icon
                  name={t.icon}
                  size={24}
                  fill={selected}
                  color={selected ? colors.primary : colors.onSurfaceVariant}
                />
              </View>
              <Text style={[styles.label, selected && styles.labelActive]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // .tabbar — near-opaque glass fill (see FOLLOW-UP above) + 1px top hairline.
  bar: {
    // The App-level SafeAreaView already insets the home indicator; keep only a small cushion here.
    // (The old fixed 30px double-counted that inset, leaving the bar floating high with a gap below.)
    paddingBottom: 12,
    backgroundColor: "rgba(20, 18, 24, 0.92)", // ≈ --surface @ 0.92 (expo-blur is a follow-up)
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
  },
  // .tabbar-row — five equal columns.
  row: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 6,
  },
  // .tab-slot
  slot: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 6,
    paddingBottom: 4,
    borderRadius: 14,
  },
  // .tab-iconwrap — fixed-height stage so the pill anchors consistently.
  iconWrap: {
    position: "relative",
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  // .tab-pill — rounded primary 16%-alpha pill behind the active icon.
  pill: {
    position: "absolute",
    width: 54,
    height: 30,
    borderRadius: radii.full,
    backgroundColor: "rgba(207, 188, 255, 0.16)", // --primary @ 0.16
  },
  // .tab-label — 11/500.
  label: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.22, // .02em * 11
    lineHeight: 11,
    color: colors.onSurfaceVariant,
  },
  labelActive: {
    color: colors.primary,
  },
});
