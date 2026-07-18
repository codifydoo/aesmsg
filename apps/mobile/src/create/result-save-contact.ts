import type { Fingerprint } from "@aesmsg/crypto";
import type { ContactRecord } from "@/src/contacts/contacts-store";

// Pure eligibility check for the "Save as contact" CTA on the Link Created screen (17). The CTA is
// offered ONLY when the recipient fingerprint we just sealed to is not already known — neither a
// saved contact's current fingerprint nor any contact's rotated-away (previous) fingerprint. A
// rotated-away match is intentionally treated as "known": re-saving a key a contact deliberately
// rotated away is the security event web surfaces, not a convenience prompt.
export function isUnknownRecipientFingerprint(
  fingerprint: Fingerprint,
  contacts: ContactRecord[],
): boolean {
  for (const c of contacts) {
    if (c.fingerprint === fingerprint) return false;
    if (c.previousFingerprints.includes(fingerprint)) return false;
  }
  return true;
}
