import { useEffect, useState } from "react";
import * as notifications from "@/src/notifications/notifications";
import { loadNotificationPrefs, updateNotificationPrefs } from "@/src/notifications/prefs";
import { shouldPrimeNotifications } from "@/src/notifications/prime-decision";
import { PushPermissionScreen } from "@/src/system";

// Shows the soft permission-priming sheet (PushPermissionScreen) at most once. Mount it where a
// prime is appropriate (after a link is created). It self-gates: it only appears when the OS
// permission is still undetermined AND we have not primed before (persisted flag), so re-mounting
// on later creates is a no-op. Enabling or dismissing both mark it primed.
export function NotificationPrimer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prefs = await loadNotificationPrefs();
      const permission = await notifications.getPermissionStatus();
      if (
        !cancelled &&
        shouldPrimeNotifications({ permission, alreadyPrimed: prefs.permissionPrimed })
      ) {
        setVisible(true);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function finish() {
    setVisible(false);
    await updateNotificationPrefs({ permissionPrimed: true }).catch(() => {});
  }

  return (
    <PushPermissionScreen
      visible={visible}
      onEnable={() => {
        void notifications.requestPermission().finally(() => void finish());
      }}
      onDismiss={() => void finish()}
    />
  );
}
