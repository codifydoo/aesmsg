// Pure helper: format a fingerprint into fixed-size, space-separated groups laid out over a fixed
// number of lines — the identity-card presentation in design screen 40 (My Public Key), where the
// fingerprint renders as two centered mono lines:
//   E82F 4D11 A9C2 77BE
//   3A90 5FA1 0C8A 9E21
//
// Extracted (node-env testable, per the no-React-renderer convention) so MyPublicKeyScreen.tsx stays
// presentational. This is presentation-only chunking of an already-computed fingerprint string — it
// does NOT touch crypto (the fingerprint itself comes from @aesmsg/crypto's `fingerprint`).

/**
 * Split a fingerprint into `groupsPerLine` groups of `groupSize` hex chars per line.
 * Whitespace in the input is normalized first so the layout is independent of any spacing the
 * caller already applied. Trailing partial groups/lines are kept (never padded).
 *
 * - formatFingerprintLines("E82F4D11A9C277BE3A905FA10C8A9E21")
 *     -> ["E82F 4D11 A9C2 77BE", "3A90 5FA1 0C8A 9E21"]
 * - formatFingerprintLines("A1B2C3D4") -> ["A1B2 C3D4"]   (one short line)
 * - formatFingerprintLines("") -> []
 *
 * `groupSize` and `groupsPerLine` are clamped to >= 1 so a bad caller can never hang.
 */
export function formatFingerprintLines(value: string, groupSize = 4, groupsPerLine = 4): string[] {
  const clean = (value ?? "").replace(/\s+/g, "");
  if (clean.length === 0) return [];

  const size = Math.max(1, Math.floor(groupSize));
  const perLine = Math.max(1, Math.floor(groupsPerLine));

  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += size) {
    groups.push(clean.slice(i, i + size));
  }

  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += perLine) {
    lines.push(groups.slice(i, i + perLine).join(" "));
  }
  return lines;
}
