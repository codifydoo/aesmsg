import { Suspense } from "react";
import { AppShell } from "@/src/app-shell/AppShell";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import { ContactDetailScreen } from "@/src/screens/ContactDetailScreen";

// Static route that reads its target contact id from `?id=` (useSearchParams under Suspense), NOT a
// dynamic `[id]` segment — Next 16 `output: 'export'` rejects a dynamic route with an empty
// generateStaticParams (SP3 precedent). The `contactId` is a LOCAL UUID that never reaches the server;
// contacts are local-only, so there are no contact API calls at all. Gated behind the unlocked app.
export default function ContactDetailPage() {
  return (
    <RequireUnlocked>
      <AppShell>
        <Suspense>
          <ContactDetailScreen />
        </Suspense>
      </AppShell>
    </RequireUnlocked>
  );
}
