"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { useRef, useState } from "react";
import { PrimaryButton } from "@/src/components/PrimaryButton";

// Reader entry landing (per secure_link_aesmsg, translated to the calm shipped voice). ZERO NETWORK
// ON MOUNT — this is the link-preview-safe surface a chat app's auto-fetch bot sees: no ciphertext,
// no metadata GET, nothing fetched. The encrypted message is fetched ONLY when the user taps
// "Open message" (which the flow gates on identity BEFORE issuing the single open-consuming POST).
//
// The view-once caution is STATIC, not metadata-driven — the landing has no pre-open metadata by
// design, so it can only say "some links open once" generically, never "this one opens once".

export interface ReaderLandingScreenProps {
  /** The public link id (a pointer, not a secret) — rendered in font-mono. */
  id: string;
  /** Explicit user intent to open. The flow handles the identity gate + the single POST. */
  onOpen: () => void;
}

export function ReaderLandingScreen({ id, onOpen }: ReaderLandingScreenProps) {
  // Double-tap guard: the first tap disables the button so a second rapid tap can't fire a second
  // onOpen before the flow transitions off the landing (defense-in-depth alongside the flow's
  // in-flight ref, which is the true single-POST guarantee).
  const [opening, setOpening] = useState(false);
  const firedRef = useRef(false);
  const handleOpen = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setOpening(true);
    onOpen();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
          <MaterialIcon name="encrypted" size={40} />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-h1 text-on-surface">Secure message</h1>
          <p className="text-body-md text-on-surface-variant">
            This link holds an end-to-end encrypted message. Decryption happens in your browser —
            only your device's private key can open it.
          </p>
        </div>

        <div className="w-full space-y-2 rounded-xl border border-warning/30 bg-warning/10 p-4 text-left">
          <div className="flex items-center gap-2 text-warning">
            <MaterialIcon name="visibility" size={18} />
            <span className="text-label-sm font-medium uppercase tracking-widest">
              Before you open
            </span>
          </div>
          <p className="text-body-md text-on-surface-variant">
            Some links can be opened only once. Opening now may use the only view.
          </p>
        </div>

        <code className="w-full break-all rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono text-mono-code text-on-surface-variant">
          {id}
        </code>

        <div className="w-full">
          <PrimaryButton icon="lock_open" onClick={handleOpen} loading={opening}>
            Open message
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
