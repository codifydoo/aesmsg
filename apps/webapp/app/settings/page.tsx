import { AppShell } from "@/src/app-shell/AppShell";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import { SecuritySettingsScreen } from "@/src/screens/SecuritySettingsScreen";

export default function SettingsPage() {
  return (
    <RequireUnlocked>
      <AppShell>
        <SecuritySettingsScreen />
      </AppShell>
    </RequireUnlocked>
  );
}
