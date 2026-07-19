import { Suspense } from "react";
import { AppShell } from "@/src/app-shell/AppShell";
import { OnboardingScreen } from "@/src/screens/OnboardingScreen";

export default function OnboardingPage() {
  return (
    <AppShell>
      {/* Suspense is required around useSearchParams (the `?import=1` entry) under output:'export'. */}
      <Suspense>
        <OnboardingScreen />
      </Suspense>
    </AppShell>
  );
}
