// Pure helper: derive up-to-2-letter initials from a display name, for the Avatar primitive.
// Extracted (per the node-env / no-React-renderer test convention) so the .tsx stays thin and the
// branching — empty input, single token, multi-token, non-letter stripping — is unit-tested here.
//
// (There is no existing deriveInitials helper in src/ — this is the first one; Avatar consumes it.)

/**
 * Derive display initials from a person/contact name.
 * - "Ada Lovelace" -> "AL"
 * - "ada" -> "A"
 * - "Jean-Luc Picard" -> "JP" (first letter of first + last meaningful token)
 * - "" / whitespace / no letters -> "?" (never empty, never crashes)
 * Always returns uppercase, at most 2 characters.
 */
export function deriveInitials(name: string): string {
  const tokens = (name ?? "")
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length > 0);

  const first = tokens[0];
  if (first === undefined) return "?";
  if (tokens.length === 1) return first.slice(0, 1).toUpperCase();

  const last = tokens[tokens.length - 1] ?? first;
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}
