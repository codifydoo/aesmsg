// Onboarding feature barrel. First-run screens 2, 3, 6, 7, 8 (Create Identity 4 + Unlock 5 already
// live in src/keys/GateScreens.tsx and are NOT rebuilt here).
//
// The intro stack (OnboardingFlow) sequences Welcome → How It Works → onGetStarted. The individual
// screens are exported too so the Integration phase can sequence EnableBiometrics / Permissions
// post-setup, and route to Import Backup from "Restore from backup".

export { BackupNudgeSheet, type BackupNudgeSheetProps } from "./BackupNudgeSheet";
export {
  type BiometricCapability,
  BiometricConfirmationRejectedError,
  type BiometricOnboardingState,
  checkBiometricCapability,
  getBiometricOnboardingState,
  performBiometricConfirmation,
} from "./biometric-onboarding";
export {
  clampSlideIndex,
  isLastSlide,
  nextSlide,
  prevSlide,
  WELCOME_CHANNELS,
  WELCOME_SLIDES,
  type WelcomeSlide,
} from "./carousel";
export {
  EnableBiometricsScreen,
  type EnableBiometricsScreenProps,
} from "./EnableBiometricsScreen";
export {
  EnableBiometricsScreenIntegration,
  type EnableBiometricsScreenIntegrationProps,
} from "./EnableBiometricsScreenIntegration";
export { HowItWorksScreen, type HowItWorksScreenProps } from "./HowItWorksScreen";
export {
  type ImportBackupError,
  ImportBackupScreen,
  type ImportBackupScreenProps,
  type SelectedBackup,
} from "./ImportBackupScreen";
export {
  ImportBackupScreenIntegration,
  type ImportBackupScreenIntegrationProps,
} from "./ImportBackupScreenIntegration";
export {
  type DocumentPickerLike,
  type FileSystemLike,
  formatBackupSize,
  type PickBackupDeps,
  type PickedBackup,
  pickBackupFile,
  type ReadBackupDeps,
  type RestoreResult,
  readBackupFile,
  restoreIdentity,
} from "./import-backup";
export { OnboardingFlow, type OnboardingFlowProps } from "./OnboardingFlow";
export {
  PermissionsPrimingScreen,
  type PermissionsPrimingScreenProps,
} from "./PermissionsPrimingScreen";
export {
  WelcomeCarouselScreen,
  type WelcomeCarouselScreenProps,
} from "./WelcomeCarouselScreen";
