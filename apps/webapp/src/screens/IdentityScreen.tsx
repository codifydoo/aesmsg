"use client";

import { type Fingerprint, fingerprint, type PublicKeyString } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FingerprintBlock } from "@/src/components/FingerprintBlock";
import { QrCode } from "@/src/components/QrCode";
import { WipeConfirmDialog } from "@/src/components/WipeConfirmDialog";
import { WipeFailuresDialog } from "@/src/components/WipeFailuresDialog";
import { useIdentity } from "@/src/identity/use-identity";
import { useLocalWipe } from "@/src/settings/use-local-wipe";
import { ExportBackupScreen } from "./ExportBackupScreen";
import { RotateKeyScreen } from "./RotateKeyScreen";
import { RotateSuccessScreen } from "./RotateSuccessScreen";

type View = "main" | "rotate" | "rotate-success" | "export";

export function IdentityScreen() {
  const { state, publicKeyString, lock } = useIdentity();
  const router = useRouter();

  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [view, setView] = useState<View>("main");
  const [rotatedPublicKey, setRotatedPublicKey] = useState<PublicKeyString | null>(null);
  // Onboarding backup nudge (spec §11): calm, dismissible prompt to export a backup. Ephemeral — the
  // "dismissed" flag holds no key material and does not need to persist.
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  // Revoke-before-wipe: revokes still-live tracked links, then purges ALL local data (D10).
  const wipeFlow = useLocalWipe({ onWiped: () => router.replace("/onboarding") });

  // Only an unlocked identity belongs here; otherwise bounce to the gate, which re-routes by state.
  useEffect(() => {
    if (state !== "unlocked" && state !== "loading") router.replace("/");
  }, [state, router]);

  // Derive the real AM- fingerprint from the public key (D5 — ignore the mockup's legacy SM- value).
  useEffect(() => {
    if (publicKeyString === null) {
      setFp(null);
      return;
    }
    let cancelled = false;
    fingerprint(publicKeyString).then((value) => {
      if (!cancelled) setFp(value);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKeyString]);

  function handleWipe() {
    setConfirmOpen(false);
    // Revoke-before-wipe: any offline/server failures raise the acknowledgement gate before purging.
    wipeFlow.start();
  }

  if (state !== "unlocked" || publicKeyString === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-body-md text-on-surface-variant">Unlocking your identity…</p>
      </div>
    );
  }

  if (view === "rotate") {
    return (
      <RotateKeyScreen
        onRotated={(newPk) => {
          setRotatedPublicKey(newPk);
          setView("rotate-success");
        }}
        onCancel={() => setView("main")}
      />
    );
  }

  if (view === "rotate-success" && rotatedPublicKey !== null) {
    return (
      <RotateSuccessScreen
        newPublicKey={rotatedPublicKey}
        onDone={() => {
          setRotatedPublicKey(null);
          setView("main");
        }}
      />
    );
  }

  if (view === "export") {
    return <ExportBackupScreen onDone={() => setView("main")} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="font-display text-h1 text-on-surface">Digital identity</h1>
        <p className="mx-auto max-w-md text-body-md text-on-surface-variant">
          Share this public key so others can encrypt messages only your device can decrypt.
        </p>
      </header>

      {!nudgeDismissed ? (
        <div className="flex items-start gap-4 rounded-xl border border-primary/30 bg-primary-container/10 p-4">
          <div className="shrink-0 rounded-lg bg-primary-container/20 p-2 text-primary">
            <MaterialIcon name="cloud_download" size={20} />
          </div>
          <div className="flex-1 space-y-2">
            <h2 className="text-label-sm font-semibold text-on-surface">Back up your identity</h2>
            <p className="text-label-sm text-on-surface-variant">
              Export an encrypted backup so you can restore this identity if you lose this device.
              It's encrypted with your passphrase and never leaves your device unencrypted.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setView("export")}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-label-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
              >
                Export backup
              </button>
              <button
                type="button"
                onClick={() => setNudgeDismissed(true)}
                className="text-label-sm text-on-surface-variant transition-colors hover:text-on-surface"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="space-y-6 rounded-xl border border-outline-variant bg-surface-container p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-label-sm text-success">
            <MaterialIcon name="verified_user" size={16} />
            This device
          </span>
        </div>

        {/* Own-key QR (mobile parity with MyPublicKeyScreen): the payload is the raw amk1: public-key
            string (D1) — the exact value the "Copy public key" block exposes — so a mobile user can
            scan this to add your key. */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-fit rounded-xl bg-white p-3">
            <QrCode value={publicKeyString} />
          </div>
          <p className="text-center text-label-sm text-on-surface-variant">
            Let a contact scan this to add your key.
          </p>
        </div>

        {fp ? (
          <FingerprintBlock
            label="Public fingerprint"
            value={fp}
            copyLabel="Copy public fingerprint"
          />
        ) : (
          <p className="text-label-sm text-on-surface-variant">Deriving fingerprint…</p>
        )}

        <FingerprintBlock label="Public key" value={publicKeyString} copyLabel="Copy public key" />
      </section>

      <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <div className="shrink-0 rounded-lg bg-primary-container/20 p-2 text-primary">
          <MaterialIcon name="info" size={20} />
        </div>
        <div className="space-y-1">
          <h2 className="text-label-sm font-semibold text-on-surface">End-to-end encrypted</h2>
          <p className="text-label-sm text-on-surface-variant">
            Your private key never leaves this device. Only the public key above is visible to
            others.
          </p>
        </div>
      </div>

      {/* Key management — Rotate is AMBER (routine hygiene, not destructive); Export + Lock neutral. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => setView("rotate")}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-warning/40 bg-warning/10 font-medium text-warning transition-colors hover:bg-warning/20"
        >
          <MaterialIcon name="autorenew" size={20} />
          Rotate key
        </button>
        <button
          type="button"
          onClick={() => setView("export")}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
        >
          <MaterialIcon name="cloud_download" size={20} />
          Export backup
        </button>
      </div>

      <button
        type="button"
        onClick={lock}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
      >
        <MaterialIcon name="lock" size={20} />
        Lock identity
      </button>

      <section className="space-y-3 rounded-xl border border-error/20 bg-error-container/10 p-6">
        <h2 className="font-display text-h2 text-error">Danger zone</h2>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-label-sm font-semibold text-on-surface">Wipe private key</p>
            <p className="text-label-sm text-on-surface-variant">
              Permanently delete this identity from this device. Every message encrypted to it will
              be lost forever.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="h-12 shrink-0 rounded-lg bg-error px-6 font-semibold text-on-error transition-colors hover:bg-error/90"
          >
            Wipe private key
          </button>
        </div>
      </section>

      <WipeConfirmDialog
        open={confirmOpen}
        busy={wipeFlow.busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleWipe}
      />

      {wipeFlow.pendingFailures !== null ? (
        <WipeFailuresDialog
          failures={wipeFlow.pendingFailures}
          busy={wipeFlow.busy}
          onProceed={wipeFlow.proceedAnyway}
          onCancel={wipeFlow.cancelFailures}
        />
      ) : null}
    </div>
  );
}
