import type { PublicKeyString } from "@aesmsg/crypto";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { addContact, listContacts } from "@/src/contacts/contacts-store";
import { ComposeScreen, type ComposeSubmit } from "@/src/create/ComposeScreen";
import { type CreateAndSealOutput, createAndSeal } from "@/src/create/create-and-seal";
import { createFailureMessage } from "@/src/create/create-outcome";
import { EncryptingScreen } from "@/src/create/EncryptingScreen";
import type { EncryptingPhase } from "@/src/create/encrypting-steps";
import { ResultScreen } from "@/src/create/ResultScreen";
import type { Recipient } from "@/src/create/recipient";
import { resultChipLabels } from "@/src/create/result-labels";
import { isUnknownRecipientFingerprint } from "@/src/create/result-save-contact";
import { revokeCreatedLink } from "@/src/create/revoke-created-link";
import { scheduleExpiryReminderOnCreate } from "@/src/notifications/expiry-reminder";
import { NotificationPrimer } from "@/src/notifications/NotificationPrimer";

// CreateFlow — the trust-critical compose → seal → result path. It hands the ComposeSubmit to
// createAndSeal and shows the returned web link. The Encrypting overlay reflects the real phase
// (via createAndSeal's onPhase) and can be CANCELLED: a cancel or an upload timeout returns to the
// preserved draft (ComposeScreen stays mounted throughout) with an honest inline error — never a
// dead overlay. On the result screen, "Revoke link" goes through the real authenticated revoke path
// (revokeCreatedLink). After a successful seal to an UNKNOWN recipient fingerprint, the result screen
// also offers "Save as contact".

type State =
  | { kind: "compose"; error: string | null }
  | { kind: "encrypting"; submit: ComposeSubmit; phase: EncryptingPhase }
  | { kind: "result"; out: CreateAndSealOutput; submit: ComposeSubmit };

export function CreateFlow({
  onExit,
  initialRecipient,
}: {
  onExit?: () => void;
  initialRecipient?: Recipient;
} = {}) {
  const [state, setState] = useState<State>({ kind: "compose", error: null });
  const [recipientUnknown, setRecipientUnknown] = useState(false);
  // Cancel plumbing: abortRef aborts the in-flight upload; cancelledRef tells the settling promise
  // that the user cancelled, so its resolution/rejection is turned into a silent return-to-draft.
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  async function submit(v: ComposeSubmit) {
    const controller = new AbortController();
    abortRef.current = controller;
    cancelledRef.current = false;
    setState({ kind: "encrypting", submit: v, phase: "prepare" });
    try {
      const out = await createAndSeal(v, {
        signal: controller.signal,
        onPhase: (phase) => setState((s) => (s.kind === "encrypting" ? { ...s, phase } : s)),
      });
      if (cancelledRef.current) return; // cancelled while settling — ignore the (already-created) link
      setState({ kind: "result", out, submit: v });
      // Fire-and-forget: schedule the local expiry reminder and persist its notification id onto the
      // link's record (so a later revoke can cancel it). Best-effort, never blocks the result.
      void scheduleExpiryReminderOnCreate({ id: out.id, expiresAt: v.expiresAt });
    } catch (err) {
      if (cancelledRef.current) {
        // User cancelled — return to the preserved draft with no scary error.
        setState({ kind: "compose", error: null });
        return;
      }
      setState({ kind: "compose", error: createFailureMessage(err) });
    } finally {
      abortRef.current = null;
    }
  }

  function cancelEncrypting() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setState({ kind: "compose", error: null });
  }

  // After a successful seal, decide whether to offer "Save as contact": only when the recipient
  // fingerprint isn't already a known (current or rotated-away) contact. A directory read failure
  // simply hides the CTA (never blocks the success screen).
  useEffect(() => {
    if (state.kind !== "result") {
      setRecipientUnknown(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const records = await listContacts();
      if (!cancelled) {
        setRecipientUnknown(isUnknownRecipientFingerprint(state.out.recipientFingerprint, records));
      }
    })().catch(() => {
      if (!cancelled) setRecipientUnknown(false);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.kind === "result") {
    const labels = resultChipLabels(state.submit.expiresAt, state.submit.maxOpens);
    const pk = state.submit.recipientPublicKeyString as PublicKeyString;
    return (
      <>
        <ResultScreen
          url={state.out.url}
          onNew={() => setState({ kind: "compose", error: null })}
          expiryLabel={labels.expiry}
          opensLabel={labels.opens}
          onRevoke={async () => {
            // Real authenticated revoke (BE-1 / R2): reuse revokeTrackedLink via revokeCreatedLink,
            // which folds 404/410 into success. A real failure rejects so ResultScreen keeps the
            // link live and shows the retry error.
            const result = await revokeCreatedLink(state.out.id);
            if (result !== "revoked") throw new Error("revoke_failed");
          }}
          {...(recipientUnknown
            ? {
                onSaveContact: async (label: string) => {
                  await addContact({ label, publicKey: pk });
                },
              }
            : {})}
        />
        <NotificationPrimer />
      </>
    );
  }

  const busy = state.kind === "encrypting";
  const error = state.kind === "compose" ? state.error : null;

  return (
    <View style={styles.root}>
      <ComposeScreen
        onSubmit={submit}
        busy={busy}
        error={error}
        onClose={onExit}
        {...(initialRecipient ? { initialRecipient } : {})}
      />
      {state.kind === "encrypting" ? (
        <View style={StyleSheet.absoluteFill}>
          <EncryptingScreen phase={state.phase} onCancel={cancelEncrypting} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
