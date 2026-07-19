"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TrustChip } from "@/src/components/TrustChip";
import {
  type ContactView,
  contactInitials,
  contactRecordToContact,
} from "@/src/contacts/contacts-display";
import { listContacts } from "@/src/contacts/contacts-store";

// Contacts list (per the contacts_aesmsg mockup): each row shows an initials avatar, the name (sans),
// a trust chip (green verified / amber unverified / amber "Key changed"), and the short fingerprint in
// mono. Contacts are LOCAL-ONLY (IndexedDB) — this screen makes zero network requests.

export function ContactsListScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listContacts()
      .then((records) => {
        if (!cancelled) setContacts(records.map(contactRecordToContact));
      })
      .catch(() => {
        // A read failure leaves an empty directory rather than crashing the tab.
        if (!cancelled) setContacts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = contacts === null;
  const count = contacts?.length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-h1 text-on-surface">Contacts</h1>
          <p className="text-body-md text-on-surface-variant">
            {loading
              ? "Loading contacts…"
              : `${count} saved ${count === 1 ? "contact" : "contacts"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/contacts/new")}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-label-sm uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90"
        >
          <MaterialIcon name="person_add" size={18} />
          Add contact
        </button>
      </header>

      {loading ? (
        <p className="py-16 text-center text-body-md text-on-surface-variant">Loading contacts…</p>
      ) : count === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container p-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <MaterialIcon name="group" />
          </div>
          <h2 className="font-display text-h2 text-on-surface">No contacts yet</h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Add one to start sending securely.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts?.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                onClick={() => router.push(`/contacts/detail?id=${encodeURIComponent(contact.id)}`)}
                className="flex w-full items-center gap-4 rounded-xl border border-outline-variant bg-surface-container p-4 text-left transition-colors hover:bg-surface-container-high"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-label-sm font-semibold text-on-surface">
                  {contactInitials(contact.name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-sans text-body-md font-medium text-on-surface">
                      {contact.name}
                    </span>
                    <TrustChip status={contact.status} />
                  </span>
                  <span className="truncate font-mono text-label-sm text-on-surface-variant">
                    {contact.fingerprint}
                  </span>
                </span>
                <MaterialIcon name="chevron_right" size={20} className="text-on-surface-variant" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
