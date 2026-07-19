"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { InlineUnlock } from "@/src/components/InlineUnlock";
import { useIdentity } from "@/src/identity/use-identity";
import { type OpenAndDecryptOutput, openAndDecrypt } from "@/src/reader/open-and-decrypt";
import { classifyReaderError } from "@/src/reader/reader-error";
import { readLinkId } from "@/src/reader/reader-id";
import { DecryptionFailedScreen } from "./DecryptionFailedScreen";
import { InvalidPayloadScreen } from "./InvalidPayloadScreen";
import { LinkUnavailableScreen } from "./LinkUnavailableScreen";
import { NetworkErrorScreen } from "./NetworkErrorScreen";
import { NoIdentityScreen } from "./NoIdentityScreen";
import { ReaderLandingScreen } from "./ReaderLandingScreen";
import { SecureReaderScreen } from "./SecureReaderScreen";

// The recipient reader orchestrator (D3/D4/D5). It renders OUTSIDE AppShell and is NOT wrapped in
// RequireUnlocked — a recipient arrives from an external chat app and may have no identity at all, so
// redirecting no_identity→/onboarding or locked→/unlock would blow away the reader URL + its link id.
// Identity is handled INLINE.
//
// LINK-PREVIEW SAFETY / ZERO-NETWORK-BEFORE-ACTION: on mount the flow only parses the link id from
// the URL (no network) and renders the static landing. Nothing is fetched until the user taps "Open
// message". The tap gates on identity FIRST (D3) — a POST /open consumes the only view of a
// view-once link, so we NEVER POST before the identity is unlocked (no burning a view for a
// recipient who forgot their passphrase or has no identity).

type Phase =
  | "resolving"
  | "entry"
  | "no_identity"
  | "unlock"
  | "opening"
  | "decrypted"
  | "closed"
  | "gone"
  | "invalid"
  | "network"
  | "failed";

function CenteredStatus({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 py-12 text-center">
      <MaterialIcon name="progress_activity" size={32} className="animate-spin text-primary" />
      <p className="text-body-md text-on-surface-variant">{label}</p>
    </div>
  );
}

function ClosedStatus() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        <MaterialIcon name="lock" size={30} />
      </div>
      <p className="text-body-md text-on-surface-variant">
        This message has been closed and cleared from this device. You can close this tab.
      </p>
    </div>
  );
}

export function ReaderFlowScreen() {
  // useSearchParams supplies the dev `/l?id=` fallback and, by requiring a Suspense boundary under
  // output:'export', matches app/links/details/page.tsx. Production reads the id from the rewritten
  // location.pathname (below); the query is only the dev/local path.
  const searchParams = useSearchParams();
  // A STABLE primitive dep — useSearchParams returns a fresh object each render, so depending on the
  // object would re-run the resolve effect (and reset the phase) on every render. The serialized
  // query only changes when the actual params do.
  const search = searchParams.toString();
  const { state: identityState, identity } = useIdentity();

  const [phase, setPhase] = useState<Phase>("resolving");
  const [linkId, setLinkId] = useState<string | null>(null);
  const [output, setOutput] = useState<OpenAndDecryptOutput | null>(null);
  // Carries the tap's intent-to-open across the identity gate (D3): a locked recipient unlocks in
  // place and the flow auto-continues to the POST without a second tap.
  const [wantsOpen, setWantsOpen] = useState(false);
  // In-flight guard: the single-POST guarantee. A double-tap (or a retry mid-flight) issues at most
  // one open. A module-level open-coordinator (mobile) is unnecessary on web — the reader page is
  // NOT unmounted across a visibilitychange blur (it renders a cover), so a simple ref suffices.
  const inFlight = useRef(false);

  // Resolve the link id from the URL — ZERO network. Path (rewritten /l/<id>) wins; else ?id= (dev).
  // The `resolving`-only guard makes this idempotent: it only ever transitions AWAY from the initial
  // `resolving` phase, so it can never clobber a later phase (entry → opening → decrypted, etc.).
  useEffect(() => {
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const result = readLinkId(pathname, search ? `?${search}` : "");
    if (result.ok) {
      setLinkId(result.id);
      setPhase((current) => (current === "resolving" ? "entry" : current));
    } else {
      setPhase((current) => (current === "resolving" ? "invalid" : current));
    }
  }, [search]);

  const runOpen = useCallback(async () => {
    if (inFlight.current) return;
    if (linkId === null || identity === null) return;
    inFlight.current = true;
    setPhase("opening");
    try {
      const out = await openAndDecrypt(linkId, identity);
      setOutput(out);
      setPhase("decrypted");
    } catch (err) {
      // gone / invalid / network / failed — all opaque, metadata-free terminals.
      setPhase(classifyReaderError(err));
    } finally {
      inFlight.current = false;
    }
  }, [linkId, identity]);

  // Identity gate — applied BEFORE the open POST (D3). Runs when the user has signalled intent
  // (wantsOpen) and the identity state settles. A locked recipient is routed to the inline unlock
  // WITHOUT clearing wantsOpen, so when the unlock flips identity to `unlocked` this same effect
  // auto-continues to the open.
  useEffect(() => {
    if (!wantsOpen) return;
    if (identityState === "loading") return; // wait for IndexedDB to report
    if (identityState === "no_identity") {
      setWantsOpen(false);
      setPhase("no_identity");
      return;
    }
    if (identityState === "locked") {
      setPhase("unlock");
      return;
    }
    if (identityState === "unlocked" && identity !== null) {
      setWantsOpen(false);
      void runOpen();
    }
  }, [wantsOpen, identityState, identity, runOpen]);

  const handleWantOpen = useCallback(() => setWantsOpen(true), []);
  const handleClose = useCallback(() => {
    setOutput(null);
    setPhase("closed");
  }, []);
  const handleDone = useCallback(() => {
    // Drop the decrypted output — memory-only, never persisted (D6).
    setOutput(null);
    setPhase("closed");
  }, []);
  const handleRetry = useCallback(() => {
    void runOpen();
  }, [runOpen]);

  switch (phase) {
    case "resolving":
      return <CenteredStatus label="Preparing secure message…" />;
    case "entry":
      if (linkId === null) return <CenteredStatus label="Preparing secure message…" />;
      return <ReaderLandingScreen id={linkId} onOpen={handleWantOpen} />;
    case "no_identity":
      return <NoIdentityScreen />;
    case "unlock":
      return <InlineUnlock />;
    case "opening":
      return <CenteredStatus label="Decrypting on this device…" />;
    case "decrypted":
      if (output === null) return <CenteredStatus label="Decrypting on this device…" />;
      return (
        <SecureReaderScreen
          text={output.text}
          attachments={output.attachments}
          onDone={handleDone}
        />
      );
    case "gone":
      return <LinkUnavailableScreen onClose={handleClose} />;
    case "invalid":
      return <InvalidPayloadScreen onClose={handleClose} />;
    case "network":
      return <NetworkErrorScreen onRetry={handleRetry} onClose={handleClose} />;
    case "failed":
      return <DecryptionFailedScreen onClose={handleClose} />;
    case "closed":
      return <ClosedStatus />;
  }
}
