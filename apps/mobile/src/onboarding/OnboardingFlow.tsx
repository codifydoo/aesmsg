import { useState } from "react";
import { HowItWorksScreen } from "./HowItWorksScreen";
import { WelcomeCarouselScreen } from "./WelcomeCarouselScreen";

// OnboardingFlow — the first-run intro stack. It sequences the two pre-identity screens:
//
//   Welcome carousel (2) → How It Works (3) → onGetStarted()
//
// At the end of the intro it calls onGetStarted so the host can hand off to identity creation
// (Create Identity / GateScreens, which this agent does NOT own). "Restore from backup" on the
// Welcome screen fires onRestore at any point so the host can route to ImportBackupScreen (8).
//
// EnableBiometrics (6) and Permissions priming (7) are deliberately NOT in this stack: per the build
// brief they're post-setup and non-blocking. They're exported from the feature barrel so the
// Integration phase can sequence them after identity creation if it chooses. This keeps the intro a
// clean two-step that always ends by handing off control.

export interface OnboardingFlowProps {
  /** End of the intro stack → start identity creation (Create Identity). */
  onGetStarted: () => void;
  /** "Restore from backup" → route to Import Backup (screen 8). */
  onRestore: () => void;
}

type Step = "welcome" | "howItWorks";

export function OnboardingFlow({ onGetStarted, onRestore }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");

  if (step === "howItWorks") {
    // After the explainer, hand off to identity creation. (No back chrome — How It Works is a calm
    // single Continue, matching the design.)
    return <HowItWorksScreen onContinue={onGetStarted} />;
  }

  return (
    <WelcomeCarouselScreen
      // "Get started" on the final carousel slide advances to the explainer.
      onGetStarted={() => setStep("howItWorks")}
      // Skip jumps past the explainer straight to identity creation.
      onSkip={onGetStarted}
      onRestore={onRestore}
    />
  );
}

export default OnboardingFlow;
