import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Chip } from "@/src/components";
import { expiryOptionRows } from "@/src/create/compose-options";
import type { ExpiryChoice } from "@/src/create/expiry";
import {
  CUSTOM_EXPIRY_MAX_MS,
  CUSTOM_EXPIRY_MIN_MS,
  customExpiryDefault,
  validateCustomExpiry,
} from "@/src/pro/custom-expiry";
import { colors, type } from "@/src/theme";

// 14 · Expiry Selector (grp-create.jsx · S_Expiry). A BottomSheet of radio rows built from the
// shared EXPIRY_OPTIONS (via expiryOptionRows): 10m / 1h / 24h(Default) / 7d / 1 year (maximum).
// There is no "never" option — the longest is a real bounded 365-day expiry (roadmap 2.5), which
// the server enforces as a ceiling. Selecting a row stages it; "Confirm" commits the choice back to
// compose, which feeds expiry.ts → the seal
// call. Purely presentational — no crypto, no network.
//
// The radio glyph is drawn from RN primitives (a bordered ring + filled dot) so it tracks the
// design's radio_button_checked/unchecked exactly without depending on those glyph names.

function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioOn]}>
      {selected ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

export interface ExpirySelectorSheetProps {
  visible: boolean;
  value: ExpiryChoice;
  onClose: () => void;
  onConfirm: (value: ExpiryChoice) => void;
  /** Show the Pro-only "Custom…" row + date/time picker. */
  allowCustom?: boolean;
  /** Commit a chosen absolute custom expiry instant. */
  onConfirmCustom?: (date: Date) => void;
}

export function ExpirySelectorSheet({
  visible,
  value,
  onClose,
  onConfirm,
  allowCustom,
  onConfirmCustom,
}: ExpirySelectorSheetProps) {
  const rows = expiryOptionRows();

  // Local draft for the custom date/time picker.
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => customExpiryDefault());

  // Android date→time chain: after picking the date portion, open the time picker.
  // QA: on Android tap "Custom…" → date dialog → time dialog → validates → confirms.
  const [androidPhase, setAndroidPhase] = useState<"date" | "time" | null>(null);
  // Hold the partial date between the two Android dialog steps.
  const [androidDatePart, setAndroidDatePart] = useState<Date | null>(null);

  const minDate = new Date(Date.now() + CUSTOM_EXPIRY_MIN_MS);
  const maxDate = new Date(Date.now() + CUSTOM_EXPIRY_MAX_MS);

  function openCustom() {
    setDraft(customExpiryDefault());
    if (Platform.OS === "ios") {
      setCustomOpen(true);
    } else {
      // Android: start the two-step chain with the date picker first.
      setAndroidDatePart(null);
      setAndroidPhase("date");
    }
  }

  function commitCustom(d: Date) {
    if (!validateCustomExpiry(d).ok) return;
    onConfirmCustom?.(d);
  }

  // Android: handle the date-picker step, then open the time-picker step.
  function handleAndroidDateChange(_e: DateTimePickerEvent, selected: Date | undefined) {
    if (_e.type === "dismissed" || !selected) {
      setAndroidPhase(null);
      return;
    }
    setAndroidDatePart(selected);
    // Advance to the time step.
    setAndroidPhase("time");
  }

  // Android: handle the time-picker step, merge with the saved date part, and commit.
  function handleAndroidTimeChange(_e: DateTimePickerEvent, selected: Date | undefined) {
    setAndroidPhase(null);
    if (_e.type === "dismissed" || !selected || !androidDatePart) return;
    // Combine: take year/month/day from the date step, hour/minute from the time step.
    const combined = new Date(androidDatePart);
    combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    commitCustom(combined);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.heading} accessibilityRole="header">
        Link expires in
      </Text>
      <View style={styles.list} accessibilityRole="radiogroup">
        {rows.map((row) => {
          const selected = row.value === value;
          return (
            <Pressable
              key={row.value}
              onPress={() => onConfirm(row.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={row.label}
              style={styles.row}
            >
              <View style={styles.rowLabel}>
                <Text style={styles.label}>{row.label}</Text>
                {row.isDefault ? (
                  <Chip tone="violet" fill={false}>
                    Default
                  </Chip>
                ) : null}
              </View>
              <Radio selected={selected} />
            </Pressable>
          );
        })}

        {allowCustom ? (
          <Pressable
            onPress={openCustom}
            accessibilityRole="button"
            accessibilityLabel="Custom expiry date and time"
            style={styles.row}
          >
            <View style={styles.rowLabel}>
              <Text style={styles.label}>Custom…</Text>
              <Chip tone="violet" fill={false}>
                Pro
              </Chip>
            </View>
            <Radio selected={false} />
          </Pressable>
        ) : null}
      </View>

      {/* iOS: inline datetime picker shown inside the sheet when the Custom row was tapped. */}
      {allowCustom && customOpen && Platform.OS === "ios" ? (
        <View style={styles.iosPicker}>
          <DateTimePicker
            value={draft}
            mode="datetime"
            display="inline"
            minimumDate={minDate}
            maximumDate={maxDate}
            onChange={(_e: DateTimePickerEvent, d?: Date) => {
              if (d) setDraft(d);
            }}
          />
          <Button
            onPress={() => {
              setCustomOpen(false);
              commitCustom(draft);
            }}
          >
            Use this date
          </Button>
        </View>
      ) : null}

      {/* Android: date dialog (phase "date") → time dialog (phase "time") — mounted conditionally;
          each dialog fires onChange once (type "set" or "dismissed") and unmounts automatically. */}
      {allowCustom && androidPhase === "date" ? (
        <DateTimePicker
          value={draft}
          mode="date"
          display="default"
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={handleAndroidDateChange}
        />
      ) : null}
      {allowCustom && androidPhase === "time" ? (
        <DateTimePicker
          value={androidDatePart ?? draft}
          mode="time"
          display="default"
          onChange={handleAndroidTimeChange}
        />
      ) : null}

      <Text style={styles.note}>
        Anyone who opens the link before then can decrypt it once — only with the recipient's
        private key.
      </Text>
      <Button onPress={() => onConfirm(value)}>Confirm</Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.h2, color: colors.onSurface, marginBottom: 8 },
  list: { marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  rowLabel: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { ...type.body, color: colors.onSurface },
  iosPicker: { marginTop: 12, gap: 12 },
  note: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginVertical: 14,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.outline,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
});
