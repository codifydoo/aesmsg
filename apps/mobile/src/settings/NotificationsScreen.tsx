import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppBar, Icon, ListGroup, ListRow, Screen, SectionLabel } from "@/src/components";
import {
  DEFAULT_PREFS,
  loadNotificationPrefs,
  type NotificationPrefs,
  updateNotificationPrefs,
} from "@/src/notifications/prefs";
import { SwitchRow } from "@/src/settings/SwitchRow";
import { colors, radii } from "@/src/theme";

// 49 · Notifications Settings. Loads persisted preferences and writes each change back. Only
// "Expiring soon" is functional this round (it gates the on-device reminder scheduled at create
// time). "Link opened" and "Contact key changed" need the deferred remote-push / contact-verify
// work, so they render disabled with an "Available soon" label (their value is still persisted).
// Quiet hours IS enforced: an "expiring soon" reminder that would fire inside the window is
// suppressed (see notifications/quiet-hours.ts).

export interface NotificationsScreenProps {
  onBack?: (() => void) | undefined;
  onOpenQuietFrom?: (() => void) | undefined;
  onOpenQuietTo?: (() => void) | undefined;
}

const noop = () => {};

export function NotificationsScreen({
  onBack,
  onOpenQuietFrom,
  onOpenQuietTo,
}: NotificationsScreenProps) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;
    void loadNotificationPrefs()
      .then((p) => {
        if (!cancelled) setPrefs(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic local update + best-effort persist.
  function set(patch: Partial<NotificationPrefs>) {
    setPrefs((current) => ({ ...current, ...patch }));
    void updateNotificationPrefs(patch).catch(() => {});
  }

  // Nested-aware variant for quietHours: merges the partial patch into the existing nested
  // object both locally and on persist, mirroring updateNotificationPrefs's nested merge.
  function setQuietHours(patch: Partial<NotificationPrefs["quietHours"]>) {
    setPrefs((current) => ({ ...current, quietHours: { ...current.quietHours, ...patch } }));
    void updateNotificationPrefs({ quietHours: patch }).catch(() => {});
  }

  return (
    <Screen topInset={false}>
      <AppBar title="Notifications" onLeading={onBack ?? noop} />

      <View style={styles.stack}>
        <View style={styles.infoCard}>
          <Icon name="info" size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            Notifications never include message content — only that something happened.
          </Text>
        </View>

        <View>
          <SectionLabel>Alerts</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="visibility"
              title="Link opened"
              sub="When a recipient opens one of your links."
              value={prefs.linkOpened}
              disabled
            />
            <SwitchRow
              icon="schedule"
              title="Expiring soon"
              sub="An hour before a link expires."
              value={prefs.expiringSoon}
              onValueChange={(v) => set({ expiringSoon: v })}
            />
            <SwitchRow
              icon="key"
              title="Contact key changed"
              sub="When a verified contact's fingerprint changes."
              value={prefs.keyChanged}
              disabled
            />
          </ListGroup>
        </View>

        <View>
          <SectionLabel>Quiet hours</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="dark_mode"
              title="Quiet hours"
              sub="Silence alerts during this window."
              value={prefs.quietHours.enabled}
              onValueChange={(v) => setQuietHours({ enabled: v })}
            />
            <ListRow
              title="From"
              value={prefs.quietHours.from}
              trailing={null}
              onPress={onOpenQuietFrom ?? noop}
            />
            <ListRow
              title="To"
              value={prefs.quietHours.to}
              trailing={null}
              onPress={onOpenQuietTo ?? noop}
            />
          </ListGroup>
          <Text style={styles.note}>
            An expiring-soon reminder that would fire during this window is held back.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    padding: 16,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
  note: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 8, paddingHorizontal: 4 },
});
