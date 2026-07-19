"use client";

import type { Fingerprint, PublicKeyString } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type ApiErrorKind, classifyApiError } from "@/src/api/client";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { TrustChip } from "@/src/components/TrustChip";
import { contactInitials } from "@/src/contacts/contacts-display";
import { type PickedRecipient, seedComposeRecipient } from "@/src/create/compose-contact";
import { consumePendingRecipient } from "@/src/create/compose-handoff";
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
import { RecipientPicker } from "@/src/screens/RecipientPicker";

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
  const router = useRouter();
  const [recipientMode, setRecipientMode] = useState<"paste" | "contact">("paste");
  const [recipientInput, setRecipientInput] = useState("");
  const [recipient, setRecipient] = useState<RecipientValidation | null>(null);
  // A saved contact adopted as the recipient (contact mode). A "changed"-key contact is NEVER placed
  // here directly — it is held behind `keyChanged` until the user explicitly verifies or acknowledges.
  const [picked, setPicked] = useState<PickedRecipient | null>(null);
  // The key-changed gate: a picked contact whose key changed, awaiting an explicit choice (D7/D8).
  const [keyChanged, setKeyChanged] = useState<(PickedRecipient & { kind: "contact" }) | undefined>(
    undefined,
  );
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("");
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [customDate, setCustomDate] = useState("");
  const [maxOpens, setMaxOpens] = useState<MaxOpensChoice>(DEFAULT_MAX_OPENS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiErrorKind | null>(null);
  const [created, setCreated] = useState<CreatedLink | null>(null);

  // Seed from a "Send secure message" hand-off (e.g. off a contact's detail). One-shot: consumed on
  // mount, then cleared. A changed-key contact is HELD behind the gate (seedComposeRecipient), never
  // adopted silently — the MitM gate is never bypassed by the detail entry point.
  useEffect(() => {
    const pending = consumePendingRecipient();
    if (pending) {
      const seeded = seedComposeRecipient(pending);
      setRecipientMode("contact");
      setPicked(seeded.recipient);
      setKeyChanged(seeded.keyChanged);
    }
  }, []);

  function handlePick(candidate: PickedRecipient) {
    const seeded = seedComposeRecipient(candidate);
    setPicked(seeded.recipient);
    setKeyChanged(seeded.keyChanged);
  }

  function selectRecipientMode(mode: "paste" | "contact") {
    setRecipientMode(mode);
    if (mode === "paste") {
      // Entering the Paste tab is a clean-slate recipient source: drop any held contact and the
      // contact-side key-changed gate. That gate renders (and can be cleared) only in contact mode,
      // so leaving `keyChanged` set here would strand `canSubmit` forever with no visible control.
      // A pasted key then becomes the authoritative recipient.
      setKeyChanged(undefined);
      setPicked(null);
    }
  }

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

  // The recipient the screen seals to — the SAME { publicKey, fingerprint } shape whether pasted or a
  // saved contact, so createAndSeal is unchanged. A changed-key contact held behind the gate keeps
  // this null (picked stays null), so it can never reach the seal without an explicit choice (D8).
  const activeRecipient: { publicKey: PublicKeyString; fingerprint: Fingerprint } | null =
    recipientMode === "paste"
      ? recipient?.ok
        ? { publicKey: recipient.publicKey, fingerprint: recipient.fingerprint }
        : null
      : picked
        ? { publicKey: picked.publicKey, fingerprint: picked.fingerprint }
        : null;

  const canSubmit =
    activeRecipient !== null && keyChanged === undefined && expiryValid && !submitting;

  const expiryLabel = EXPIRY_PRESETS.find((p) => p.value === expiryChoice)?.label ?? "";
  const maxOpensLabel = MAX_OPENS_OPTIONS.find((o) => o.value === maxOpens)?.label ?? "";

  function resetForm() {
    setCreated(null);
    setRecipientMode("paste");
    setRecipientInput("");
    setRecipient(null);
    setPicked(null);
    setKeyChanged(undefined);
    setMessage("");
    setLabel("");
    setExpiryChoice(DEFAULT_EXPIRY);
    setCustomDate("");
    setMaxOpens(DEFAULT_MAX_OPENS);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (activeRecipient === null || keyChanged !== undefined || submitting) return;
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
        recipientPublicKeyString: activeRecipient.publicKey,
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
        {/* Recipient — pasted key OR a saved contact. Both feed the SAME {publicKey,fingerprint} into
            createAndSeal (SP4 fills the SP2 seam). A changed-key contact routes through the gate below
            instead of becoming the active recipient. */}
        <div className="space-y-3">
          <span className="block text-label-sm uppercase tracking-widest text-on-surface-variant">
            Recipient
          </span>
          <div className="flex gap-2" role="tablist" aria-label="Choose recipient source">
            <button
              type="button"
              role="tab"
              aria-selected={recipientMode === "paste"}
              onClick={() => selectRecipientMode("paste")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-label-sm uppercase tracking-widest transition-colors ${
                recipientMode === "paste"
                  ? "border-primary bg-primary-container/15 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <MaterialIcon name="content_paste" size={18} />
              Paste key
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={recipientMode === "contact"}
              onClick={() => selectRecipientMode("contact")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-label-sm uppercase tracking-widest transition-colors ${
                recipientMode === "contact"
                  ? "border-primary bg-primary-container/15 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <MaterialIcon name="group" size={18} />
              Saved contacts
            </button>
          </div>

          {recipientMode === "paste" ? (
            <div className="space-y-2">
              <textarea
                id="recipient-key"
                aria-label="Recipient public key"
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
            </div>
          ) : keyChanged ? (
            <div
              role="alertdialog"
              aria-label="Contact key changed"
              className="space-y-4 rounded-lg border border-warning/30 bg-warning/10 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-label-sm font-semibold text-on-surface">
                    {contactInitials(keyChanged.contact.name)}
                  </span>
                  <span className="truncate font-sans text-body-md font-medium text-on-surface">
                    {keyChanged.contact.name}
                  </span>
                </div>
                <TrustChip status="changed" />
              </div>
              <div className="flex items-start gap-2">
                <MaterialIcon name="warning" size={18} className="text-warning" />
                <p className="text-label-sm text-on-surface-variant">
                  This contact's key changed. Verify the fingerprint before sending sensitive
                  information.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                  <span className="block text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Previously
                  </span>
                  <span className="block break-all font-mono text-mono-code text-on-surface-variant">
                    {keyChanged.contact.previousFingerprint ?? "—"}
                  </span>
                </div>
                <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <span className="block text-label-sm uppercase tracking-widest text-warning">
                    Now
                  </span>
                  <span className="block break-all font-mono text-mono-code text-warning">
                    {keyChanged.contact.fingerprint}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/contacts/detail?id=${encodeURIComponent(keyChanged.contact.id)}`)
                  }
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-on-primary transition-opacity hover:opacity-90"
                >
                  <MaterialIcon name="verified" size={18} />
                  Verify fingerprint
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Explicit, deliberately-frictioned override (D8): adopt the changed contact only
                    // on an unambiguous user action. Red-toned because this is the risky choice.
                    setPicked(keyChanged);
                    setKeyChanged(undefined);
                  }}
                  className="flex h-11 flex-1 items-center justify-center rounded-lg border border-error text-error transition-colors hover:bg-error/10"
                >
                  Send anyway (unsafe)
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setKeyChanged(undefined);
                  setPicked(null);
                }}
                className="mx-auto block text-label-sm text-on-surface-variant transition-colors hover:text-on-surface"
              >
                Cancel
              </button>
            </div>
          ) : picked && picked.kind === "contact" ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-label-sm font-semibold text-on-surface">
                  {contactInitials(picked.contact.name)}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-sans text-body-md text-on-surface">
                      {picked.contact.name}
                    </span>
                    <TrustChip status={picked.contact.status} />
                  </span>
                  <span className="truncate font-mono text-label-sm text-on-surface-variant">
                    {picked.contact.fingerprint}
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="shrink-0 text-label-sm uppercase tracking-widest text-primary transition-colors hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <RecipientPicker onPick={handlePick} />
          )}
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
