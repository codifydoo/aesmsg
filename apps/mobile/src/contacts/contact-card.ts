import { importPublicKey, type PublicKeyString } from "@aesmsg/crypto";
import { isValidLabel, normalizeLabel } from "@/src/contacts/label";

// Contact-card vertical: build a PLAINTEXT `.aesmsg` card (my public key + a chosen name) and parse a
// received one. A public key is non-secret, so — unlike the identity BACKUP file (an encrypted
// WrappedKey envelope that shares the .aesmsg extension) — the card is plaintext JSON with a `type`
// tag. The importer distinguishes the two by that tag, and NEVER trusts a fingerprint from the file:
// parse returns only { label, publicKey }; addContact recomputes the fingerprint from the key.
//
// Pure + node-testable: imports only @aesmsg/crypto and the pure label module (plus CACHE_FILE_PREFIX
// for the write helper in the native-surfaces section). Native modules are dependency-injected.

export const CONTACT_CARD_TYPE = "aesmsg.contact-card";
export const CONTACT_CARD_VERSION = 1;
/** Fixed share filename. No user text in the name → no sanitization edge cases, nothing leaked. */
export const CONTACT_CARD_FILENAME = "aesmsg-contact-card.aesmsg";

/** Thrown by buildContactCard for an empty / over-long name (a backstop; the UI gates the field). */
export class InvalidContactCardError extends Error {
  override name = "InvalidContactCardError";
}

/** A built card: the share filename + the plaintext JSON body. */
export interface ContactCardFile {
  readonly filename: typeof CONTACT_CARD_FILENAME;
  readonly contents: string;
}

/**
 * Bundle my public key + a display name into a plaintext contact-card JSON body. Trims the label and
 * rejects empty / >80-char names with InvalidContactCardError. Never encrypts — a public key is not a
 * secret.
 */
export function buildContactCard(label: string, publicKey: PublicKeyString): ContactCardFile {
  if (!isValidLabel(label)) {
    throw new InvalidContactCardError("Contact card name must be 1–80 characters");
  }
  const contents = JSON.stringify({
    type: CONTACT_CARD_TYPE,
    version: CONTACT_CARD_VERSION,
    label: label.trim(),
    publicKey,
  });
  return { filename: CONTACT_CARD_FILENAME, contents };
}

/** A parsed card, ready to hand to the add-contact flow. Carries no fingerprint by design. */
export interface ParsedContactCard {
  readonly label: string;
  readonly publicKey: PublicKeyString;
}

/**
 * Outcome of parsing a picked file. `wrong-file-type` is where a mistakenly-picked identity backup or
 * unrelated JSON lands (no / different `type` tag); `invalid-file` covers non-JSON and a malformed
 * key. Result union mirrors onboarding/import-backup.ts RestoreResult so the caller avoids try/catch.
 */
export type ParseCardResult =
  | { readonly ok: true; readonly card: ParsedContactCard }
  | { readonly ok: false; readonly reason: "invalid-file" | "wrong-file-type" };

export async function parseContactCard(text: string): Promise<ParseCardResult> {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-file" };
  }
  if (typeof obj !== "object" || obj === null) return { ok: false, reason: "invalid-file" };
  const record = obj as Record<string, unknown>;
  if (record.type !== CONTACT_CARD_TYPE) return { ok: false, reason: "wrong-file-type" };
  const rawKey = record.publicKey;
  if (typeof rawKey !== "string") return { ok: false, reason: "invalid-file" };
  try {
    await importPublicKey(rawKey); // authoritative validation; throws on a malformed / non-amk1 key
  } catch {
    return { ok: false, reason: "invalid-file" };
  }
  // Label is advisory: normalize (trim+clamp); the importer edits it before saving, so a missing /
  // odd label still yields an importable card (just unnamed).
  const label = typeof record.label === "string" ? normalizeLabel(record.label) : "";
  return { ok: true, card: { label, publicKey: rawKey as PublicKeyString } };
}
