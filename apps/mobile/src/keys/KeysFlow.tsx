import {
  fingerprint as computeFingerprint,
  type IdentityKeypair,
  type PublicKeyString,
  truncateFingerprint,
} from "@aesmsg/crypto";
// SDK 56's default `expo-file-system` export is the new File/Paths API; the string-URI helpers this
// flow uses (writeAsStringAsync, deleteAsync) live on the `/legacy` subpath — see
// reader/ReaderScreen.tsx and onboarding/ImportBackupScreenIntegration.tsx for the same import.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { useIdentity } from "@/src/identity/use-identity";
import { performBiometricConfirmation } from "@/src/onboarding/biometric-onboarding";
import { ExportBackupScreen } from "./ExportBackupScreen";
import {
  buildBackup,
  shareBackup,
  type WriteAndShareDeps,
  type WrittenBackup,
  writeBackupToCache,
} from "./export-backup";
import { MyPublicKeyScreen } from "./MyPublicKeyScreen";
import { RotateKeyScreen } from "./RotateKeyScreen";
import { RotateSuccessScreen } from "./RotateSuccessScreen";

// KeysFlow — the Keys tab stack. Root is My Public Key (40); from there the user can push Export
// Encrypted Backup (41), Rotate Key (42), and pop back. A tiny local state machine keeps it
// presentational (no navigation dependency) and matches the in-file flow style used elsewhere.
//
// Key rotation (design screen 42) is WIRED here (roadmap 2.4 / PG-1): the confirm screen → the real
// rotate() action on the identity context (which runs the biometric unlock internally, reusing the
// single-prompt device-secret path — no extra native call) → generate a new active keypair, retire
// the old one, RETAIN the old private key for in-flight legacy links → success screen showing the NEW
// fingerprint for re-verification. rotate() returns the new public key so the success screen never
// depends on prop-update timing.
//
// KeyChangedAlertScreen (44) is NOT part of this stack — it's reached from contacts / a notification
// later — and WipeIdentityScreen (43) is the destructive wipe surfaced from Settings (and/or Keys).
// Both are re-exported below (and from the feature barrel) so Integration can route to them.
//
// Export backup is WIRED here (the only place with the unlocked IdentityKeypair): a fresh biometric
// gate → buildBackup (heavy passphrase wrap) → writeBackupToCache (ciphertext to cache) → success
// sheet → shareBackup (hand to the system share sheet). Write is split from share so the success
// sheet renders before the share sheet. The real expo natives are bridged to the pure module's DI
// surfaces with the same
// `as unknown as` pattern as ImportBackupScreenIntegration — the SDK types are wider than the minimal
// shapes the pure module declares; at runtime these are the same calls. The recovered/exported private
// key is never logged.

export interface KeysFlowProps {
  publicKeyString: PublicKeyString;
  /** The unlocked keypair, threaded from the identity context so Export can re-seal it under a
   *  passphrase. Held in memory only — never logged, never persisted in plaintext. */
  identity: IdentityKeypair;
}

const shareDeps = { FileSystem, Sharing } as unknown as WriteAndShareDeps;

type Route =
  | { kind: "publicKey" }
  | { kind: "exportBackup" }
  | { kind: "rotateConfirm" }
  | { kind: "rotateSuccess"; newPublicKey: PublicKeyString };

export default function KeysFlow({ publicKeyString, identity }: KeysFlowProps) {
  const { actions } = useIdentity();
  const [route, setRoute] = useState<Route>({ kind: "publicKey" });
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [rotating, setRotating] = useState(false);

  // The CURRENT (soon-to-be-retired) fingerprint, shown on the rotate-confirm screen so the user sees
  // exactly which key is being replaced. SHA-256-based and cheap; recomputed only when the key changes.
  const [currentFingerprint, setCurrentFingerprint] = useState("");
  useEffect(() => {
    let cancelled = false;
    computeFingerprint(publicKeyString)
      .then((f) => {
        if (!cancelled) setCurrentFingerprint(truncateFingerprint(f, 8));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicKeyString]);

  // Rotate: the identity context's rotate() runs the biometric unlock internally (single prompt,
  // reused native path) then generates + persists the new key crash-safely, returning the NEW public
  // key. On any rejection — biometric cancel/fail or a persist error — we simply stay on the confirm
  // screen; the identity is left untouched (rotate() is all-or-nothing).
  async function handleRotate() {
    if (rotating) return;
    setRotating(true);
    try {
      const newPublicKey = await actions.rotate();
      setRoute({ kind: "rotateSuccess", newPublicKey });
    } catch {
      // Stay on the confirm screen; nothing changed.
    } finally {
      setRotating(false);
    }
  }

  // Hold the written backup so its cache file can be cleaned up when the success sheet is dismissed
  // (the ciphertext file should not linger after the user is done sharing). track-before-share: the
  // cleanup hook is captured the moment the file is written, before the share sheet can reject.
  const writtenRef = useRef<WrittenBackup | null>(null);

  async function handleExport(passphrase: string) {
    if (exporting) return;
    // 1. Fresh biometric confirm (design screen 40). Any rejection/failure aborts silently — we
    //    never produce a backup without a confirmed unlock.
    try {
      await performBiometricConfirmation("Unlock to export your encrypted backup");
    } catch {
      return;
    }
    setExporting(true);
    try {
      // 2. Re-seal the unlocked identity under the user passphrase (heavy KDF, inside buildBackup).
      const backup = await buildBackup(identity, passphrase);
      // 3. Write the ciphertext to cache; track-before-share so an early unmount can reclaim it.
      const written = await writeBackupToCache(shareDeps, backup);
      writtenRef.current = written;
      // 4. Success sheet FIRST (design screen 41: success sheet slides up, then the share sheet),
      //    then present the system share sheet fire-and-forget so it never blocks that render.
      setExportDone(true);
      void shareBackup(shareDeps, written.uri);
    } finally {
      setExporting(false);
    }
  }

  function dismissExportDone() {
    setExportDone(false);
    // Wipe the written ciphertext cache file once the user dismisses the sheet — best-effort.
    const written = writtenRef.current;
    writtenRef.current = null;
    if (written) void written.cleanup();
  }

  if (route.kind === "exportBackup") {
    return (
      <ExportBackupScreen
        onBack={() => setRoute({ kind: "publicKey" })}
        onExport={(passphrase) => void handleExport(passphrase)}
        exporting={exporting}
        done={exportDone}
        onDismissDone={dismissExportDone}
      />
    );
  }

  if (route.kind === "rotateConfirm") {
    return (
      <RotateKeyScreen
        currentFingerprint={currentFingerprint}
        rotating={rotating}
        onRotate={() => void handleRotate()}
        onCancel={() => setRoute({ kind: "publicKey" })}
      />
    );
  }

  if (route.kind === "rotateSuccess") {
    return (
      <RotateSuccessScreen
        newPublicKey={route.newPublicKey}
        onDone={() => setRoute({ kind: "publicKey" })}
      />
    );
  }

  return (
    <MyPublicKeyScreen
      publicKeyString={publicKeyString}
      onExportBackup={() => setRoute({ kind: "exportBackup" })}
      onRotateKey={() => setRoute({ kind: "rotateConfirm" })}
    />
  );
}

export { KeyChangedAlertScreen } from "./KeyChangedAlertScreen";
export { WipeIdentityScreen } from "./WipeIdentityScreen";
