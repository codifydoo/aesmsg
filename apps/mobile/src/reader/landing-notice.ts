// Pure "opening cost" notice for the reader landing (FE-2 / R7).
//
// A view-once link (maxOpens === 1) — and the final remaining open of any capped link — is
// effectively DESTRUCTIVE: opening it consumes the only view and the message can never be opened
// again on any device. The landing must say so BEFORE the user taps Open, so an accidental tap
// doesn't silently burn a view-once secret.
//
// Extracted (per the node-env / no-React-renderer test convention) so the branching — view-once vs
// last-of-N vs unlimited — is unit-tested directly. Dependency-free (no react / react-native).
//
// COPY: calm and honest, no scary jargon. This is a CAUTION (amber), not a destructive/red action —
// the recipient chose to open a message; we're only warning that the view is limited.

// maxOpens < 0 means "unlimited until expiry" (the wire sentinel, mirrored by links/link-display.ts).
function isUnlimited(maxOpens: number): boolean {
  return maxOpens < 0;
}

export interface LandingNotice {
  /** True when opening now consumes the only / final available view. Drives the caution treatment. */
  lastView: boolean;
  /** The caution line shown above "Open message" when `lastView`; null otherwise. */
  warning: string | null;
  /** A neutral "X of N opens used" recap, or null for unlimited links (no count to show). */
  opensLabel: string | null;
}

export function landingNotice(metadata: { maxOpens: number; opensCount: number }): LandingNotice {
  const { maxOpens, opensCount } = metadata;

  // Unlimited: opening costs nothing scarce — no caution, no count (the expiry recap stands alone).
  if (isUnlimited(maxOpens)) {
    return { lastView: false, warning: null, opensLabel: null };
  }

  const remaining = Math.max(0, maxOpens - opensCount);
  const opensLabel = `${opensCount} of ${maxOpens} opens used`;

  // View-once: the strongest, most common single-open case.
  if (maxOpens === 1) {
    return {
      lastView: true,
      warning:
        "This message can be opened once. Opening it now uses that view — it can't be opened again on any device.",
      opensLabel,
    };
  }

  // Final remaining open of a capped multi-open link.
  if (remaining <= 1) {
    return {
      lastView: true,
      warning: "This is the last available open. After you open it, it can't be opened again.",
      opensLabel,
    };
  }

  return { lastView: false, warning: null, opensLabel };
}
