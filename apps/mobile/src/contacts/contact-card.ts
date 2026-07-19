import { importPublicKey, type PublicKeyString } from "@aesmsg/crypto";
import { isValidLabel, normalizeLabel } from "@/src/contacts/label";
import { CACHE_FILE_PREFIX } from "@/src/reader/attachment-cache";

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

// --- Native-module surfaces (minimal; tests inject spies) --------------------------------------
// Same DI shape as keys/export-backup.ts + onboarding/import-backup.ts. The production expo modules
// are wider than these minimal interfaces; the wiring bridges them with `as unknown as`.

export interface FileSystemLike {
  readonly cacheDirectory: string | null;
  readonly EncodingType: { readonly UTF8: string };
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  readAsStringAsync(uri: string, options: { encoding: string }): Promise<string>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}

export interface SharingLike {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options?: { mimeType?: string; dialogTitle?: string }): Promise<void>;
}

export interface DocumentAssetLike {
  readonly uri: string;
  readonly name: string;
  readonly size?: number | null;
}
export interface DocumentPickerResultLike {
  readonly canceled: boolean;
  readonly assets: DocumentAssetLike[] | null;
}
export interface DocumentPickerLike {
  getDocumentAsync(options?: unknown): Promise<DocumentPickerResultLike>;
}

/** A written card file + a cleanup hook (captured before any handoff). */
export interface WrittenCard {
  readonly uri: string;
  cleanup(): Promise<void>;
}

/**
 * Write the plaintext card to a unique cache path (CACHE_FILE_PREFIX so the Settings "Clear local
 * history" sweep reclaims an orphan) and return its cleanup hook. The body is a non-secret public key,
 * but hygiene is kept uniform with the backup export.
 */
export async function writeCardToCache(
  deps: {
    FileSystem: Pick<FileSystemLike, "cacheDirectory" | "writeAsStringAsync" | "deleteAsync">;
  },
  card: ContactCardFile,
): Promise<WrittenCard> {
  const { FileSystem } = deps;
  const uri = `${FileSystem.cacheDirectory}${CACHE_FILE_PREFIX}${Date.now()}-${card.filename}`;
  await FileSystem.writeAsStringAsync(uri, card.contents);
  return { uri, cleanup: () => FileSystem.deleteAsync(uri, { idempotent: true }) };
}

/**
 * Present the system share sheet for an already-written card, gated on availability. A share rejection
 * (double-tap / platform error) is non-fatal and swallowed — the file is written and the caller holds
 * cleanup.
 */
export async function shareCard(deps: { Sharing: SharingLike }, uri: string): Promise<void> {
  const { Sharing } = deps;
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/octet-stream",
        dialogTitle: "Share contact card",
      });
    }
  } catch {
    // Intentionally ignored — non-fatal; file already written, caller holds cleanup.
  }
}

/** A card file the user selected, ready to read. */
export interface PickedCard {
  readonly uri: string;
  readonly name: string;
  readonly size: number;
}

/** Open the document picker; return the first selected file or null on cancel. */
export async function pickCardFile(deps: {
  DocumentPicker: DocumentPickerLike;
}): Promise<PickedCard | null> {
  const result = await deps.DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name, size: asset.size ?? 0 };
}

/** Read a picked card file as UTF-8 (its plaintext JSON body). */
export async function readCardFile(
  deps: { FileSystem: Pick<FileSystemLike, "EncodingType" | "readAsStringAsync"> },
  uri: string,
): Promise<string> {
  return deps.FileSystem.readAsStringAsync(uri, { encoding: deps.FileSystem.EncodingType.UTF8 });
}

/** Orchestrated pick → read → parse, so the UI (ContactsFlow) only routes on the outcome. */
export type ImportCardOutcome =
  | { readonly kind: "picked"; readonly card: ParsedContactCard }
  | { readonly kind: "canceled" }
  | { readonly kind: "error"; readonly reason: "invalid-file" | "wrong-file-type" };

export async function importContactCard(deps: {
  DocumentPicker: DocumentPickerLike;
  FileSystem: Pick<FileSystemLike, "EncodingType" | "readAsStringAsync">;
}): Promise<ImportCardOutcome> {
  const picked = await pickCardFile(deps);
  if (!picked) return { kind: "canceled" };
  let text: string;
  try {
    text = await readCardFile(deps, picked.uri);
  } catch {
    return { kind: "error", reason: "invalid-file" };
  }
  const parsed = await parseContactCard(text);
  return parsed.ok
    ? { kind: "picked", card: parsed.card }
    : { kind: "error", reason: parsed.reason };
}
