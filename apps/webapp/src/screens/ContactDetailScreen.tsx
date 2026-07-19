"use client";

import type { PublicKeyString } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDeleteContactDialog } from "@/src/components/ConfirmDeleteContactDialog";
import { FingerprintBlock } from "@/src/components/FingerprintBlock";
import { KeyChangedAlert } from "@/src/components/KeyChangedAlert";
import { TrustChip } from "@/src/components/TrustChip";
import { contactErrorCopy } from "@/src/contacts/contact-error";
import {
  type ContactView,
  contactInitials,
  contactRecordToContact,
  shortFingerprint,
} from "@/src/contacts/contacts-display";
import {
  type ContactRecord,
  deleteContact,
  getContact,
  renameContact,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";
import { keyChangeAlertView } from "@/src/contacts/key-change";
import { useCameraScanner } from "@/src/contacts/use-camera-scanner";
import { setPendingRecipient } from "@/src/create/compose-handoff";
import { validatePublicKey } from "@/src/lib/validate-public-key";
import { VerifyFingerprintScreen } from "@/src/screens/VerifyFingerprintScreen";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

interface KeyChangedState {
  candidateKey: PublicKeyString;
  previousFingerprint: string;
  newFingerprint: string;
}

export function ContactDetailScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const [record, setRecord] = useState<ContactRecord | null | undefined>(undefined);
  const [mode, setMode] = useState<"detail" | "verify">("detail");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [rekeyOpen, setRekeyOpen] = useState(false);
  const [rekeyTab, setRekeyTab] = useState<"paste" | "scan">("paste");
  const [rekeyInput, setRekeyInput] = useState("");
  const [rekeyError, setRekeyError] = useState<string | null>(null);
  const [keyChanged, setKeyChanged] = useState<KeyChangedState | null>(null);

  const reload = useCallback(async () => {
    if (id.length === 0) {
      setRecord(null);
      return;
    }
    try {
      setRecord(await getContact(id));
    } catch {
      setRecord(null);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { status: cameraStatus, videoRef } = useCameraScanner({
    active: rekeyOpen && rekeyTab === "scan",
    onResult: (scanned) => {
      setRekeyInput(scanned);
      setRekeyError(null);
      setRekeyTab("paste");
    },
  });

  if (record === undefined) {
    return (
      <p className="py-16 text-center text-body-md text-on-surface-variant">Loading contact…</p>
    );
  }

  if (record === null) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-outline-variant bg-surface-container p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <MaterialIcon name="person_off" />
        </div>
        <h1 className="font-display text-h2 text-on-surface">Contact not found</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          This contact isn't saved on this device.
        </p>
        <button
          type="button"
          onClick={() => router.push("/contacts")}
          className="mt-6 inline-flex items-center gap-1 text-label-sm uppercase tracking-widest text-primary"
        >
          <MaterialIcon name="arrow_back" size={16} />
          Back to contacts
        </button>
      </div>
    );
  }

  const contact: ContactView = contactRecordToContact(record);

  if (mode === "verify") {
    return (
      <VerifyFingerprintScreen
        contact={contact}
        onDone={async () => {
          await reload();
          setMode("detail");
        }}
        onCancel={() => setMode("detail")}
      />
    );
  }

  async function submitRename() {
    if (!record) return;
    try {
      await renameContact(record.id, renameValue);
      setRenaming(false);
      await reload();
    } catch (e) {
      setRekeyError(contactErrorCopy(e));
    }
  }

  async function submitRekey() {
    if (!record) return;
    setRekeyError(null);
    const validation = await validatePublicKey(rekeyInput);
    if (!validation.ok) {
      setRekeyError("That doesn't look like a valid aesmsg public key. Check the whole key.");
      return;
    }
    if (validation.fingerprint === record.fingerprint) {
      setRekeyError("That's already this contact's current key.");
      return;
    }
    if (record.previousFingerprints.includes(validation.fingerprint)) {
      setRekeyError("This key was previously rotated away from this contact.");
      return;
    }
    const view = keyChangeAlertView(record.label, record.fingerprint, validation.fingerprint);
    setKeyChanged({
      candidateKey: validation.publicKey,
      previousFingerprint: view.previousFingerprint,
      newFingerprint: view.newFingerprint,
    });
  }

  async function adoptNewKey() {
    if (!record || !keyChanged) return;
    try {
      await updateContactKey(record.id, keyChanged.candidateKey);
    } catch {
      // Detection already classified this as "changed"; a late store guard is swallowed rather than
      // crashing the screen.
    }
    setKeyChanged(null);
    setRekeyOpen(false);
    setRekeyInput("");
    await reload();
    // The contact now reads as key-changed / unverified. The user re-verifies via the detail
    // screen's normal Verify flow, which compares the now-STORED key's fingerprint out-of-band.
  }

  function sendSecureMessage() {
    if (!record) return;
    setPendingRecipient({
      kind: "contact",
      contact,
      publicKey: record.publicKey,
      fingerprint: record.fingerprint,
    });
    router.push("/new");
  }

  async function confirmDelete() {
    if (!record) return;
    setDeleting(true);
    await deleteContact(record.id);
    setDeleting(false);
    setDeleteOpen(false);
    router.push("/contacts");
  }

  const needsVerify = contact.status === "unverified" || contact.status === "changed";
  const cameraFallback = cameraStatus === "denied" || cameraStatus === "unavailable";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <button
        type="button"
        onClick={() => router.push("/contacts")}
        className="inline-flex items-center gap-1 self-start text-label-sm uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <MaterialIcon name="arrow_back" size={16} />
        Contacts
      </button>

      <section className="space-y-5 rounded-xl border border-outline-variant bg-surface-container p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-body-md font-semibold text-on-surface">
            {contactInitials(contact.name)}
          </span>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  aria-label="Contact name"
                  value={renameValue}
                  maxLength={80}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-sans text-body-md text-on-surface focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={submitRename}
                  className="rounded-lg bg-primary px-3 py-2 text-label-sm uppercase tracking-widest text-on-primary"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  className="rounded-lg border border-outline-variant px-3 py-2 text-label-sm uppercase tracking-widest text-on-surface-variant"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-h2 text-on-surface">{contact.name}</h1>
                <TrustChip status={contact.status} />
              </div>
            )}
          </div>
        </div>

        {needsVerify ? (
          <button
            type="button"
            onClick={() => setMode("verify")}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-container font-display font-semibold text-on-primary-container transition-all active:scale-[0.98]"
          >
            <MaterialIcon name="verified" size={20} />
            Verify fingerprint
          </button>
        ) : (
          <button
            type="button"
            onClick={async () => {
              await setContactVerified(record.id, false);
              await reload();
            }}
            className="text-label-sm text-on-surface-variant transition-colors hover:text-on-surface"
          >
            Mark unverified (compose will re-check the fingerprint)
          </button>
        )}

        <FingerprintBlock
          label="Public fingerprint"
          value={record.fingerprint}
          copyLabel="Copy public fingerprint"
        />
        <FingerprintBlock label="Public key" value={record.publicKey} copyLabel="Copy public key" />

        <div className="flex items-center justify-between border-outline-variant/60 border-t pt-4 text-label-sm">
          <span className="uppercase tracking-widest text-on-surface-variant">Contact created</span>
          <span className="text-on-surface">{formatDate(record.createdAt)}</span>
        </div>

        {record.previousFingerprints.length > 0 ? (
          <div className="space-y-2 border-outline-variant/60 border-t pt-4">
            <span className="block text-label-sm uppercase tracking-widest text-on-surface-variant">
              Previously used keys
            </span>
            <ul className="space-y-1">
              {record.previousFingerprints.map((fp) => (
                <li key={fp} className="break-all font-mono text-label-sm text-on-surface-variant">
                  {shortFingerprint(fp)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={sendSecureMessage}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
        >
          <MaterialIcon name="lock" size={20} />
          Send secure message
        </button>
        <button
          type="button"
          onClick={() => {
            setRenameValue(contact.name);
            setRenaming(true);
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
        >
          <MaterialIcon name="edit" size={20} />
          Rename
        </button>
        <button
          type="button"
          onClick={() => {
            setRekeyOpen((open) => !open);
            setRekeyError(null);
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
        >
          <MaterialIcon name="key" size={20} />
          Update key
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-error/40 bg-error/5 font-medium text-error transition-colors hover:bg-error/10"
        >
          <MaterialIcon name="delete" size={20} />
          Delete contact
        </button>
      </div>

      {rekeyOpen ? (
        <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-body-md font-medium text-on-surface">Update this contact's key</h2>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={rekeyTab === "paste"}
                onClick={() => setRekeyTab("paste")}
                className={`rounded-lg border px-3 py-1.5 text-label-sm uppercase tracking-widest ${rekeyTab === "paste" ? "border-primary text-primary" : "border-outline-variant text-on-surface-variant"}`}
              >
                Paste
              </button>
              <button
                type="button"
                aria-pressed={rekeyTab === "scan"}
                onClick={() => setRekeyTab("scan")}
                className={`rounded-lg border px-3 py-1.5 text-label-sm uppercase tracking-widest ${rekeyTab === "scan" ? "border-primary text-primary" : "border-outline-variant text-on-surface-variant"}`}
              >
                Scan
              </button>
            </div>
          </div>

          {rekeyTab === "scan" && !cameraFallback ? (
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
          ) : rekeyTab === "scan" && cameraFallback ? (
            <p className="rounded-lg border border-outline-variant bg-surface-container-low p-4 text-center text-label-sm text-on-surface-variant">
              Camera access needed — paste the key instead.
            </p>
          ) : (
            <textarea
              aria-label="New public key"
              value={rekeyInput}
              onChange={(e) => setRekeyInput(e.target.value)}
              placeholder="Paste the new amk1: public key…"
              rows={3}
              spellCheck={false}
              className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-mono text-mono-code text-on-surface focus:border-primary focus:outline-none"
            />
          )}

          {rekeyError ? <p className="text-label-sm text-error">{rekeyError}</p> : null}

          <button
            type="button"
            onClick={submitRekey}
            disabled={rekeyInput.trim().length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-label-sm uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Check new key
          </button>
        </section>
      ) : null}

      {keyChanged ? (
        <KeyChangedAlert
          contactName={contact.name}
          previousFingerprint={keyChanged.previousFingerprint}
          newFingerprint={keyChanged.newFingerprint}
          onUpdateKey={() => void adoptNewKey()}
          onKeepCurrent={() => setKeyChanged(null)}
        />
      ) : null}

      <ConfirmDeleteContactDialog
        open={deleteOpen}
        contactName={contact.name}
        busy={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
