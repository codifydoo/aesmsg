import { MaterialIcon } from "@aesmsg/ui";
import type { DisplayStatus } from "@/src/links/link-status";

// Status → chip descriptor. D8 color semantics: green = active/safe, amber (warning) = expiring soon,
// red (error) = revoked (a destructive end-state — the mockup's Revoked row), neutral = expired /
// opened-out (inert end-states). Red is never used for an ambient/live state.
const DESCRIPTOR: Record<DisplayStatus, { label: string; icon: string; className: string }> = {
  active: {
    label: "Active",
    icon: "check_circle",
    className: "border-success/30 bg-success/10 text-success",
  },
  expiring: {
    label: "Expiring soon",
    icon: "schedule",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  opened_out: {
    label: "Opened",
    icon: "visibility",
    className: "border-outline-variant bg-surface-container-high text-on-surface-variant",
  },
  expired: {
    label: "Expired",
    icon: "history",
    className: "border-outline-variant bg-surface-container-high text-on-surface-variant",
  },
  revoked: {
    label: "Revoked",
    icon: "block",
    className: "border-error/30 bg-error/10 text-error",
  },
};

export function StatusChip({ status }: { status: DisplayStatus }) {
  const descriptor = DESCRIPTOR[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-label-sm uppercase tracking-widest ${descriptor.className}`}
    >
      <MaterialIcon name={descriptor.icon} size={14} />
      {descriptor.label}
    </span>
  );
}
