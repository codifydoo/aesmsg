// Pure helper: chunk a fingerprint / public-key string into fixed-width groups for the Fingerprint
// primitive's JetBrains-mono block. Extracted (node-env testable) so the .tsx stays presentational.
//
// The design renders fingerprints like "A1B2 C3D4 E5F6 …" — short space-separated groups. When a
// caller already has grouped text it can pass it straight through; when it has a raw run of hex it
// passes it here. Whitespace in the input is normalized first so re-chunking is idempotent.

/**
 * Group a fingerprint string into `size`-character chunks joined by a single space.
 * - chunkFingerprint("A1B2C3D4") -> "A1B2 C3D4"   (default size 4)
 * - chunkFingerprint("A1B2 C3D4") -> "A1B2 C3D4"  (idempotent — existing spacing normalized)
 * - chunkFingerprint("") -> ""
 * `size` is clamped to >= 1 so a bad caller can never hang.
 */
export function chunkFingerprint(value: string, size = 4): string {
  const clean = (value ?? "").replace(/\s+/g, "");
  if (clean.length === 0) return "";
  const step = Math.max(1, Math.floor(size));
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += step) {
    groups.push(clean.slice(i, i + step));
  }
  return groups.join(" ");
}
