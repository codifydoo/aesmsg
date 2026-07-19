import { AppShell } from "@/src/app-shell/AppShell";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import { ComposeScreen } from "@/src/screens/ComposeScreen";

export default function NewMessagePage() {
  return (
    <RequireUnlocked>
      <AppShell>
        <ComposeScreen />
      </AppShell>
    </RequireUnlocked>
  );
}
