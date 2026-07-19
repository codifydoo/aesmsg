import { AppShell } from "@/src/app-shell/AppShell";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import { ContactsListScreen } from "@/src/screens/ContactsListScreen";

// Contacts live behind the unlocked app (D10): consistent with every other AppShell surface, and the
// compose picker that consumes them already requires unlock. Contacts hold no secrets and never reach
// the server — they are local-only IndexedDB records.
export default function ContactsPage() {
  return (
    <RequireUnlocked>
      <AppShell>
        <ContactsListScreen />
      </AppShell>
    </RequireUnlocked>
  );
}
