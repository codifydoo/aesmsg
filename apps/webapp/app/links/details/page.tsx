import { Suspense } from "react";
import { AppShell } from "@/src/app-shell/AppShell";
import { RequireUnlocked } from "@/src/components/RequireUnlocked";
import { LinkDetailsScreen } from "@/src/screens/LinkDetailsScreen";

// Link details is a STATIC route that reads its target id from the `?id=` query string client-side
// (useSearchParams), not a dynamic `[id]` segment. Rationale: this app is a full static export
// (`output: 'export'`), where Next 16 rejects a dynamic route with an empty generateStaticParams and
// a pre-rendered `[id]` cannot serve an arbitrary id from a static host without catch-all rewrites. A
// single static `/links/details` page renders for ANY id via client-side navigation and direct load
// alike. The id is a PUBLIC pointer (it is literally the `/l/<id>` shareable link) — never a secret —
// and it reaches the server only through the explicit /list and /revoke calls the user triggers.
export default function LinkDetailsPage() {
  return (
    <RequireUnlocked>
      <AppShell>
        <Suspense>
          <LinkDetailsScreen />
        </Suspense>
      </AppShell>
    </RequireUnlocked>
  );
}
