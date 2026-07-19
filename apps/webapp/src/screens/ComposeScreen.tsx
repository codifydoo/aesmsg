"use client";

import type { Fingerprint } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useEffect, useState } from "react";
import { type ApiErrorKind, classifyApiError } from "@/src/api/client";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import {
  DEFAULT_EXPIRY,
  DEFAULT_MAX_OPENS,
  EXPIRY_PRESETS,
  type ExpiryChoice,
  expiryToDate,
  MAX_OPENS_OPTIONS,
  type MaxOpensChoice,
  validateCustomExpiry,
} from "@/src/create/compose-options";
import { createAndSeal } from "@/src/create/create-and-seal";
import { type RecipientValidation, validateRecipientKey } from "@/src/create/recipient";
import { LinkCreatedScreen } from "@/src/screens/LinkCreatedScreen";

// Map an error bucket to calm, leak-free copy (never surfaces server internals).
const ERROR_COPY: Record<ApiErrorKind, string> = {
  network: "Couldn't reach the server. Check your connection and try again.",
  rate_limited: "Too many links created just now. Wait a moment, then try again.",
  invalid: "The server rejected this message. Double-check the expiry and try again.",
  conflict: "Something went wrong creating the link. Please try again.",
  server: "Something went wrong on our end. Try again in a moment.",
  not_found: "Couldn't create the link. Try again.",
  gone: "Couldn't create the link. Try again.",
  unknown: "Couldn't create the link. Try again.",
};

interface CreatedLink {
  url: string;
  recipientFingerprint: Fingerprint;
  expiryLabel: string;
  maxOpensLabel: string;
}

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-lg border px-4 py-3 text-left text-body-md transition-colors ${
        selected
          ? "border-primary bg-primary-container/15 text-on-surface"
          : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high"
      }`}
    >
      {children}
    </button>
  );
}

export function ComposeScreen() {
  const [recipientInput, setRecipientInput] = useState("");
  const [recipient, setRecipient] = useState<RecipientValidation | null>(null);
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("");
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [customDate, setCustomDate] = useState("");
  const [maxOpens, setMaxOpens] = useState<MaxOpensChoice>(DEFAULT_MAX_OPENS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiErrorKind | null>(null);
  const [created, setCreated] = useState<CreatedLink | null>(null);

  // Validate the pasted recipient key as it changes (crypto runs locally; a race guard drops stale
  // results). An empty field clears the validation without an error.
  useEffect(() => {
    const trimmed = recipientInput.trim();
    if (trimmed.length === 0) {
      setRecipient(null);
      return;
    }
    let cancelled = false;
    void validateRecipientKey(trimmed).then((result) => {
      if (!cancelled) setRecipient(result);
    });
    return () => {
      cancelled = true;
    };
  }, [recipientInput]);

  const customCheck =
    expiryChoice === "custom" && customDate
      ? validateCustomExpiry(new Date(customDate), new Date())
      : null;
  const expiryValid = expiryChoice !== "custom" || (customCheck?.ok ?? false);
  const canSubmit = recipient?.ok === true && expiryValid && !submitting;

  const expiryLabel = EXPIRY_PRESETS.find((p) => p.value === expiryChoice)?.label ?? "";
  const maxOpensLabel = MAX_OPENS_OPTIONS.find((o) => o.value === maxOpens)?.label ?? "";

  function resetForm() {
    setCreated(null);
    setRecipientInput("");
    setRecipient(null);
    setMessage("");
    setLabel("");
    setExpiryChoice(DEFAULT_EXPIRY);
    setCustomDate("");
    setMaxOpens(DEFAULT_MAX_OPENS);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient?.ok || submitting) return;
    const now = new Date();
    const expiresAt =
      expiryChoice === "custom"
        ? expiryToDate("custom", now, new Date(customDate))
        : expiryToDate(expiryChoice, now);
    if (expiryChoice === "custom" && !validateCustomExpiry(new Date(customDate), now).ok) return;

    setSubmitting(true);
    setError(null);
    try {
      const out = await createAndSeal({
        recipientPublicKeyString: recipient.publicKey,
        message,
        expiresAt,
        maxOpens,
        label: label.trim() || null,
      });
      setCreated({
        url: out.url,
        recipientFingerprint: out.recipientFingerprint,
        expiryLabel: expiryChoice === "custom" ? "Custom" : expiryLabel,
        maxOpensLabel,
      });
    } catch (err) {
      setError(classifyApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <LinkCreatedScreen
        url={created.url}
        recipientFingerprint={created.recipientFingerprint}
        expiryLabel={created.expiryLabel}
        maxOpensLabel={created.maxOpensLabel}
        onCreateAnother={resetForm}
      />
    );
  }

  const recipientInvalid = recipient !== null && !recipient.ok && recipient.reason === "invalid";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="font-display text-h1 text-on-surface">New message</h1>
        <p className="text-body-md text-on-surface-variant">
          Compose a message, address it to a recipient's public key, and seal it locally.
        </p>
      </header>

      <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <MaterialIcon name="shield" className="text-primary" filled />
        <p className="text-label-sm text-primary">
          Encryption happens locally in your browser. Your plain text never touches our servers.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-outline-variant bg-surface-container p-6"
      >
        {/* Recipient */}
        <div className="space-y-2">
          <label
            htmlFor="recipient-key"
            className="block text-label-sm uppercase tracking-widest text-on-surface-variant"
          >
            Recipient public key
          </label>
          <textarea
            id="recipient-key"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            placeholder="Paste the recipient's amk1: public key…"
            rows={2}
            spellCheck={false}
            className={`w-full resize-none rounded-lg border bg-surface-container-lowest px-4 py-3 font-mono text-mono-code text-on-surface transition-colors placeholder:font-sans placeholder:text-on-surface-variant focus:outline-none ${
              recipientInvalid
                ? "border-error focus:border-error"
                : "border-outline-variant focus:border-primary"
            }`}
          />
          {recipient?.ok ? (
            <div className="flex flex-col gap-1 rounded-lg border border-success/30 bg-success/10 p-3">
              <span className="inline-flex items-center gap-1 text-label-sm text-success">
                <MaterialIcon name="verified" size={16} filled />
                Valid key
              </span>
              <span className="break-all font-mono text-mono-code text-on-surface">
                {recipient.fingerprint}
              </span>
            </div>
          ) : recipientInvalid ? (
            <span className="block text-label-sm text-error">
              That doesn't look like an aesmsg public key. Paste the recipient's full{" "}
              <span className="font-mono">amk1:</span> key.
            </span>
          ) : null}
          {/* SP4 seam: a saved-contact picker plugs in here, feeding the same {publicKey,fingerprint}. */}
        </div>

        {/* Message */}
        <div className="space-y-2">
          <label
            htmlFor="message"
            className="block text-label-sm uppercase tracking-widest text-on-surface-variant"
          >
            Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your secure message here…"
            rows={7}
            className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-sans text-body-md text-on-surface transition-colors placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />
        </div>

        {/* Label (local-only) */}
        <div className="space-y-2">
          <label
            htmlFor="label"
            className="block text-label-sm uppercase tracking-widest text-on-surface-variant"
          >
            Label <span className="normal-case tracking-normal">(only visible to you)</span>
          </label>
          <input
            id="label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Staging credentials for Acme"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-sans text-body-md text-on-surface transition-colors placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />
        </div>

        {/* Expiry */}
        <fieldset className="space-y-2">
          <legend className="text-label-sm uppercase tracking-widest text-on-surface-variant">
            Link expiry
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {EXPIRY_PRESETS.map((preset) => (
              <OptionButton
                key={preset.value}
                selected={expiryChoice === preset.value}
                onClick={() => setExpiryChoice(preset.value)}
              >
                {preset.label}
              </OptionButton>
            ))}
          </div>
          {expiryChoice === "custom" ? (
            <div className="space-y-2 pt-1">
              <input
                type="datetime-local"
                aria-label="Custom expiry date and time"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-sans text-body-md text-on-surface focus:border-primary focus:outline-none"
              />
              {customCheck && !customCheck.ok ? (
                <span className="block text-label-sm text-error">
                  {customCheck.reason === "past"
                    ? "That time is in the past. Pick a future time."
                    : "That's beyond the 365-day maximum. Pick an earlier time."}
                </span>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        {/* Max views */}
        <fieldset className="space-y-2">
          <legend className="text-label-sm uppercase tracking-widest text-on-surface-variant">
            Max views
          </legend>
          <div className="grid grid-cols-1 gap-3">
            {MAX_OPENS_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                selected={maxOpens === option.value}
                onClick={() => setMaxOpens(option.value)}
              >
                <span className="block font-medium text-on-surface">{option.label}</span>
                <span className="block text-label-sm text-on-surface-variant">
                  {option.description}
                </span>
              </OptionButton>
            ))}
          </div>
        </fieldset>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3">
            <MaterialIcon name="error" size={18} className="text-error" />
            <p className="text-label-sm text-error">{ERROR_COPY[error]}</p>
          </div>
        ) : null}

        <PrimaryButton type="submit" icon="lock" loading={submitting} disabled={!canSubmit}>
          {submitting ? "Encrypting…" : "Encrypt & create link"}
        </PrimaryButton>
      </form>
    </div>
  );
}
