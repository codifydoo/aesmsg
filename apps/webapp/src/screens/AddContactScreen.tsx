"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { contactErrorCopy } from "@/src/contacts/contact-error";
import { addContact } from "@/src/contacts/contacts-store";
import { useCameraScanner } from "@/src/contacts/use-camera-scanner";
import { type PublicKeyValidation, validatePublicKey } from "@/src/lib/validate-public-key";

// Add a contact by pasting or scanning their public key (per the add_new_contact mockup — QR-scan
// foregrounded, manual paste always available). The public-key file-import affordance from the
// mockup is OMITTED (it targeted legacy key-file formats). Contacts are LOCAL-ONLY — adding one
// makes zero network requests.
//
// Scan → the decoded amk1: key prefills the paste field and switches to the paste tab for naming +
// confirm; the authoritative validation runs on the paste field / submit, identical to a paste.

type Tab = "paste" | "scan";

export function AddContactScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");
  const [name, setName] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [validation, setValidation] = useState<PublicKeyValidation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { status, videoRef } = useCameraScanner({
    active: tab === "scan",
    onResult: (scanned) => {
      setKeyInput(scanned);
      setError(null);
      setTab("paste");
    },
  });

  // Validate the pasted/scanned key as it changes (crypto runs locally; a race guard drops stale
  // results). An empty field clears the validation without an error.
  useEffect(() => {
    const trimmed = keyInput.trim();
    if (trimmed.length === 0) {
      setValidation(null);
      return;
    }
    let cancelled = false;
    void validatePublicKey(trimmed).then((result) => {
      if (!cancelled) setValidation(result);
    });
    return () => {
      cancelled = true;
    };
  }, [keyInput]);

  const keyInvalid = validation !== null && !validation.ok && validation.reason === "invalid";
  const canAdd = name.trim().length > 0 && validation?.ok === true && !submitting;

  async function handleAdd() {
    if (!validation?.ok || name.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const record = await addContact({ label: name, publicKey: validation.publicKey });
      router.push(`/contacts/detail?id=${encodeURIComponent(record.id)}`);
    } catch (e) {
      setError(contactErrorCopy(e));
      setSubmitting(false);
    }
  }

  const cameraFallback = status === "denied" || status === "unavailable";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="font-display text-h1 text-on-surface">Add contact</h1>
        <p className="text-body-md text-on-surface-variant">
          Save a contact's public key so you can encrypt messages only they can open.
        </p>
      </header>

      <div className="space-y-6 rounded-xl border border-outline-variant bg-surface-container p-6">
        {/* Name */}
        <div className="space-y-2">
          <label
            htmlFor="contact-name"
            className="block text-label-sm uppercase tracking-widest text-on-surface-variant"
          >
            Name
          </label>
          <input
            id="contact-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Elena Rodriguez"
            maxLength={80}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-sans text-body-md text-on-surface transition-colors placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2" role="tablist" aria-label="How to add the key">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "paste"}
            onClick={() => setTab("paste")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-label-sm uppercase tracking-widest transition-colors ${
              tab === "paste"
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
            aria-selected={tab === "scan"}
            onClick={() => setTab("scan")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-label-sm uppercase tracking-widest transition-colors ${
              tab === "scan"
                ? "border-primary bg-primary-container/15 text-primary"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <MaterialIcon name="qr_code_scanner" size={18} />
            Scan QR
          </button>
        </div>

        {tab === "paste" ? (
          <div className="space-y-2">
            <label
              htmlFor="contact-key"
              className="block text-label-sm uppercase tracking-widest text-on-surface-variant"
            >
              Public key
            </label>
            <textarea
              id="contact-key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste their amk1: public key…"
              rows={3}
              spellCheck={false}
              className={`w-full resize-none rounded-lg border bg-surface-container-lowest px-4 py-3 font-mono text-mono-code text-on-surface transition-colors placeholder:font-sans placeholder:text-on-surface-variant focus:outline-none ${
                keyInvalid
                  ? "border-error focus:border-error"
                  : "border-outline-variant focus:border-primary"
              }`}
            />
            {validation?.ok ? (
              <div className="flex flex-col gap-1 rounded-lg border border-success/30 bg-success/10 p-3">
                <span className="inline-flex items-center gap-1 text-label-sm text-success">
                  <MaterialIcon name="verified" size={16} filled />
                  Valid key
                </span>
                <span className="break-all font-mono text-mono-code text-on-surface">
                  {validation.fingerprint}
                </span>
              </div>
            ) : keyInvalid ? (
              <span className="block text-label-sm text-error">
                That doesn't look like an aesmsg public key. Paste their full{" "}
                <span className="font-mono">amk1:</span> key.
              </span>
            ) : null}
          </div>
        ) : cameraFallback ? (
          <div className="space-y-4 rounded-lg border border-outline-variant bg-surface-container-low p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
              <MaterialIcon name="photo_camera" />
            </div>
            <div className="space-y-1">
              <p className="text-body-md font-medium text-on-surface">Camera access needed</p>
              <p className="text-label-sm text-on-surface-variant">
                Allow camera access to scan a contact's QR code, or paste their key instead.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab("paste")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high px-5 py-2.5 text-label-sm uppercase tracking-widest text-on-surface transition-colors hover:bg-surface-container-highest"
            >
              Paste instead
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-xl border border-outline-variant bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-primary/70" />
            </div>
            <p className="text-center text-label-sm text-on-surface-variant">
              Point at an aesmsg QR code
            </p>
            <button
              type="button"
              onClick={() => setTab("paste")}
              className="mx-auto block text-label-sm text-primary transition-colors hover:underline"
            >
              Paste instead
            </button>
          </div>
        )}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3">
            <MaterialIcon name="error" size={18} className="text-error" />
            <p className="text-label-sm text-error">{error}</p>
          </div>
        ) : null}

        <PrimaryButton
          icon="person_add"
          onClick={handleAdd}
          loading={submitting}
          disabled={!canAdd}
        >
          {submitting ? "Adding…" : "Add contact"}
        </PrimaryButton>
      </div>
    </div>
  );
}
