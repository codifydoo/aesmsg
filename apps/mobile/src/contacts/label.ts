// Pure label rules for a contact's display name. Extracted so BOTH contacts-store.ts (which throws
// InvalidLabelError) and contact-card.ts can share the rule WITHOUT contact-card importing
// contacts-store — that module pulls @/src/storage (native expo-secure-store / file-system) at load
// time, which would break contact-card's node tests. No native imports here on purpose.

export const MAX_LABEL_LEN = 80;

/** True when the trimmed label is 1..MAX_LABEL_LEN characters. */
export function isValidLabel(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_LABEL_LEN;
}

/** Trim and clamp a label to MAX_LABEL_LEN. Advisory normalization — may return "". */
export function normalizeLabel(raw: string): string {
  return raw.trim().slice(0, MAX_LABEL_LEN);
}
