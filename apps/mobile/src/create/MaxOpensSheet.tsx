import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button } from "@/src/components";
import { maxOpensOptionRows } from "@/src/create/compose-options";
import type { MaxOpensChoice } from "@/src/create/expiry";
import { colors, radii, type } from "@/src/theme";

// 15 · Max Opens Selector (grp-create.jsx · S_MaxOpens). A BottomSheet of radio rows built from the
// shared MAX_OPENS_OPTIONS (via maxOpensOptionRows): each row carries a label + one-line
// description, and the selected row gets a soft violet tint. Selecting commits the choice back to
// compose, which feeds it UNCHANGED into the seal call's maxOpens. Presentational — no crypto/net.

function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioOn]}>
      {selected ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

export interface MaxOpensSheetProps {
  visible: boolean;
  value: MaxOpensChoice;
  onClose: () => void;
  onConfirm: (value: MaxOpensChoice) => void;
}

export function MaxOpensSheet({ visible, value, onClose, onConfirm }: MaxOpensSheetProps) {
  const rows = maxOpensOptionRows();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.heading} accessibilityRole="header">
        Max opens
      </Text>
      <View style={styles.list} accessibilityRole="radiogroup">
        {rows.map((row) => {
          const selected = row.value === value;
          return (
            <Pressable
              key={String(row.value)}
              onPress={() => onConfirm(row.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${row.label}. ${row.description}`}
              style={[styles.row, selected && styles.rowSelected]}
            >
              <View style={styles.rowMain}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.desc}>{row.description}</Text>
              </View>
              <Radio selected={selected} />
            </Pressable>
          );
        })}
      </View>
      <Button onPress={() => onConfirm(value)} style={styles.done}>
        Done
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.h2, color: colors.onSurface, marginBottom: 12 },
  list: { gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: radii.md,
    padding: 16,
  },
  rowSelected: {
    backgroundColor: "rgba(207,188,255,0.08)",
    borderColor: "rgba(207,188,255,0.30)",
  },
  rowMain: { flex: 1, minWidth: 0 },
  label: { ...type.body, fontWeight: "500", color: colors.onSurface },
  desc: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  done: { marginTop: 16 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.outline,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
});
