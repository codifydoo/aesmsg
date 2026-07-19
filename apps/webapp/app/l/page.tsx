import { Suspense } from "react";
import { ReaderFlowScreen } from "@/src/screens/reader/ReaderFlowScreen";

// The recipient reader is a STATIC route at `/l`. Under `output: 'export'` a dynamic `[id]` segment
// cannot build (SP2 hit this), so the id is NOT in the route — the client reads it from the URL:
// production serves this same `l.html` for `/l/<id>` via a host rewrite (docs/deploy.md) and the
// client parses the id from `location.pathname`; dev uses `/l?id=<id>` (useSearchParams). The
// <Suspense> boundary is REQUIRED around useSearchParams under static export (mirrors
// app/links/details/page.tsx).
//
// Deliberately NOT wrapped in RequireUnlocked and NOT in AppShell (D5): a recipient may have no
// identity at all, and the reader is a single-purpose full-screen surface — showing the sender's
// workspace chrome to a bare recipient is wrong. Identity is handled inline by the flow.
export default function ReaderPage() {
  return (
    <Suspense>
      <ReaderFlowScreen />
    </Suspense>
  );
}
