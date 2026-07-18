import { useState } from "react";
import { type KeyboardTypeOptions, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Icon } from "@/src/components/Icon";
import { colors, fonts } from "@/src/theme";

// Field — single-line text input. Mirrors the design's input styling: surface-container-low bg,
// 1px outline-variant border, radius 10, ~13/14 padding. `eye` adds a visibility toggle that flips
// `secureTextEntry`; `mono` switches to the JetBrains-mono font (fingerprints / public keys /
// secure links only — never general UI text). Controlled via value + onChangeText.

export interface FieldProps {
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  secureTextEntry?: boolean;
  /** Show a visibility (eye) toggle button. Useful with secureTextEntry. */
  eye?: boolean;
  /** Use the monospace font (for fingerprints / public keys / secure links). */
  mono?: boolean;
  keyboardType?: KeyboardTypeOptions;
  /** Multi-line input (e.g. a pasted public key). */
  multiline?: boolean;
}

export function Field({
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  eye = false,
  mono = false,
  keyboardType,
  multiline = false,
}: FieldProps) {
  // When `eye` is on we own the masking so the toggle can reveal it; otherwise honor the prop.
  const [revealed, setRevealed] = useState(false);
  const masked = eye ? secureTextEntry && !revealed : secureTextEntry;

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceVariant}
        secureTextEntry={masked}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={mono ? "none" : undefined}
        autoCorrect={mono ? false : undefined}
        style={[
          styles.input,
          mono && styles.mono,
          eye && styles.inputWithEye,
          multiline && styles.multiline,
        ]}
      />
      {eye ? (
        <Pressable
          onPress={() => setRevealed((r) => !r)}
          accessibilityRole="button"
          accessibilityLabel={revealed ? "Hide" : "Show"}
          hitSlop={8}
          style={styles.eyeBtn}
        >
          <Icon
            name={revealed ? "visibility_off" : "visibility"}
            size={20}
            color={colors.onSurfaceVariant}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", justifyContent: "center" },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.onSurface,
  },
  inputWithEye: { paddingRight: 44 },
  mono: { fontFamily: fonts.mono, fontSize: 14, letterSpacing: 0.5 },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  eyeBtn: {
    position: "absolute",
    right: 6,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
