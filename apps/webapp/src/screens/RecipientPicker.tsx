"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { useEffect, useState } from "react";
import { TrustChip } from "@/src/components/TrustChip";
import { contactInitials, contactRecordToContact } from "@/src/contacts/contacts-display";
import { type ContactRecord, listContacts } from "@/src/contacts/contacts-store";
import type { PickedRecipient } from "@/src/create/compose-contact";

// Saved-contact side of the compose recipient seam. Loads the local contact directory and, on select,
// yields a PickedRecipient carrying the contact's REAL public key + fingerprint — the SAME shape the
// pasted path produces, so the seal call is identical regardless of source. Local-only: no network.

export function RecipientPicker({ onPick }: { onPick: (recipient: PickedRecipient) => void }) {
  const [records, setRecords] = useState<ContactRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listContacts()
      .then((next) => {
        if (!cancelled) setRecords(next);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (records === null) {
    return (
      <p className="py-6 text-center text-label-sm text-on-surface-variant">Loading contacts…</p>
    );
  }

  if (records.length === 0) {
    return (
      <p className="rounded-lg border border-outline-variant bg-surface-container-low p-4 text-center text-label-sm text-on-surface-variant">
        No saved contacts yet — paste a key instead, or add one from Contacts.
      </p>
    );
  }

  return (
    <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
      {records.map((record) => {
        const contact = contactRecordToContact(record);
        return (
          <li key={record.id}>
            <button
              type="button"
              onClick={() =>
                onPick({
                  kind: "contact",
                  contact,
                  publicKey: record.publicKey,
                  fingerprint: record.fingerprint,
                })
              }
              className="flex w-full items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-left transition-colors hover:bg-surface-container-high"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-label-sm font-semibold text-on-surface">
                {contactInitials(contact.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-sans text-body-md text-on-surface">
                    {contact.name}
                  </span>
                  <TrustChip status={contact.status} />
                </span>
                <span className="truncate font-mono text-label-sm text-on-surface-variant">
                  {contact.fingerprint}
                </span>
              </span>
              <MaterialIcon name="chevron_right" size={18} className="text-on-surface-variant" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
