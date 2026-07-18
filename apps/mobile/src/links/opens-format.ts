// Pure opens-count formatting for the Links tab.
//
// Extracted (per the node-env / no-React-renderer test convention) so the list row stays thin and
// the unlimited (∞) branch is unit-tested directly (see tests/opens-format.test.ts).
//
// Mirrors the design strings in grp-links.jsx `S_LinksList`:
//   "0/3 opens", "1/3 opens", "1/∞ opens" (unlimited), "2/3 opens".
// On the detail screen the same data renders as "1 of 3" (see formatOpensUsed).

/**
 * Compact "used/max opens" label for a list row.
 * - formatOpens(0, 3)    -> "0/3 opens"
 * - formatOpens(1, null) -> "1/∞ opens"   (null max = unlimited until expiry)
 */
export function formatOpens(used: number, max: number | null): string {
  const cap = max === null ? "∞" : String(max);
  return `${used}/${cap} opens`;
}

/**
 * Verbose "used of max" label for the detail screen.
 * - formatOpensUsed(1, 3)    -> "1 of 3"
 * - formatOpensUsed(1, null) -> "1 of ∞"
 */
export function formatOpensUsed(used: number, max: number | null): string {
  const cap = max === null ? "∞" : String(max);
  return `${used} of ${cap}`;
}
