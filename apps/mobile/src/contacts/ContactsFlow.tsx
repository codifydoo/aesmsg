import type { Fingerprint, PublicKeyString } from "@aesmsg/crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useState } from "react";
import { AddContactScreen } from "@/src/contacts/AddContactScreen";
import { ContactDetailScreen } from "@/src/contacts/ContactDetailScreen";
import { ContactsEmptyScreen } from "@/src/contacts/ContactsEmptyScreen";
import { ContactsListScreen } from "@/src/contacts/ContactsListScreen";
import {
  type DocumentPickerLike,
  type FileSystemLike,
  importContactCard,
} from "@/src/contacts/contact-card";
import type { Contact } from "@/src/contacts/contacts-data";
import { contactRecordToContact } from "@/src/contacts/contacts-display";
import {
  type ContactRecord,
  deleteContact,
  listContacts,
  RotatedAwayError,
  SameKeyError,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";
import { ImportContactErrorScreen } from "@/src/contacts/ImportContactErrorScreen";
import { detectKeyChange, keyChangeAlertView } from "@/src/contacts/key-change";
import { PasteKeyScreen } from "@/src/contacts/PasteKeyScreen";
import { QRScanScreen } from "@/src/contacts/QRScanScreen";
import { RemoveContactConfirmSheet } from "@/src/contacts/RemoveContactConfirmSheet";
import { VerifyFingerprintScreen } from "@/src/contacts/VerifyFingerprintScreen";
import { contactRecipient, type Recipient } from "@/src/create/recipient";
import { KeyChangedAlertScreen } from "@/src/keys/KeyChangedAlertScreen";

// ContactsFlow — the Contacts tab's internal navigation stack, now backed by the encrypted
// on-device contacts store. It loads the real ContactRecord[] (adapting each to the presentational
// Contact view-model), routes between the contacts screens (34/35/36/37/38/39/44), and persists
// mutations (mark-verified, remove, re-key). Pasting a public key and scanning a QR are both live
// (PasteKeyScreen → addContact; QRScanScreen decodes an amk1: key → prefilled PasteKeyScreen);
// importing a .aesmsg contact card file is also live (pick → parse → prefilled PasteKeyScreen, or the
// import-error screen for an invalid file). Nothing here fabricates a contact.
//
// KEY-CHANGED DETECTION (the product's MitM defense): scanning/pasting a key FROM an existing
// contact's detail (routes carry that contact's `contactId`) runs key-change detection instead of an
// add. A genuinely new key raises the Key-Changed alert (44) with the REAL previous + new
// fingerprints; confirming calls updateContactKey (which RESETS the contact to unverified — a changed
// key must be re-verified), declining leaves the stored key untouched.
//
// Navigation OUT of the tab (e.g. "Send secure message" → compose) is an optional callback so the
// flow stays decoupled; with no callback wired the action is inert rather than navigating wrong.

type Route =
  | { name: "list" }
  | { name: "detail"; contactId: string }
  | { name: "add" }
  | { name: "verify"; contactId: string }
  // `contactId` present ⇒ re-key an EXISTING contact (key-change detection); absent ⇒ add a new one.
  | { name: "scan"; contactId?: string }
  | { name: "paste"; prefillKey?: string; prefillName?: string; contactId?: string }
  // Key-Changed alert (44): a re-scanned/pasted key differs from the one on file. Carries the
  // candidate key (to commit via updateContactKey) + the real previous/new fingerprints to display.
  | {
      name: "key-changed";
      contactId: string;
      newPublicKey: string;
      previousFingerprint: Fingerprint;
      newFingerprint: Fingerprint;
    }
  | { name: "import-error" };

export interface ContactsFlowProps {
  /**
   * Navigate out of the tab to compose a message to this contact. Carries a ready-to-seal
   * Recipient (the contact view-model paired with its REAL public key from the record) so the host
   * can pre-select it on the compose screen — identical to picking the contact in the recipient
   * sheet. Optional so the flow stays decoupled; with no callback wired the action is inert.
   */
  onSendToContact?: (recipient: Recipient) => void;
  /** Open directly on a sub-screen (one-shot intent handed in from the Home hub). */
  initialIntent?: "scan" | "add";
}

export default function ContactsFlow({ onSendToContact, initialIntent }: ContactsFlowProps = {}) {
  const [records, setRecords] = useState<ContactRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Confirm gate before the destructive "Remove contact" action (deletes the key from this device).
  const [removeVisible, setRemoveVisible] = useState(false);
  const [route, setRoute] = useState<Route>(
    initialIntent === "scan"
      ? { name: "scan" }
      : initialIntent === "add"
        ? { name: "add" }
        : { name: "list" },
  );

  // expo modules are wider than the pure module's minimal DI shapes; bridge with `as unknown as`
  // exactly as KeysFlow / ImportBackupScreenIntegration do. Runtime calls are identical.
  const importDeps = { DocumentPicker, FileSystem } as unknown as {
    DocumentPicker: DocumentPickerLike;
    FileSystem: Pick<FileSystemLike, "EncodingType" | "readAsStringAsync">;
  };

  async function handleImportPick() {
    const outcome = await importContactCard(importDeps);
    if (outcome.kind === "canceled") return; // stay on the add screen
    if (outcome.kind === "error") {
      setRoute({ name: "import-error" });
      return;
    }
    setRoute({
      name: "paste",
      prefillKey: outcome.card.publicKey,
      prefillName: outcome.card.label,
    });
  }

  const reload = useCallback(async () => {
    const next = await listContacts();
    setRecords(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload().catch(() => {
      // A metadata-read failure leaves the directory empty (the empty state is shown) rather than
      // crashing the tab. Adding a contact will overwrite the blob and recover.
      setLoaded(true);
    });
  }, [reload]);

  const goList = () => {
    setRemoveVisible(false);
    setRoute({ name: "list" });
  };
  const goDetail = (contactId: string) => setRoute({ name: "detail", contactId });
  const findRecord = (id: string) => records.find((r) => r.id === id);

  // Re-key submit (shared by the scan and paste entry points off a contact's detail). Runs
  // key-change detection against the stored record: a genuine change routes to the Key-Changed alert
  // (44); a same/rotated-away re-scan THROWS the store's typed error so PasteKeyScreen renders it
  // inline (via pasteContactError) rather than silently no-op'ing. The candidate key is already
  // importPublicKey-validated by the paste screen before this runs.
  const submitRekey = async (contactId: string, candidateKey: string) => {
    const record = findRecord(contactId);
    if (!record) {
      goList();
      return;
    }
    const detection = await detectKeyChange(record, candidateKey as PublicKeyString);
    if (detection.kind === "same") throw new SameKeyError("New key equals current key");
    if (detection.kind === "rotated-back") {
      throw new RotatedAwayError("This key was previously rotated away by this contact");
    }
    setRoute({
      name: "key-changed",
      contactId,
      newPublicKey: candidateKey,
      previousFingerprint: detection.previousFingerprint,
      newFingerprint: detection.newFingerprint,
    });
  };

  const contacts: Contact[] = records.map((r) => contactRecordToContact(r));

  const listScreen = (
    <ContactsListScreen
      contacts={contacts}
      onAdd={() => setRoute({ name: "add" })}
      onSelect={(id) => setRoute({ name: "detail", contactId: id })}
    />
  );

  // Empty-store state (39) takes over the whole tab once loaded with no contacts.
  if (
    loaded &&
    records.length === 0 &&
    route.name !== "add" &&
    route.name !== "scan" &&
    route.name !== "paste" &&
    route.name !== "key-changed" &&
    route.name !== "import-error"
  ) {
    return (
      <ContactsEmptyScreen
        onScan={() => setRoute({ name: "scan" })}
        onPaste={() => setRoute({ name: "paste" })}
      />
    );
  }

  switch (route.name) {
    case "detail": {
      const record = findRecord(route.contactId);
      if (!record) return listScreen;
      const contact = contactRecordToContact(record);
      return (
        <>
          <ContactDetailScreen
            contact={contact}
            onBack={goList}
            onScanQr={() => setRoute({ name: "scan", contactId: record.id })}
            onSend={() => onSendToContact?.(contactRecipient(contact, record.publicKey))}
            onRemove={() => setRemoveVisible(true)}
            onVerify={() => setRoute({ name: "verify", contactId: record.id })}
          />
          <RemoveContactConfirmSheet
            visible={removeVisible}
            contact={contact}
            onCancel={() => setRemoveVisible(false)}
            onConfirm={async () => {
              setRemoveVisible(false);
              await deleteContact(record.id);
              await reload();
              goList();
            }}
          />
        </>
      );
    }

    case "add":
      return (
        <AddContactScreen
          onBack={goList}
          onPick={(method) => {
            if (method === "scan") setRoute({ name: "scan" });
            else if (method === "paste") setRoute({ name: "paste" });
            else void handleImportPick();
          }}
        />
      );

    case "verify": {
      const record = findRecord(route.contactId);
      if (!record) return listScreen;
      const contact = contactRecordToContact(record);
      const backToDetail = () => setRoute({ name: "detail", contactId: record.id });
      return (
        <VerifyFingerprintScreen
          contact={contact}
          onBack={backToDetail}
          onMarkVerified={async () => {
            await setContactVerified(record.id, true);
            await reload();
            backToDetail();
          }}
          onNotNow={backToDetail}
        />
      );
    }

    case "scan": {
      // `contactId` present ⇒ re-key an existing contact; the scanned/pasted key is carried into the
      // paste screen (re-key mode) which runs key-change detection on submit.
      const rekeyId = route.contactId;
      return (
        <QRScanScreen
          onBack={rekeyId !== undefined ? () => goDetail(rekeyId) : goList}
          onPaste={() =>
            setRoute({ name: "paste", ...(rekeyId !== undefined ? { contactId: rekeyId } : {}) })
          }
          onResult={(key) =>
            setRoute({
              name: "paste",
              prefillKey: key,
              ...(rekeyId !== undefined ? { contactId: rekeyId } : {}),
            })
          }
        />
      );
    }

    case "paste": {
      const rekeyId = route.contactId;
      if (rekeyId !== undefined) {
        const record = findRecord(rekeyId);
        if (!record) return listScreen;
        return (
          <PasteKeyScreen
            onBack={() => goDetail(rekeyId)}
            {...(route.prefillKey !== undefined ? { initialKey: route.prefillKey } : {})}
            rekey={{
              contactName: record.label,
              onSubmitKey: (key) => submitRekey(rekeyId, key),
            }}
          />
        );
      }
      return (
        <PasteKeyScreen
          onBack={goList}
          {...(route.prefillKey !== undefined ? { initialKey: route.prefillKey } : {})}
          {...(route.prefillName !== undefined ? { initialName: route.prefillName } : {})}
          onAdded={async (id) => {
            await reload();
            goDetail(id);
          }}
        />
      );
    }

    case "key-changed": {
      const record = findRecord(route.contactId);
      if (!record) return listScreen;
      const view = keyChangeAlertView(
        record.label,
        route.previousFingerprint,
        route.newFingerprint,
      );
      const { contactId, newPublicKey } = route;
      return (
        <KeyChangedAlertScreen
          contactName={view.contactName}
          previousFingerprint={view.previousFingerprint}
          newFingerprint={view.newFingerprint}
          onUpdateKey={async () => {
            // Persist the new key. updateContactKey RESETS verified → false (the security-critical
            // bit: a changed key is unverified until re-compared out-of-band). A late store guard
            // (Same/RotatedAway) is swallowed rather than crashing the tab — detection already
            // classified this as "changed", so it is practically unreachable.
            try {
              await updateContactKey(contactId, newPublicKey as PublicKeyString);
            } catch {
              // no-op: fall through to reload + navigate below.
            }
            await reload();
            goDetail(contactId);
          }}
          onKeepCurrent={() => goDetail(contactId)}
        />
      );
    }

    case "import-error":
      return <ImportContactErrorScreen onBack={goList} />;

    default:
      return listScreen;
  }
}
