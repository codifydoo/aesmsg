import { AppShell } from "@/src/app-shell/AppShell";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import { LinksListScreen } from "@/src/screens/LinksListScreen";

export default function LinksPage() {
  return (
    <RequireUnlocked>
      <AppShell>
        <LinksListScreen />
      </AppShell>
    </RequireUnlocked>
  );
}
