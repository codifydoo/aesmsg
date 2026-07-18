import { AppShell } from "@/src/app-shell/AppShell";
import { Placeholder } from "@/src/app-shell/Placeholder";

export default function SettingsPage() {
  return (
    <AppShell>
      <Placeholder
        icon="settings"
        title="Security settings"
        body="Security settings and key management for the web client land in a later release. For the full flow today, use the aesmsg app."
      />
    </AppShell>
  );
}
