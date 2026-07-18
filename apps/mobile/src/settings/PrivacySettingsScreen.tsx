import { useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { AppBar, Card, ListGroup, ListRow, Screen, SectionLabel } from "@/src/components";
// Read-only reuse of the Links data layer: the production revoke wiring + token lookup (BE-1 / R2)
// and the tracked-links source. This screen never mutates that module — it drives the same helpers
// the Links tab uses so revoke-before-wipe authenticates identically.
import { listSentLinks } from "@/src/links/sent-links-store";
import { productionSentLinksDeps, revokeTrackedLink } from "@/src/links/use-sent-links";
import { SwitchRow } from "@/src/settings/SwitchRow";
import { useSettings } from "@/src/settings/settings-context";
import { WipeConfirmModal, type WipePhase } from "@/src/settings/WipeConfirmModal";
import {
  revokeAllThenWipe,
  selectLiveTrackedLinks,
  type WipeLinkRef,
} from "@/src/settings/wipe-orchestration";
import { colors } from "@/src/theme";

// 47 · Privacy Settings (grp-settings.jsx → S_PrivacySettings). AppBar "Privacy", an end-to-end /
// ciphertext-only explainer card, an on-device "Clear local history" row, a "Share anonymous
// analytics" toggle (OFF by default, per the design), and a red Danger-zone "Wipe this device's
// identity" row.
//
// The wipe is device-local: there is no server-side account to delete. Before destroying the
// identity we get the user's LAST chance to revoke their outstanding links — wiping also destroys the
// per-link revocation tokens (BE-1 / R2), so once it's done any un-revoked link is live and
// unrevokable until it expires. The WipeConfirmModal walks the phases (confirm → revoking → maybe a
// failures acknowledgement → wiping); the pure revokeAllThenWipe orchestration enforces the ordering.
// "Clear local history" is gated behind a native Alert confirm then calls onClearHistory — purges the
// opened-message attachment cache + the locally-tracked sent-links blob (server links unaffected).

export interface PrivacySettingsScreenProps {
  onBack?: (() => void) | undefined;
  /**
   * Purge this device's identity + keys + local data. Called LAST by the orchestration, only after
   * the revoke pass (and any required acknowledgement). May be async — it is awaited.
   */
  onWipe?: (() => void | Promise<void>) | undefined;
  /** Clear locally-cached opened messages + links (Alert confirm → calls this raw action). */
  onClearHistory?: (() => void | Promise<void>) | undefined;
}

const noop = () => {};

export function PrivacySettingsScreen({
  onBack,
  onWipe,
  onClearHistory,
}: PrivacySettingsScreenProps) {
  // Analytics opt-in is PERSISTED but persist-only this slice: no analytics SDK exists, nothing is
  // ever sent (spec §4 honest matrix). The toggle reflects + stores the preference only.
  const { settings, update } = useSettings();

  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<WipePhase>({ kind: "confirm" });
  const [liveLinks, setLiveLinks] = useState<WipeLinkRef[]>([]);

  // The failures-acknowledgement gate resolves through this ref: revokeAllThenWipe awaits a promise
  // whose resolver we stash here, then the modal's buttons settle it. `retryRef` records whether a
  // "not wiped" outcome was a Try-again (re-run the pass) or a Cancel (close).
  const proceedResolverRef = useRef<((proceed: boolean) => void) | null>(null);
  const retryRef = useRef(false);

  const confirmClear = () => {
    Alert.alert(
      "Clear local history?",
      "This removes opened messages and locally cached links from this device. Links you've already shared keep working for recipients.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await onClearHistory?.();
            Alert.alert(
              "Local history cleared",
              "Opened messages and cached links have been removed from this device.",
            );
          },
        },
      ],
    );
  };

  // Open the wipe flow: show the confirm phase and load the live tracked links we'll try to revoke
  // first, so the confirm copy can name the count. Enumeration failure degrades to "none to revoke"
  // — the wipe is still allowed (it must never be blocked by a link-store read).
  const openWipe = async () => {
    setPhase({ kind: "confirm" });
    setConfirming(true);
    try {
      const records = await listSentLinks();
      setLiveLinks(selectLiveTrackedLinks(records, Date.now()));
    } catch {
      setLiveLinks([]);
    }
  };

  const closeWipe = () => {
    proceedResolverRef.current = null;
    retryRef.current = false;
    setConfirming(false);
    setPhase({ kind: "confirm" });
  };

  // Drive one revoke-then-wipe pass over `links`. Recurses on Try-again with only the still-failing
  // links so already-revoked ones aren't re-attempted.
  const runWipe = async (links: WipeLinkRef[]): Promise<void> => {
    setPhase({ kind: "revoking", done: 0, total: links.length });
    const result = await revokeAllThenWipe({
      listLinksToRevoke: async () => links,
      // Reuse the Links tab's authenticated revoke (looks up + sends the per-link token).
      revoke: (id) => revokeTrackedLink(productionSentLinksDeps, id),
      onProgress: (done, total) => setPhase({ kind: "revoking", done, total }),
      confirmProceedDespiteFailures: (failures) =>
        new Promise<boolean>((resolve) => {
          proceedResolverRef.current = resolve;
          setPhase({ kind: "failures", failures });
        }),
      wipe: async () => {
        setPhase({ kind: "wiping" });
        await onWipe?.();
      },
    });

    if (result.wiped) {
      // The identity provider transitions to no_identity and this screen unmounts; close defensively.
      closeWipe();
      return;
    }
    // Declined at the failures gate: Try-again re-runs over the still-failing links; Cancel closes.
    if (retryRef.current) {
      retryRef.current = false;
      await runWipe(result.failures.map((f) => f.link));
      return;
    }
    closeWipe();
  };

  // Settle the failures gate promise (guards against a stale double-settle).
  const settleFailureGate = (proceed: boolean) => {
    const resolve = proceedResolverRef.current;
    proceedResolverRef.current = null;
    resolve?.(proceed);
  };

  return (
    <Screen topInset={false}>
      <AppBar title="Privacy" onLeading={onBack ?? noop} />

      <View style={styles.stack}>
        <Card style={styles.explainerCard}>
          <Text style={styles.explainer}>
            Your messages are end-to-end encrypted. The server only ever holds ciphertext — no
            plaintext, no metadata about what you sent.
          </Text>
        </Card>

        <View>
          <SectionLabel>On this device</SectionLabel>
          <ListGroup>
            <ListRow
              icon="delete_sweep"
              title="Clear local history"
              sub="Removes opened messages and cached links."
              onPress={confirmClear}
            />
          </ListGroup>
        </View>

        <View>
          <SectionLabel>Diagnostics</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="bar_chart"
              title="Share anonymous analytics"
              sub="Off by default. Never includes content. (Not yet active — nothing is sent.)"
              value={settings.analytics}
              onValueChange={(v) => update({ analytics: v })}
            />
          </ListGroup>
        </View>

        <View>
          <Text style={styles.dangerLabel}>Danger zone</Text>
          <View style={styles.dangerGroup}>
            <ListRow
              icon="delete_forever"
              iconColor={colors.error}
              title={<Text style={styles.dangerTitle}>Wipe this device's identity</Text>}
              sub="Deletes your keys from this device. We try to revoke your live links first; any we can't stay live until they expire."
              onPress={() => void openWipe()}
            />
          </View>
        </View>
      </View>

      <WipeConfirmModal
        visible={confirming}
        phase={phase}
        liveLinkCount={liveLinks.length}
        onCancel={() => {
          // In the failures phase the cancel settles the gate (abort → runWipe closes); in the idle
          // confirm phase there's no run in flight, so close directly.
          if (proceedResolverRef.current) {
            retryRef.current = false;
            settleFailureGate(false);
          } else {
            closeWipe();
          }
        }}
        onConfirm={() => void runWipe(liveLinks)}
        onProceedDespiteFailures={() => {
          retryRef.current = false;
          settleFailureGate(true);
        }}
        onRetry={() => {
          retryRef.current = true;
          settleFailureGate(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  explainerCard: { padding: 16 },
  explainer: { fontSize: 15, lineHeight: 23, color: colors.onSurfaceVariant },
  // Danger-zone label uses the error tint (the design overrides .psec-label color to --error).
  dangerLabel: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.72,
    textTransform: "uppercase",
    color: colors.error,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  // Group border tinted red (rgba(255,180,171,.2)) like the design's danger lgroup.
  dangerGroup: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: "rgba(255,180,171,0.2)",
    borderRadius: 12,
    overflow: "hidden",
  },
  dangerTitle: { fontSize: 15, color: colors.error },
});
