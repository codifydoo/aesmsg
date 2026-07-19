"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ImportBackupScreen } from "./ImportBackupScreen";
import { SetPassphraseScreen } from "./SetPassphraseScreen";

// Onboarding chooser (D6): from `no_identity`, either CREATE a fresh identity (SetPassphraseScreen)
// or RESTORE from an encrypted backup (ImportBackupScreen). Both entry points reach the same
// `no_identity` state, so import can never overwrite an existing identity. `?import=1` (linked from
// the reader NoIdentityScreen) opens straight into the import path; otherwise create is the default.

export function OnboardingScreen() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"create" | "import">(
    searchParams.get("import") === "1" ? "import" : "create",
  );

  if (mode === "import") {
    return <ImportBackupScreen onBack={() => setMode("create")} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <SetPassphraseScreen />
      <button
        type="button"
        onClick={() => setMode("import")}
        className="flex h-12 w-full items-center justify-center rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
      >
        Import a backup instead
      </button>
    </div>
  );
}
