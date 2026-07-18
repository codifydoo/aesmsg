import type { ReactNode } from "react";
import { Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from "react-native";
import { Icon } from "@/src/components/Icon";
import { colors, radii } from "@/src/theme";

// Button — primary action button. Mirrors the design's `.btn` family (aesmsg.css):
//   full-width, minHeight 56, radius md, Geist 17/600, centered, icon+label gap 10, active
//   scale 0.975.
//     primary  → primary bg / on-primary text + a soft violet glow (box-shadow rgba(207,188,255,.45))
//     outline  → transparent + 1px outline-variant border, on-surface text
//     ghost    → transparent, on-surface-variant text, surface-container pressed wash
//     danger   → error-container bg / on-error-container text (destructive ONLY — revoke/delete/wipe)
//
// The design's primary glow is an RN shadow; on Android it maps to elevation. Icons use the filled
// variant and inherit the button's foreground color.

export type ButtonKind = "primary" | "ghost" | "outline" | "danger";

export interface ButtonProps {
  kind?: ButtonKind;
  icon?: string;
  onPress?: () => void;
  disabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const FG: Record<ButtonKind, string> = {
  primary: colors.onPrimary,
  ghost: colors.onSurfaceVariant,
  outline: colors.onSurface,
  danger: colors.onErrorContainer,
};

export function Button({
  kind = "primary",
  icon,
  onPress,
  disabled = false,
  children,
  style,
}: ButtonProps) {
  const fg = FG[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        styles[kind],
        pressed && !disabled && styles.pressed,
        kind === "ghost" && pressed && !disabled && styles.ghostPressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={20} fill color={fg} /> : null}
      <Text style={[styles.label, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: "100%",
    minHeight: 56,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 17,
    fontWeight: "600",
  },
  primary: {
    backgroundColor: colors.primary,
    // soft violet glow — box-shadow: 0 0 24px -8px rgba(207,188,255,.45)
    shadowColor: colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  danger: {
    backgroundColor: colors.errorContainer,
  },
  pressed: {
    transform: [{ scale: 0.975 }],
  },
  ghostPressed: {
    backgroundColor: colors.surfaceContainer,
  },
  disabled: {
    opacity: 0.4,
  },
});
