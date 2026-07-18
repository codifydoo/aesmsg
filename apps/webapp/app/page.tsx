"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/src/app-shell/AppShell";
import { useIdentity } from "@/src/identity/use-identity";

// In SP1 the home route is an identity gate, not a dashboard: it reads the client-only identity
// state (from IndexedDB) and redirects. Because identity state is known only in the browser, the
// redirect is client-side (useRouter) — which is also all a static export can do.
const DESTINATION = {
  no_identity: "/onboarding",
  locked: "/unlock",
  unlocked: "/identity",
} as const;

export default function HomePage() {
  const { state } = useIdentity();
  const router = useRouter();

  useEffect(() => {
    if (state === "loading") return;
    router.replace(DESTINATION[state]);
  }, [state, router]);

  return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-body-md text-on-surface-variant">Loading your workspace…</p>
      </div>
    </AppShell>
  );
}
