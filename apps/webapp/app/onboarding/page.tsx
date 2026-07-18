import { AppShell } from "@/src/app-shell/AppShell";
import { SetPassphraseScreen } from "@/src/screens/SetPassphraseScreen";

export default function OnboardingPage() {
  return (
    <AppShell>
      <SetPassphraseScreen />
    </AppShell>
  );
}
