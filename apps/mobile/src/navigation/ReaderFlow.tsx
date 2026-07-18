import { fingerprint as computeFingerprint } from "@aesmsg/crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMessage, type MessageMetadata, type OpenMessageResponse } from "@/src/api/client";
import { allPrivateKeysForDecrypt, decryptWithKeyFallback } from "@/src/identity/decrypt-keys";
import { useIdentity } from "@/src/identity/use-identity";
import {
  checkBiometricCapability,
  performBiometricConfirmation,
} from "@/src/onboarding/biometric-onboarding";
import { BiometricGateScreen } from "@/src/reader/BiometricGateScreen";
import { DECRYPT_GATE_PROMPT, DECRYPT_GATE_UNAVAILABLE_HINT } from "@/src/reader/copy";
import { DecryptingScreen } from "@/src/reader/DecryptingScreen";
import { DecryptionFailedScreen } from "@/src/reader/DecryptionFailedScreen";
import { decideDecryptGate, runDecryptGate } from "@/src/reader/decrypt-gate";
import { decryptOpenResponse, fetchOpenResponse } from "@/src/reader/fetch-and-open";
import { InvalidPayloadScreen } from "@/src/reader/InvalidPayloadScreen";
import { LandingScreen } from "@/src/reader/LandingScreen";
import { LinkUnavailableScreen } from "@/src/reader/LinkUnavailableScreen";
import { NetworkErrorScreen } from "@/src/reader/NetworkErrorScreen";
import { openCoordinator } from "@/src/reader/open-coordinator";
import { ReaderScreen } from "@/src/reader/ReaderScreen";
import { classifyReaderError } from "@/src/reader/reader-error";
import { type ReaderState, selectScreen } from "@/src/reader/reader-machine";
import { useSettings } from "@/src/settings/settings-context";

// Orchestrates the recipient flow for a deep-linked /l/:id, mirroring the web ReaderScreen state
// machine: loading → landing → opening → (gated) → decrypted | failed | gone, extended with the
// design's opaque terminal screens (network / invalid). The identity gate (handled in App)
// guarantees we only mount this when unlocked.
//
// FE-1 / R5 — the PER-DECRYPT biometric gate ("Require unlock before decrypting"). It slots in
// AFTER the open (the ciphertext is already held) and BEFORE the local decrypt, so it never
// re-issues an /open and the biometric prompt backgrounding the app resumes safely from the held
// ciphertext. Every post-open path funnels through proceedAfterOpen (below), which honours the
// setting: off → decrypt directly; on → biometric prompt, or honest "unavailable" copy if the
// device can no longer prompt (never a silent bypass). See @/src/reader/decrypt-gate.
//
// The state union + the state → screen mapping (selectScreen) live in @/src/reader/reader-machine,
// the error → outcome classification (classifyReaderError) in @/src/reader/reader-error, and the
// open-consumption logic (exactly-once /open + held ciphertext across an unmount) in
// @/src/reader/open-coordinator — all pure and unit-tested in Node.
//
// FE-2 / R7 — the /open POST CONSUMES one of a link's limited opens (a view-once link is destroyed
// after one open). Three benign paths used to re-issue it and permanently lose the message:
//   • Double-tap on "Open message" — now the coordinator issues exactly one POST (a second tap JOINS
//     the in-flight one), and the landing button disables itself after the first tap.
//   • Wrong-key retry — DecryptionFailed no longer has a retry; its only action is a non-consuming
//     Close, so a wrong key never burns another open.
//   • Background / auto-lock mid-open — the coordinator (module-level, above the lock gate) HOLDS the
//     fetched ciphertext across the unmount; on remount we resume from the held response and decrypt
//     locally with NO second POST. See the resume effect below.
//
// SECURITY: classifyReaderError NEVER distinguishes revoked / expired / max-opens (all → "gone" →
// LinkUnavailable); it only splits out genuinely non-leaky outcomes — a transport failure (network,
// no open consumed, retryable) and a structurally-malformed link (invalid, server 400). A wrong
// private key (DecryptionError) stays "failed" → DecryptionFailed, with no recovery.

export interface ReaderFlowProps {
  id: string;
  onDone: () => void;
}

export function ReaderFlow({ id, onDone }: ReaderFlowProps) {
  const { state: identity } = useIdentity();
  const { settings } = useSettings();
  const [state, setState] = useState<ReaderState>({ kind: "loading" });

  // Cancellation flag for THIS mount. A background→lock unmounts the reader; we then stop writing
  // state here. The open result itself lives in openCoordinator (module-level), so the next mount
  // resumes it without a second /open.
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Local decrypt of an already-fetched (held) open response — CONSUMES NO open. A wrong-key
  // DecryptionError routes to the opaque DecryptionFailed terminal (no recovery, no re-open).
  const decryptHeld = useCallback(
    async (response: OpenMessageResponse) => {
      if (identity.status !== "unlocked") return;
      setState({ kind: "opening" });
      try {
        // Try the ACTIVE key first, then each RETIRED key (2.4 key rotation): a link sealed to a
        // pre-rotation public key still opens because decryptOpenResponse re-derives the AAD context
        // from EACH tried key's own public key, reconstructing that key's exact legacy binding. This
        // is local-only (no /open) so iterating keys never consumes an additional open. When every
        // key is wrong, the fallback rethrows the last DecryptionError → classified "failed" below.
        const output = await decryptWithKeyFallback(allPrivateKeysForDecrypt(identity), (key) =>
          decryptOpenResponse(response, key, id),
        );
        if (!cancelledRef.current) setState({ kind: "decrypted", output });
      } catch (err) {
        if (cancelledRef.current) return;
        // Post-open LOCAL decrypt: the only meaningful failure is a wrong-key DecryptionError, which
        // is unrecoverable on this device and must NOT trigger another open. (A malformed envelope
        // maps to "invalid"; nothing here can be "gone" or "network".)
        const outcome = classifyReaderError(err, "open");
        setState({ kind: outcome === "invalid" ? "invalid" : "failed" });
      }
    },
    [identity, id],
  );

  // Per-decrypt biometric gate (FE-1 / R5) — the funnel between a fetched (held) open and the local
  // decrypt. Every post-open path (fresh open, resume-held, resume-in-flight) routes through here so
  // the guard is enforced once, in one place. It NEVER issues an /open (decryptHeld is local-only),
  // so the biometric prompt backgrounding the app is safe: a resume re-enters this funnel from the
  // held ciphertext with zero additional opens.
  //   • setting OFF  → decrypt directly (identity-level unlock already applied); no native probe.
  //   • setting ON   → probe capability, then show the biometric gate ("prompt") OR, if the device
  //                    can no longer prompt, honest "unavailable" copy — never a silent bypass.
  const proceedAfterOpen = useCallback(
    async (response: OpenMessageResponse) => {
      if (cancelledRef.current) return;
      if (!settings.requireUnlock) {
        await decryptHeld(response);
        return;
      }
      const cap = await checkBiometricCapability();
      if (cancelledRef.current) return;
      const decision = decideDecryptGate({ requireUnlock: true, capable: cap.capable });
      setState(
        decision === "unavailable"
          ? { kind: "gated", response, unavailable: true }
          : { kind: "gated", response },
      );
    },
    [settings.requireUnlock, decryptHeld],
  );

  // Load the safe metadata (never consumes an open). A failure is classified into the right opaque
  // terminal — gone / network / invalid — instead of collapsing everything to "gone".
  const loadMetadata = useCallback(async () => {
    if (identity.status !== "unlocked") return;
    setState({ kind: "loading" });
    try {
      const metadata = await getMessage(id);
      const myFingerprint = await computeFingerprint(identity.publicKeyString);
      if (!cancelledRef.current) setState({ kind: "landing", metadata, myFingerprint });
    } catch (err) {
      if (cancelledRef.current) return;
      const outcome = classifyReaderError(err, "metadata");
      if (outcome === "network") setState({ kind: "network" });
      else if (outcome === "invalid") setState({ kind: "invalid" });
      else setState({ kind: "gone" }); // gone (404/410) and the (unreachable) others stay opaque
    }
  }, [identity, id]);

  // The one open-consuming action, triggered only by the user tapping "Open message". The
  // coordinator guarantees exactly one /open POST per intended read.
  const tryOpen = useCallback(
    async (metadata: MessageMetadata, myFingerprint: string) => {
      setState({ kind: "opening" });
      const result = openCoordinator.begin(id, () => fetchOpenResponse(id));
      if (result.kind === "held") {
        // Already fetched (e.g. resumed after an interruption) — gate + decrypt the held ciphertext,
        // no POST. A rejection here can only come from the biometric-capability probe inside
        // proceedAfterOpen (it never issues a /open); route it through the same opaque terminals as
        // the POST path so it can't surface as an unhandled rejection.
        try {
          await proceedAfterOpen(result.response);
        } catch (err) {
          if (cancelledRef.current) return;
          const outcome = classifyReaderError(err, "open");
          if (outcome === "gone") setState({ kind: "gone" });
          else if (outcome === "network") setState({ kind: "network", metadata, myFingerprint });
          else if (outcome === "invalid") setState({ kind: "invalid" });
          else setState({ kind: "failed" });
        }
        return;
      }
      // "started" (this tap issued the single POST) or "joined" (a double-tap / resume joined the
      // in-flight POST — NO second POST). Both await the same promise.
      try {
        const response = await result.promise;
        if (cancelledRef.current) return;
        await proceedAfterOpen(response);
      } catch (err) {
        if (cancelledRef.current) return;
        // The open-consuming POST failed. 410/404 → opaque gone; 400 → invalid; transport / 5xx /
        // 429 → retryable network (carries metadata so a retry re-attempts without re-fetching it).
        const outcome = classifyReaderError(err, "open");
        if (outcome === "gone") setState({ kind: "gone" });
        else if (outcome === "network") setState({ kind: "network", metadata, myFingerprint });
        else if (outcome === "invalid") setState({ kind: "invalid" });
        else setState({ kind: "failed" });
      }
    },
    [id, proceedAfterOpen],
  );

  // On (re)mount — or when a new deep link swaps the id — RESUME an in-progress / completed open
  // instead of showing the landing and letting the user tap Open again; that second tap is what used
  // to double-consume after a background / lock interruption. The decision runs once per id (guarded
  // below) so an unrelated identity re-render can't re-drive it; it NEVER issues a /open regardless
  // (only tryOpen does). Only a fresh session (no coordinator entry) falls through to the landing.
  const decidedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (decidedIdRef.current === id) return;
    decidedIdRef.current = id;
    const existing = openCoordinator.peek(id);
    if (existing?.phase === "held" && existing.response) {
      // Held ciphertext → gate (if enabled) + decrypt locally, no POST. Guard the biometric-capability
      // probe inside proceedAfterOpen so a rejection routes to a safe terminal instead of surfacing as
      // an unhandled rejection — it never issues a /open, so exactly-once semantics are preserved.
      const heldResponse = existing.response;
      void (async () => {
        try {
          await proceedAfterOpen(heldResponse);
        } catch (err) {
          if (cancelledRef.current) return;
          const outcome = classifyReaderError(err, "open");
          if (outcome === "gone") setState({ kind: "gone" });
          else if (outcome === "invalid") setState({ kind: "invalid" });
          else setState({ kind: "network" });
        }
      })();
      return;
    }
    if (existing?.phase === "in-flight" && existing.promise) {
      // The POST issued before the interruption is still running — join it, never start a new one.
      const pending = existing.promise;
      setState({ kind: "opening" });
      void (async () => {
        try {
          const response = await pending;
          if (!cancelledRef.current) await proceedAfterOpen(response);
        } catch (err) {
          if (cancelledRef.current) return;
          const outcome = classifyReaderError(err, "open");
          if (outcome === "gone") setState({ kind: "gone" });
          else if (outcome === "invalid") setState({ kind: "invalid" });
          else setState({ kind: "network" });
        }
      })();
      return;
    }
    void loadMetadata();
  }, [id, proceedAfterOpen, loadMetadata]);

  // Retry from the network terminal: if the failure happened during the open phase we still hold the
  // metadata, so re-attempt the open (the coordinator reset to idle after the failed POST, so this
  // issues a fresh open); otherwise re-run the metadata load.
  const retryFromNetwork = (s: Extract<ReaderState, { kind: "network" }>) => {
    if (s.metadata && s.myFingerprint) {
      void tryOpen(s.metadata, s.myFingerprint);
    } else {
      void loadMetadata();
    }
  };

  // Dismiss the reader and forget the coordinator session (its held ciphertext is done with).
  const finish = () => {
    openCoordinator.clear(id);
    onDone();
  };

  if (identity.status !== "unlocked") return <DecryptingScreen />;

  // selectScreen owns the state → screen DECISION; the switch below only extracts the per-state
  // payload each screen needs (and narrows the union to do so). Each screen name is produced by
  // exactly one state.kind, so the asserted narrowing is total.
  const screen = selectScreen(state);
  switch (screen) {
    case "decrypting":
      return <DecryptingScreen />;
    case "gone":
      return <LinkUnavailableScreen onDone={finish} />;
    case "network": {
      if (state.kind !== "network") return null;
      return <NetworkErrorScreen onRetry={() => retryFromNetwork(state)} onCancel={finish} />;
    }
    case "invalid":
      return <InvalidPayloadScreen onClose={finish} onDone={finish} />;
    case "landing": {
      if (state.kind !== "landing") return null;
      return (
        <LandingScreen
          metadata={state.metadata}
          onOpen={() => tryOpen(state.metadata, state.myFingerprint)}
          onBack={finish}
        />
      );
    }
    case "gated": {
      if (state.kind !== "gated") return null;
      // Setting on but the device can no longer prompt: honest copy + safe exit, never a silent
      // bypass of the guard the user turned on.
      if (state.unavailable) {
        return (
          <BiometricGateScreen
            unavailable
            unavailableHint={DECRYPT_GATE_UNAVAILABLE_HINT}
            onCancel={finish}
          />
        );
      }
      // Prompt mode: authenticate THEN decrypt the HELD ciphertext locally (runDecryptGate enforces
      // that ordering and issues NO /open). On cancel/fail the screen stays gated for a no-cost
      // retry; Cancel exits to safety.
      const held = state.response;
      return (
        <BiometricGateScreen
          onAuthenticate={() =>
            runDecryptGate({
              authenticate: () => performBiometricConfirmation(DECRYPT_GATE_PROMPT),
              onAuthenticated: () => decryptHeld(held),
            })
          }
          onCancel={finish}
        />
      );
    }
    case "failed":
      // Wrong key — no recovery, and NO re-open. The only action is a non-consuming exit.
      return <DecryptionFailedScreen onClose={finish} />;
    case "reader": {
      if (state.kind !== "decrypted") return null;
      return (
        <ReaderScreen
          text={state.output.text}
          attachments={state.output.attachments}
          onDone={finish}
        />
      );
    }
  }
}

// NOTE: AlreadyOpenedScreen (31) is intentionally NOT rendered by this flow. The server cannot
// distinguish "opened out" from "expired / revoked" without leaking which a "no longer available"
// link is, so every such case routes to LinkUnavailable above. The screen ships presentationally
// (src/reader/AlreadyOpenedScreen.tsx) for a future, sanctioned non-leaky exhausted signal.
