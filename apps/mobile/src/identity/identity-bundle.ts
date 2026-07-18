import type { PublicKeyString, WrappedKey } from "@aesmsg/crypto";

// The multi-key identity model that backs real key rotation (PG-1 / roadmap 2.4).
//
// An identity is no longer a single keypair: it is ONE active keypair plus an ordered list of
// RETIRED keypairs. Rotation generates a fresh active keypair and pushes the previous active key
// onto the retired list — but the retired PRIVATE key is RETAINED (still device-secret-wrapped) so
// in-flight "legacy" links that were sealed to an older public key can still be opened. New sends /
// receives always use the active key; decryption falls back through the retired keys in order.
//
// This module is PURE (no crypto, no storage, no React): it owns only the retired-key data shape,
// its at-rest serialization, and the small list transforms rotation/unlock need. The device-secret
// wrapping, keychain persistence, and rotation orchestration live in the injected crypto/store and
// the identity-machine respectively.
//
// AT-REST NOTE: a RetiredKeyEntry stores the wrapped (device-secret-encrypted) old private key
// alongside its PUBLIC key string, PUBLIC-key fingerprint, and a retirement timestamp. The public
// key + fingerprint + timestamp are not secrets, so keeping them in cleartext in the retired blob is
// safe — exactly as the active WrappedKey envelope already carries the public key in cleartext. The
// private key never appears except inside `wrapped`, which keeps the SAME at-rest protection as the
// active key (never weakened).

export interface RetiredKeyEntry {
  /** The retired private key, device-secret-wrapped — same at-rest protection as the active key. */
  readonly wrapped: WrappedKey;
  /** The retired public key (amk1…). PUBLIC; used to rebuild the AAD context + to dedupe. */
  readonly publicKeyString: PublicKeyString;
  /** AM- fingerprint of `publicKeyString`. PUBLIC; surfaced for audit / display without unwrapping. */
  readonly fingerprint: string;
  /** When this key was retired (ms since epoch). PUBLIC. */
  readonly retiredAtMs: number;
}

// Versioned envelope for the retired-keys blob so the on-disk shape can evolve without ambiguity.
const RETIRED_BLOB_VERSION = 1;

interface RetiredBlob {
  readonly v: number;
  readonly keys: RetiredKeyEntry[];
}

function isRetiredKeyEntry(value: unknown): value is RetiredKeyEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.wrapped === "string" &&
    typeof e.publicKeyString === "string" &&
    typeof e.fingerprint === "string" &&
    typeof e.retiredAtMs === "number" &&
    Number.isFinite(e.retiredAtMs)
  );
}

/**
 * Serialize the retired-keys list to the versioned at-rest blob string. Retention policy is
 * KEEP-INDEFINITELY (see `prependRetired`): the list is persisted as-is, in newest-first order.
 */
export function serializeRetiredKeys(entries: readonly RetiredKeyEntry[]): string {
  const blob: RetiredBlob = { v: RETIRED_BLOB_VERSION, keys: [...entries] };
  return JSON.stringify(blob);
}

/**
 * Parse the retired-keys blob TOLERANTLY: `null`, empty, malformed JSON, an unknown version, or a
 * non-array `keys` all yield `[]` rather than throwing, and any individual malformed entry is
 * dropped. This is deliberate — a corrupt retired blob must NEVER be able to brick `unlock` (the
 * active key is the priority; at worst a legacy link becomes unopenable, which is recoverable).
 * Surviving entries are deduped by public key (newest kept).
 */
export function parseRetiredKeys(raw: string | null | undefined): RetiredKeyEntry[] {
  if (raw == null || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const blob = parsed as Partial<RetiredBlob>;
  if (blob.v !== RETIRED_BLOB_VERSION || !Array.isArray(blob.keys)) return [];
  const valid = blob.keys.filter(isRetiredKeyEntry);
  return dedupeRetired(valid);
}

/**
 * Drop later entries whose public key already appeared earlier — the FIRST (newest, since the list
 * is newest-first) occurrence wins. Guards against a crash-duplicate (a rotation interrupted between
 * its two writes can leave the same key both active and retired).
 */
export function dedupeRetired(entries: readonly RetiredKeyEntry[]): RetiredKeyEntry[] {
  const seen = new Set<string>();
  const out: RetiredKeyEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.publicKeyString)) continue;
    seen.add(entry.publicKeyString);
    out.push(entry);
  }
  return out;
}

/**
 * Prepend a just-retired key to the existing list (newest-first) and dedupe. KEEP-INDEFINITELY: no
 * entry is ever pruned here. Rotations are rare (a compromise / precaution event), each retired key
 * is tiny, and a link's lifetime can be "Never", so a retired key may be needed to open a legacy
 * link at any future time. (A future policy could prune entries retired longer ago than the maximum
 * possible link lifetime; that is intentionally NOT done now — see roadmap 2.4 step 5.)
 */
export function prependRetired(
  existing: readonly RetiredKeyEntry[],
  entry: RetiredKeyEntry,
): RetiredKeyEntry[] {
  return dedupeRetired([entry, ...existing]);
}

/**
 * Return the retired entries whose public key differs from `activePublicKey`. Used at unlock so the
 * decrypt-key set never contains the active key twice after a crash-interrupted rotation.
 */
export function retiredExcludingActive(
  entries: readonly RetiredKeyEntry[],
  activePublicKey: PublicKeyString,
): RetiredKeyEntry[] {
  return entries.filter((e) => e.publicKeyString !== activePublicKey);
}
