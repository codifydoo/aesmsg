// Contacts presentational view-model — the `Contact` shape + `TrustStatus` enum the contacts
// screens render. The data itself now comes from the encrypted on-device store
// (src/contacts/contacts-store.ts), adapted via contacts-display.ts's contactRecordToContact.

/**
 * Trust state of a contact's key, mirroring the design's three states:
 *   - "verified"   → user has compared the fingerprint over a trusted channel (emerald)
 *   - "unverified" → key on file but not yet verified (amber)
 *   - "changed"    → the key changed since last seen — re-verify before trusting (amber, stronger)
 */
export type TrustStatus = "verified" | "unverified" | "changed";

export interface Contact {
  id: string;
  name: string;
  email?: string;
  /** Short display fingerprint shown in the list (e.g. "A1B2 C3D4"). */
  fingerprint: string;
  /**
   * Full public-key fingerprint shown on the detail / verify screens (raw or pre-grouped hex).
   * Optional — falls back to `fingerprint` when a full one is not on file for a contact.
   */
  fullFingerprint?: string;
  /**
   * Short display fingerprint of the key this contact MOST RECENTLY rotated away from (the last
   * element of the record's oldest-first `previousFingerprints`). Present only for a contact whose
   * key changed (`status === "changed"`); it is the REAL prior fingerprint the compose key-changed
   * warning contrasts against the current one — never a fabricated sample.
   */
  previousFingerprint?: string;
  status: TrustStatus;
  /** Human "last used" label from the design (presentational; real value is a follow-up). */
  lastUsed?: string;
  /** Human "key created" label from the design. */
  keyCreated?: string;
}

// NOTE: the presentational `SAMPLE_CONTACTS` seed + `findContact` lookup were removed when the real
// encrypted contacts store (src/contacts/contacts-store.ts) landed. The screens now read the store
// and adapt ContactRecord -> Contact via src/contacts/contacts-display.ts (contactRecordToContact).
// This module is intentionally type-only now: `Contact` + `TrustStatus` remain the presentational
// view-model the list / detail / verify screens render.
