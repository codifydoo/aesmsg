// Keys feature barrel. Screens 40 (My Public Key), 41 (Export Backup), 42 (Rotate Key + success),
// 43 (Wipe Identity), 44 (Key-Changed Alert).
// KeysFlow wires the in-tab stack (40 → 41 / 42). Key rotation (design screen 42) is now REAL
// (roadmap 2.4 / PG-1): generate a new active keypair, retire the old one, and retain the old key for
// in-flight legacy links. The Key-Changed Alert (44) is reached from contacts / a notification, and
// the destructive Wipe Identity (43) is surfaced from Settings (and/or Keys) — both are exported here
// so Integration can route to them.

// Backup-state: the persisted "has this identity ever been backed up?" flag + the onboarding-nudge /
// reminder decisions (pure, unit-tested). The React binding lives in ./use-backup-state.
export {
  BACKUP_STATE_BLOB_KEY,
  type BackupState,
  DEFAULT_BACKUP_STATE,
  loadBackupState,
  markBackedUp,
  markNudgeSeen,
  normalizeBackupState,
  shouldShowBackupNudge,
  shouldShowBackupReminder,
  withBackedUp,
  withNudgeSeen,
} from "./backup-state";
export { ExportBackupScreen, type ExportBackupScreenProps } from "./ExportBackupScreen";
// Pure + DI export/backup module (unit-tested co-located).
export {
  BACKUP_FILENAME,
  type BackupFile,
  buildBackup,
  type FileSystemLike as ExportFileSystemLike,
  type SharingLike as ExportSharingLike,
  shareBackup,
  type WriteAndShareDeps,
  type WrittenBackup,
  writeBackupToCache,
} from "./export-backup";
// Pure helpers (unit-tested co-located).
export { formatFingerprintLines } from "./fingerprint-lines";
export {
  KeyChangedAlertScreen,
  type KeyChangedAlertScreenProps,
} from "./KeyChangedAlertScreen";
export { KeyQrCode, type KeyQrCodeProps } from "./KeyQrCode";
export { default as KeysFlow, type KeysFlowProps } from "./KeysFlow";
export { MyPublicKeyScreen, type MyPublicKeyScreenProps } from "./MyPublicKeyScreen";
export {
  evaluatePassphrase,
  MIN_PASSPHRASE_LENGTH,
  type PassphraseRequirement,
  type PassphraseStrength,
  scorePassphrase,
} from "./passphrase-strength";
export { RotateKeyScreen, type RotateKeyScreenProps } from "./RotateKeyScreen";
export { RotateSuccessScreen, type RotateSuccessScreenProps } from "./RotateSuccessScreen";
export { WipeIdentityScreen, type WipeIdentityScreenProps } from "./WipeIdentityScreen";
export { matchesWipeConfirm, WIPE_CONFIRM_WORD } from "./wipe-confirm";
