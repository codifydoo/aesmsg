import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Icon } from "@/src/components";
import { colors, fonts } from "@/src/theme";

// 55 · Push-Permission Prompt (grp-system.jsx · S_PushPrompt). A centered bottom sheet that primes
// the OS notification permission BEFORE the system dialog: a violet notifications medallion, a warm
// headline, two benefit lines (emerald checks), the privacy reassurance, an "Enable notifications"
// primary, and a muted "Not now". Presentational — actually requesting the OS permission is the
// caller's job (onEnable), wired in Integration once the notifications native module lands.
//
// PRODUCT INVARIANT reinforced here: notifications carry the EVENT only, never message content. The
// reassurance line states that explicitly — consistent with the zero-knowledge model (the backend
// only ever holds ciphertext, so a push can only ever say *that* something happened).

const BENEFITS = ["Know the moment a link is opened", "A nudge before a link expires"];

export interface PushPermissionScreenProps {
  /** Sheet visibility (default true so it stands alone as a screen). */
  visible?: boolean;
  /** Request the OS notification permission. */
  onEnable?: (() => void) | undefined;
  /** Dismiss without enabling ("Not now" / scrim tap). */
  onDismiss?: (() => void) | undefined;
}

const noop = () => {};

export function PushPermissionScreen({
  visible = true,
  onEnable,
  onDismiss,
}: PushPermissionScreenProps) {
  return (
    <BottomSheet visible={visible} onClose={() => onDismiss?.()}>
      <View style={styles.medallion}>
        <Icon name="notifications" size={26} fill color={colors.primary} />
      </View>

      <Text style={styles.title} accessibilityRole="header">
        Stay in the loop, privately
      </Text>
      <Text style={styles.subtitle}>
        Get a heads-up when something happens to your secure links.
      </Text>

      <View style={styles.benefits}>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefitRow}>
            <Icon name="check" size={20} color={colors.emerald} />
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.privacyNote}>
        Notifications never include message content — only the event.
      </Text>

      <Button icon="notifications" onPress={onEnable ?? noop}>
        Enable notifications
      </Button>

      <Pressable onPress={onDismiss} accessibilityRole="button" style={styles.notNow} hitSlop={8}>
        <Text style={styles.notNowText}>Not now</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  medallion: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: colors.primaryContainer,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "500",
    letterSpacing: -0.24,
    color: colors.onSurface,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  benefits: { gap: 12, marginBottom: 14 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  benefitText: { flex: 1, fontSize: 15, lineHeight: 23, color: colors.onSurface },
  privacyNote: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginBottom: 16,
  },
  notNow: { alignSelf: "center", paddingVertical: 10, marginTop: 4 },
  notNowText: { color: colors.onSurfaceVariant, fontSize: 14, fontWeight: "500" },
});
