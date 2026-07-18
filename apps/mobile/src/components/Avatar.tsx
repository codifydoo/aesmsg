import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { deriveInitials } from "@/src/components/initials";
import { colors, fonts } from "@/src/theme";

// Avatar — initials circle. Mirrors the design's `.avatar` (aesmsg.css): round, primary-container
// bg, on-primary-container text, Geist 600. Default size 44 with text scaled proportionally. The
// `initials` prop may be a raw name or already-short initials; deriveInitials normalizes either to
// at most 2 uppercase letters (and never empty).

export interface AvatarProps {
  initials: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ initials, size = 44, style }: AvatarProps) {
  const text = deriveInitials(initials);
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={[styles.text, { fontSize: Math.round(size * 0.36) }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: fonts.display,
    fontWeight: "600",
    color: colors.onPrimaryContainer,
  },
});
