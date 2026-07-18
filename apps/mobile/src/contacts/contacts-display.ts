import { type Fingerprint, truncateFingerprint } from "@aesmsg/crypto";
import type { Contact, TrustStatus } from "@/src/contacts/contacts-data";
import type { ContactRecord } from "@/src/contacts/contacts-store";
import { formatFingerprintLines } from "@/src/keys/fingerprint-lines";
import { relativeTime } from "@/src/system/activity-data";

// Pure derived display for a persisted ContactRecord. NONE of this is stored — it is computed at
// render time so the on-disk blob stays the minimal label + key + trust state. No date-fns: the
// relative-time label reuses the kit's existing, unit-tested relativeTime helper.

/**
 * Trust status the row / detail / verify screens render. `verified` always wins; otherwise a
 * non-empty rotation history means the key CHANGED (amber "re-verify"), and a fresh-but-unverified
 * key is plain "unverified". Mirrors web's amber-banner semantics (previousFingerprints non-empty).
 */
export function deriveTrustStatus(record: ContactRecord): TrustStatus {
  if (record.verified) return "verified";
  if (record.previousFingerprints.length > 0) return "changed";
  return "unverified";
}

/**
 * Relative "last used" label. `lastUsedIso` is null when we have no usage signal yet (this slice has
 * no per-contact send history — Phase 3's sent-links is keyed by fingerprint, not contact id — so
 * callers pass null and we show "Never used"). When a timestamp IS available it is rendered via the
 * shared relativeTime helper (e.g. "3d", "Now").
 */
export function deriveLastUsedLabel(lastUsedIso: string | null, now: number): string {
  if (lastUsedIso === null) return "Never used";
  return relativeTime(new Date(lastUsedIso).getTime(), now);
}

/** Absolute "key created" date (e.g. "Sep 12, 2025"). Locale-aware, no date-fns. */
export function deriveKeyCreatedLabel(createdAtIso: string): string {
  return new Date(createdAtIso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Short list/row fingerprint: the first two 4-char groups (e.g. "A1B2 C3D4"). */
export function shortFingerprint(fp: Fingerprint): string {
  return truncateFingerprint(fp, 2);
}

/** Full fingerprint laid out as the verify-screen's stacked block: 4 groups per line, 2 lines. */
export function fullFingerprintLines(fp: Fingerprint): string[] {
  // The crypto fingerprint is "AM-XXXX-XXXX-...": strip the prefix + dashes, then group via the
  // existing fingerprint-lines helper so the verify card matches design screen 38's layout.
  return formatFingerprintLines(truncateFingerprint(fp, 8), 4, 4);
}

/**
 * Adapt a persisted ContactRecord onto the existing presentational `Contact` shape that the
 * list / detail / verify screens already consume — so those screens need only swap their data
 * source, not their JSX. `email` is intentionally omitted (mobile mirrors web's label + publicKey
 * model only). `lastUsed` is the "Never used" placeholder this slice (see deriveLastUsedLabel).
 */
export function contactRecordToContact(record: ContactRecord, now: number = Date.now()): Contact {
  // The most-recently rotated-away fingerprint (oldest-first array → last element), surfaced ONLY
  // when the key actually changed. Under exactOptionalPropertyTypes we omit the key entirely rather
  // than assign `undefined`, so a fresh contact carries no `previousFingerprint` at all.
  const previous = record.previousFingerprints.at(-1);
  return {
    id: record.id,
    name: record.label,
    fingerprint: shortFingerprint(record.fingerprint),
    fullFingerprint: fullFingerprintLines(record.fingerprint).join(" "),
    ...(previous ? { previousFingerprint: shortFingerprint(previous) } : {}),
    status: deriveTrustStatus(record),
    lastUsed: deriveLastUsedLabel(null, now),
    keyCreated: deriveKeyCreatedLabel(record.createdAt),
  };
}

export type { Contact, TrustStatus };
