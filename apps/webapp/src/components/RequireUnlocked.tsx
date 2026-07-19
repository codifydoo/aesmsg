"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useIdentity } from "@/src/identity/use-identity";

/**
 * Client gate for the identity-gated sender routes (/new, /links, /links/[id]). Reads the identity
 * state machine and:
 *  - `loading`     → a calm "Loading your workspace…" panel (matches app/page.tsx copy);
 *  - `no_identity` → redirect to /onboarding;
 *  - `locked`      → redirect to /unlock;
 *  - `unlocked`    → render `children`.
 * A static export can only redirect client-side (useRouter), exactly like the home gate. Pages wrap
 * the routed screen as `<RequireUnlocked><AppShell>…</AppShell></RequireUnlocked>`.
 */
export function RequireUnlocked({ children }: { children: React.ReactNode }) {
  const { state } = useIdentity();
  const router = useRouter();

  useEffect(() => {
    if (state === "no_identity") router.replace("/onboarding");
    else if (state === "locked") router.replace("/unlock");
  }, [state, router]);

  if (state === "unlocked") return <>{children}</>;

  // loading, or mid-redirect for no_identity/locked: a transient placeholder while we resolve.
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <p className="text-body-md text-on-surface-variant">Loading your workspace…</p>
    </div>
  );
}
