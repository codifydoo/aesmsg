import { AppShell } from "@/src/app-shell/AppShell";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import { AddContactScreen } from "@/src/screens/AddContactScreen";

// Static route (no id/query). Gated behind the unlocked app (D9/D10). Contacts are local-only.
export default function AddContactPage() {
  return (
    <RequireUnlocked>
      <AppShell>
        <AddContactScreen />
      </AppShell>
    </RequireUnlocked>
  );
}
