"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PasswordField } from "@/src/components/PasswordField";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { assessPassphrase } from "@/src/identity/passphrase-strength";
import { useIdentity } from "@/src/identity/use-identity";

function StrengthMeter({ score, label }: { score: number; label: string }) {
  // Ambient state — never red (red is destructive-only). Neutral → amber (caution) → green (safe).
  const tone = score >= 3 ? "bg-success" : score >= 1 ? "bg-warning" : "bg-outline-variant";
  const textTone =
    score >= 3 ? "text-success" : score >= 1 ? "text-warning" : "text-on-surface-variant";
  return (
    <div className="space-y-2">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < score ? tone : "bg-surface-container-high"}`}
          />
        ))}
      </div>
      <p className={`text-label-sm ${textTone}`} aria-live="polite">
        Passphrase strength: {label}
      </p>
    </div>
  );
}

export function SetPassphraseScreen() {
  const { setupNew } = useIdentity();
  const router = useRouter();

  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const assessment = useMemo(() => assessPassphrase(passphrase), [passphrase]);
  const mismatch = confirmTouched && confirm.length > 0 && confirm !== passphrase;
  const canSubmit =
    assessment.acceptable && passphrase === confirm && confirm.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await setupNew(passphrase);
      router.replace("/identity");
    } catch {
      setFormError("Something went wrong creating your identity. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="font-display text-h1 text-on-surface">Create your identity</h1>
        <p className="text-body-md text-on-surface-variant">
          Choose a passphrase. Your private key is wrapped with it on this device — we never see it.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-outline-variant bg-surface-container p-6"
      >
        <PasswordField
          label="Passphrase"
          value={passphrase}
          onChange={setPassphrase}
          placeholder="At least 12 characters"
          autoComplete="new-password"
        />
        {passphrase.length > 0 ? (
          <StrengthMeter score={assessment.score} label={assessment.label} />
        ) : null}
        {assessment.tips.length > 0 && passphrase.length > 0 ? (
          <ul className="space-y-1">
            {assessment.tips.map((tip) => (
              <li key={tip} className="text-label-sm text-on-surface-variant">
                {tip}
              </li>
            ))}
          </ul>
        ) : null}

        <PasswordField
          label="Confirm passphrase"
          value={confirm}
          onChange={setConfirm}
          onBlur={() => setConfirmTouched(true)}
          error={mismatch ? "Passphrases don't match." : undefined}
          autoComplete="new-password"
        />

        {formError ? <p className="text-label-sm text-error">{formError}</p> : null}

        <PrimaryButton type="submit" icon="vpn_key" loading={submitting} disabled={!canSubmit}>
          Create identity
        </PrimaryButton>
      </form>

      <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <div className="shrink-0 rounded-lg bg-primary-container/20 p-2 text-primary">
          <MaterialIcon name="info" size={20} />
        </div>
        <div className="space-y-1">
          <h2 className="text-label-sm font-semibold text-on-surface">No recovery by design</h2>
          <p className="text-label-sm text-on-surface-variant">
            If you forget this passphrase, this identity cannot be recovered — there is no reset
            link and no backdoor. Keep it somewhere safe.
          </p>
          <p className="text-label-sm text-on-surface-variant">
            Your passphrase derives the key that wraps your private key locally (Argon2id).
          </p>
        </div>
      </div>

      <p className="text-center text-label-sm text-on-surface-variant">
        Encrypted backup export arrives in a later release.
      </p>
    </div>
  );
}
