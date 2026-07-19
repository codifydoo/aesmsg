"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { NETWORK_ERROR_HINT, NETWORK_ERROR_TITLE } from "@/src/reader/copy";

// 32 · Network Error (retryable). Shown when the ciphertext couldn't be fetched — a transport
// failure or a transient status (429/5xx). SECURITY / TRUST: nothing was decrypted and NO open was
// consumed (rate-limit is checked before the store increments, and a transport failure never
// reached the store), so a retry re-issues a fresh POST. The reassurance uses the calm/safe tone
// (success color), never an alarming red — this is recoverable and non-destructive.

export interface NetworkErrorScreenProps {
  onRetry: () => void;
  onClose: () => void;
}

export function NetworkErrorScreen({ onRetry, onClose }: NetworkErrorScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <MaterialIcon name="cloud_off" size={38} />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-h2 text-on-surface">{NETWORK_ERROR_TITLE}</h1>
          <p className="text-body-md text-on-surface-variant">
            Your plaintext isn't at risk — nothing was decrypted, and this attempt didn't use one of
            the link's opens.
          </p>
        </div>
        <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-success">
          <MaterialIcon name="info" size={18} />
          <span className="text-label-sm font-medium">{NETWORK_ERROR_HINT}</span>
        </div>
        <div className="w-full space-y-3">
          <PrimaryButton icon="refresh" onClick={onRetry}>
            Try again
          </PrimaryButton>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-outline-variant px-6 font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
