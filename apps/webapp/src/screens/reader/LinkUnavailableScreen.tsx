"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { LINK_UNAVAILABLE_COPY } from "@/src/reader/copy";

// 30 · Link Unavailable (per link_expired_aesmsg). The SINGLE opaque terminal for revoked / expired
// / max-opens-exhausted / never-existed. SECURITY: it surfaces NO server-derived metadata — no
// reason, no id, no status, no counts — ONLY the fixed LINK_UNAVAILABLE_COPY. Nothing more.

export interface LinkUnavailableScreenProps {
  onClose: () => void;
}

export function LinkUnavailableScreen({ onClose }: LinkUnavailableScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <MaterialIcon name="link_off" size={32} />
        </div>
        <p className="text-body-lg text-on-surface">{LINK_UNAVAILABLE_COPY}</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-outline-variant px-6 font-medium text-on-surface transition-colors hover:bg-surface-container"
        >
          Done
        </button>
      </div>
    </div>
  );
}
