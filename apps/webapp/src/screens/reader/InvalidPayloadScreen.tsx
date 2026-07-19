"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { INVALID_PAYLOAD_BODY, INVALID_PAYLOAD_TITLE } from "@/src/reader/copy";

// 33 · Invalid Payload. Shown when the link is STRUCTURALLY not a aesmsg link — a bad id (never
// reaches the network), a server 400 (bad_request), or a malformed payload envelope after decrypt.
// SECURITY: this is a structural signal, not a metadata leak — distinct from a valid-but-gone link
// (which is the opaque LinkUnavailable). It surfaces no server-derived metadata.

export interface InvalidPayloadScreenProps {
  onClose: () => void;
}

export function InvalidPayloadScreen({ onClose }: InvalidPayloadScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <MaterialIcon name="link_off" size={30} />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-h2 text-on-surface">{INVALID_PAYLOAD_TITLE}</h1>
          <p className="text-body-md text-on-surface-variant">{INVALID_PAYLOAD_BODY}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-outline-variant px-6 font-medium text-on-surface transition-colors hover:bg-surface-container"
        >
          Close
        </button>
      </div>
    </div>
  );
}
