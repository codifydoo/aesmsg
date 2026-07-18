// Contacts feature barrel. The Integration phase mounts the tab via the default ContactsFlow; the
// individual screens + mock store + pure logic are re-exported for testing / reuse.
//
// NOTE on initials + fingerprint chunking: the kit already ships unit-tested pure helpers
// (`deriveInitials` in src/components/initials.ts, `chunkFingerprint` in
// src/components/fingerprint-format.ts) and the screens consume those directly. Rather than
// duplicate identical logic into the contacts folder, they are re-exported here for convenience so
// callers that only import "@/src/contacts" still have them. Contact-specific pure logic that did
// NOT already exist (status → trust-indicator mapping) lives in ./trust-status and is tested.

// Re-exported kit helpers (see note above — not re-implemented here).
export { chunkFingerprint } from "@/src/components/fingerprint-format";
export { deriveInitials } from "@/src/components/initials";
// Screens
export {
  type AddContactMethod,
  AddContactScreen,
  type AddContactScreenProps,
} from "@/src/contacts/AddContactScreen";
export { ComingSoonScreen, type ComingSoonScreenProps } from "@/src/contacts/ComingSoonScreen";
export {
  ContactDetailScreen,
  type ContactDetailScreenProps,
} from "@/src/contacts/ContactDetailScreen";
export {
  ContactsEmptyScreen,
  type ContactsEmptyScreenProps,
} from "@/src/contacts/ContactsEmptyScreen";
export { type ContactsFlowProps, default as ContactsFlow } from "@/src/contacts/ContactsFlow";
export {
  ContactsListScreen,
  type ContactsListScreenProps,
} from "@/src/contacts/ContactsListScreen";
// View-model + pure logic
export type { Contact, TrustStatus } from "@/src/contacts/contacts-data";
export {
  contactRecordToContact,
  deriveKeyCreatedLabel,
  deriveLastUsedLabel,
  deriveTrustStatus,
  fullFingerprintLines,
  shortFingerprint,
} from "@/src/contacts/contacts-display";
export {
  type AddContactInput,
  addContact,
  CONTACTS_BLOB_KEY,
  type ContactRecord,
  ContactsStoreError,
  DuplicateFingerprintError,
  deleteContact,
  getContact,
  InvalidLabelError,
  listContacts,
  NotFoundError,
  RotatedAwayError,
  renameContact,
  SameKeyError,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";
export {
  type TrustIndicator,
  type TrustIndicatorKind,
  trustIndicator,
} from "@/src/contacts/trust-status";
export {
  VerifyFingerprintScreen,
  type VerifyFingerprintScreenProps,
} from "@/src/contacts/VerifyFingerprintScreen";
