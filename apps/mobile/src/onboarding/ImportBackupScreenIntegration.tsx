import type { IdentityKeypair } from "@aesmsg/crypto";
import * as DocumentPicker from "expo-document-picker";
// SDK 56's default `expo-file-system` export is the new File/Paths API; the string-URI helpers this
// integration uses (readAsStringAsync, EncodingType) live on the `/legacy` subpath — see
// reader/ReaderScreen.tsx and storage/file-blob-store.ts for the same import.
import * as FileSystem from "expo-file-system/legacy";
import { useState } from "react";
import {
  type ImportBackupError,
  ImportBackupScreen,
  type SelectedBackup,
} from "./ImportBackupScreen";
import {
  formatBackupSize,
  type PickBackupDeps,
  type PickedBackup,
  pickBackupFile,
  type ReadBackupDeps,
  readBackupFile,
  restoreIdentity,
} from "./import-backup";

// The real expo modules are bridged to the DI surfaces with `as unknown as` exactly as
// AttachmentPickerSheet.tsx does: the SDK's narrow `ReadingOptions.encoding` /
// `DocumentPickerOptions` types are wider than the minimal `{ encoding: string }` shapes our pure
// module declares, and the structural mismatch is only at the type level — at runtime these are the
// same calls. Built once at module scope so the component body stays free of casts.
const readDeps = { FileSystem } as unknown as ReadBackupDeps;
const pickDeps = { DocumentPicker } as unknown as PickBackupDeps;

// ImportBackupScreenIntegration — the wired half of Restore Identity (screen 8). The presentational
// ImportBackupScreen stays untouched; this wrapper owns the real document picker, the on-device
// decrypt, and the hand-off to the identity machine.
//
// Flow: pickBackupFile (real expo-document-picker) → readBackupFile (real expo-file-system/legacy,
// UTF-8) → restoreIdentity (real @aesmsg/crypto argon2id unwrap). On ok we call importIdentity, which
// re-wraps the recovered key under the device secret and transitions the machine to `unlocked` — the
// app then lands on Home naturally, so there is no success screen to render here. On bad-passphrase /
// invalid-file we surface the design's terminal inline error (one field shake, no recovery).
//
// The recovered private key is never logged. We hold the picked URI only long enough to read +
// decrypt; the keypair is handed straight to importIdentity.

export interface ImportBackupScreenIntegrationProps {
  /** Back to the onboarding intro. */
  onBack: () => void;
  /** Persist + unlock the restored identity. Wired from the identity context (actions.importIdentity). */
  importIdentity: (identity: IdentityKeypair) => Promise<void>;
}

export function ImportBackupScreenIntegration({
  onBack,
  importIdentity,
}: ImportBackupScreenIntegrationProps) {
  const [picked, setPicked] = useState<PickedBackup | null>(null);
  const [error, setError] = useState<ImportBackupError | null>(null);
  // Bumped on every failed attempt so a repeated wrong passphrase re-triggers the screen's shake.
  const [errorNonce, setErrorNonce] = useState(0);
  const [busy, setBusy] = useState(false);

  const selectedFile: SelectedBackup | null = picked
    ? { name: picked.name, size: formatBackupSize(picked.size) }
    : null;

  async function handlePickFile() {
    // A picker rejection is non-fatal: leave any prior selection in place. Clear a stale error so the
    // user starts the new attempt clean.
    try {
      const result = await pickBackupFile(pickDeps);
      if (result) {
        setPicked(result);
        setError(null);
      }
    } catch {
      // Swallow — picker/platform errors are non-destructive; the user can tap to retry.
    }
  }

  async function handleRestore(passphrase: string) {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const contents = await readBackupFile(readDeps, picked.uri);
      const result = await restoreIdentity(contents, passphrase);
      if (result.ok) {
        // Machine goes unlocked → Root re-renders into the shell. Keep `busy` true through the
        // transition so the CTA never flashes back to "Restore".
        await importIdentity(result.identity);
        return;
      }
      setError(result.reason);
      setErrorNonce((n) => n + 1);
    } catch {
      // A failed file read (unreadable URI) is treated as an invalid backup — never crash.
      setError("invalid-file");
      setErrorNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ImportBackupScreen
      onBack={onBack}
      onPickFile={() => void handlePickFile()}
      onRestore={(passphrase) => void handleRestore(passphrase)}
      selectedFile={selectedFile}
      error={error}
      errorNonce={errorNonce}
      busy={busy}
    />
  );
}

export default ImportBackupScreenIntegration;
