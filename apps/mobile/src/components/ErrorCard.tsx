import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { radii } from "@/src/theme";

// ErrorCard — red-tinted card for destructive / failed states (decryption failed, revoke
// confirmation, wipe). Mirrors the design's `.errorcard` (aesmsg.css): error-container
// (--error-container #93000a) at 16% bg, error (--error #ffb4ab) at 28% border, radius lg, padding
// 16. Red is destructive ONLY — never use it for ambient or merely-unverified states (use
// CautionCard's amber for those).

export interface ErrorCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ErrorCard({ children, style }: ErrorCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(147,0,10,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,180,171,0.28)",
    borderRadius: radii.lg,
    padding: 16,
  },
});
