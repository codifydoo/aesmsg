import { fingerprint as computeFingerprint, type PublicKeyString } from "@aesmsg/crypto";
import { useEffect, useState } from "react";
import { formatFingerprintGroups } from "@/src/settings/settings-format";

// Key-derived identity presentation. A zero-knowledge keypair identity has no real "name", so the
// app shows an honest device label + an avatar derived from the real fingerprint — never a fake
// name. keyDerivedInitials is pure (node-tested); useShortFingerprint is the thin React hook that
// resolves the crypto fingerprint (the compute pattern previously duplicated in MyPublicKey /
// Advanced) and is exercised on-device, not by the renderer.

/** Honest primary label shown where a display name used to be ("You"). */
export const IDENTITY_LABEL = "This device";

/**
 * Avatar initials derived from a formatted short fingerprint — the first two alphanumeric
 * characters, uppercased. Never fake-personal; deterministic for a given key.
 *   keyDerivedInitials("E82F 4D11") -> "E8"
 *   keyDerivedInitials("")          -> "?"
 */
export function keyDerivedInitials(shortFingerprint: string): string {
  const alnum = (shortFingerprint ?? "").replace(/[^\p{L}\p{N}]/gu, "");
  if (alnum.length === 0) return "?";
  return alnum.slice(0, 2).toUpperCase();
}

/**
 * Resolve a public key's short fingerprint as the design's space-joined hex groups (default 4
 * groups, e.g. "E82F 4D11 A9C2 77BE"). Returns "" while resolving, when no key is provided, or on
 * failure (callers treat the label as informational, never a trust gate).
 */
export function useShortFingerprint(
  publicKeyString: PublicKeyString | undefined,
  groups = 4,
): string {
  const [shortFp, setShortFp] = useState("");
  useEffect(() => {
    if (!publicKeyString) {
      setShortFp("");
      return;
    }
    let cancelled = false;
    computeFingerprint(publicKeyString)
      .then((fp) => {
        if (!cancelled) setShortFp(formatFingerprintGroups(fp, groups));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicKeyString, groups]);
  return shortFp;
}
