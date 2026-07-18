// Pure status -> chip-descriptor mapping for the Links tab.
//
// Extracted (per the node-env / no-React-renderer test convention) so the .tsx screens stay thin
// and the status->tone/icon/label branching is unit-tested directly (see tests/link-status.test.ts).
//
// Mirrors the design map in grp-links.jsx `LinkListRow`:
//   available -> ['green',  'check_circle', 'Available']
//   opened    -> ['violet', 'visibility',   'Opened']
//   expiring  -> ['amber',  'schedule',     'Expiring soon']
//   revoked   -> ['error',  'block',        'Revoked']
//   expired   -> ['neutral','history',      'Expired']
//   unknown   -> ['neutral','cloud_off',    'Status unknown']   (added: server unreachable)
//
// COLOR SEMANTICS (non-negotiable): green/emerald = available/safe, violet = informational (opened),
// amber/tertiary = expiring soon, error = revoked (a destructive end-state), neutral = inert (expired)
// AND "status unknown". "unknown" is the offline/unreachable state: the app could not confirm
// liveness against the server, so it renders NEUTRAL — never the red "revoked" alarm (FE-4/R4).

import type { ChipTone } from "@/src/components";

export type LinkStatus = "available" | "opened" | "expiring" | "revoked" | "expired" | "unknown";

export interface StatusDescriptor {
  /** Chip tone token used by the <Chip> primitive. */
  tone: ChipTone;
  /** Material Symbols icon name (design <Glyph>). */
  icon: string;
  /** Human-readable status label (shown in the chip, uppercased by the chip itself). */
  label: string;
}

const STATUS_MAP: Record<LinkStatus, StatusDescriptor> = {
  available: { tone: "green", icon: "check_circle", label: "Available" },
  opened: { tone: "violet", icon: "visibility", label: "Opened" },
  expiring: { tone: "amber", icon: "schedule", label: "Expiring soon" },
  revoked: { tone: "error", icon: "block", label: "Revoked" },
  expired: { tone: "neutral", icon: "history", label: "Expired" },
  unknown: { tone: "neutral", icon: "cloud_off", label: "Status unknown" },
};

/** Map a link status to its chip descriptor (tone, icon, label). */
export function statusDescriptor(status: LinkStatus): StatusDescriptor {
  return STATUS_MAP[status];
}

/**
 * Whether a row should render dimmed (~0.55 opacity). Per the design, revoked and expired links —
 * the inert end-states the user can no longer act on — are dimmed; everything else is full opacity.
 */
export function isDimmedStatus(status: LinkStatus): boolean {
  return status === "revoked" || status === "expired";
}

/**
 * Whether a row gets the 2px tertiary (amber) left border accent. Per the design only `expiring`
 * links carry this attention border.
 */
export function isExpiringStatus(status: LinkStatus): boolean {
  return status === "expiring";
}
