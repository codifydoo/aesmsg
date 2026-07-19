import { type Fingerprint, truncateFingerprint } from "@aesmsg/crypto";
import type { ContactRecord } from "@/src/contacts/contacts-store";

// Pure derived display for a persisted ContactRecord. NONE of this is stored — it is computed at
// render time so the on-disk record stays the minimal label + key + trust state. Direct port of
// apps/mobile/src/contacts/contacts-display.ts (web-native: no date-fns, no react-native).

/**
 * Trust state of a contact's key, mirroring the design's three states:
 *   - "verified"   → user has compared the fingerprint over a trusted channel (green)
 *   - "unverified" → key on file but not yet verified (amber)
 *   - "changed"    → the key changed since last seen — re-verify before trusting (amber, stronger)
 */
export type TrustStatus = "verified" | "unverified" | "changed";

/** Presentational view-model the list / detail / verify / picker screens render. */
export interface ContactView {
  id: string;
  name: string;
  /** Short list/row fingerprint: the first two 4-char groups (e.g. "A1B2 C3D4"). */
  fingerprint: string;
  /** Canonical raw AM- fingerprint (for the detail/verify FingerprintBlock + copy). */
  fullFingerprint: Fingerprint;
  /**
   * Short display fingerprint of the key this contact MOST RECENTLY rotated away from (the last
   * element of the record's oldest-first `previousFingerprints`). Present ONLY when the key changed
   * (`status === "changed"`); it is the REAL prior fingerprint, never a fabricated sample.
   */
  previousFingerprint?: string;
  status: TrustStatus;
  /** Absolute "key created" date, e.g. "Sep 12, 2025". */
  keyCreated: string;
}

/**
 * Trust status the row / detail / verify screens render. `verified` always wins; otherwise a
 * non-empty rotation history means the key CHANGED (amber "re-verify"), and a fresh-but-unverified
 * key is plain "unverified" (mirrors mobile's deriveTrustStatus + the amber-banner semantics).
 */
export function deriveTrustStatus(record: ContactRecord): TrustStatus {
  if (record.verified) return "verified";
  if (record.previousFingerprints.length > 0) return "changed";
  return "unverified";
}

/** Short list/row fingerprint: the first two 4-char groups (e.g. "A1B2 C3D4"). */
export function shortFingerprint(fp: Fingerprint): string {
  return truncateFingerprint(fp, 2);
}

/** Up-to-two-letter avatar initials from a contact's label (name), never mono. */
export function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

/** Absolute "key created" date (e.g. "Sep 12, 2025"). Locale-aware, no date-fns. */
export function deriveKeyCreatedLabel(createdAtIso: string): string {
  return new Date(createdAtIso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Adapt a persisted ContactRecord onto the presentational `ContactView` the screens consume. The
 * `previousFingerprint` key is OMITTED entirely (not set to undefined) unless the key changed, so a
 * fresh contact carries no prior fingerprint at all.
 */
export function contactRecordToContact(record: ContactRecord): ContactView {
  const status = deriveTrustStatus(record);
  const previous = record.previousFingerprints.at(-1);
  return {
    id: record.id,
    name: record.label,
    fingerprint: shortFingerprint(record.fingerprint),
    fullFingerprint: record.fingerprint,
    ...(status === "changed" && previous
      ? { previousFingerprint: shortFingerprint(previous) }
      : {}),
    status,
    keyCreated: deriveKeyCreatedLabel(record.createdAt),
  };
}
