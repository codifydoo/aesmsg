"use client";

import { type Fingerprint, fingerprint } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FingerprintBlock } from "@/src/components/FingerprintBlock";
import { QrCode } from "@/src/components/QrCode";
import { WipeConfirmDialog } from "@/src/components/WipeConfirmDialog";
import { useIdentity } from "@/src/identity/use-identity";

export function IdentityScreen() {
  const { state, publicKeyString, lock, wipe } = useIdentity();
  const router = useRouter();

  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

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

  async function handleWipe() {
    setWiping(true);
    await wipe();
    setWiping(false);
    setConfirmOpen(false);
    router.replace("/onboarding");
  }

  if (state !== "unlocked" || publicKeyString === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-body-md text-on-surface-variant">Unlocking your identity…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="font-display text-h1 text-on-surface">Digital identity</h1>
        <p className="mx-auto max-w-md text-body-md text-on-surface-variant">
          Share this public key so others can encrypt messages only your device can decrypt.
        </p>
      </header>

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
        busy={wiping}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleWipe}
      />
    </div>
  );
}
