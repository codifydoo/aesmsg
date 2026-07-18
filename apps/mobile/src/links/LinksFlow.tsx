import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button, Screen } from "@/src/components";
import { DeleteLinkConfirmSheet } from "@/src/links/DeleteLinkConfirmSheet";
import { LinkDetailsScreen } from "@/src/links/LinkDetailsScreen";
import { LinksEmptyScreen } from "@/src/links/LinksEmptyScreen";
import { LinksListScreen } from "@/src/links/LinksListScreen";
import { RevokeConfirmSheet } from "@/src/links/RevokeConfirmSheet";
import { useSentLinks } from "@/src/links/use-sent-links";
import { colors } from "@/src/theme";

// LinksFlow — the Links tab's internal stack, now backed by the real encrypted sent-links store +
// server reconciliation via useSentLinks(). Self-contained navigation (no react-navigation; the
// Integration phase owns the tab shell). Routes:
//   list   <-> details   (tap a row / back)
//   details -> revoke sheet (Revoke link -> purge server-side + drop locally -> back to list)
//   empty / loading / error  (store + fetch lifecycle states)
//
// `onCreate` (empty-state CTA) is wired by App to navigate to the Encrypt tab's compose flow.

type Route = { name: "list" } | { name: "details"; id: string };

export interface LinksFlowProps {
  /** Navigate to the Encrypt tab's compose flow (wired by App). */
  onCreate?: () => void;
}

export function LinksFlow({ onCreate }: LinksFlowProps = {}) {
  const { links, loading, error, offline, refresh, revokeAndDelete, deleteLocal } = useSentLinks();
  const [route, setRoute] = useState<Route>({ name: "list" });
  const [revokeVisible, setRevokeVisible] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const selected = route.name === "details" ? (links.find((l) => l.id === route.id) ?? null) : null;

  function openLink(id: string) {
    setRoute({ name: "details", id });
  }

  function backToList() {
    setRevokeVisible(false);
    setRevokeError(null);
    setDeleteVisible(false);
    setRoute({ name: "list" });
  }

  function openRevoke() {
    setRevokeError(null);
    setRevokeVisible(true);
  }

  function cancelRevoke() {
    if (revoking) return; // don't dismiss mid-request
    setRevokeVisible(false);
    setRevokeError(null);
  }

  async function confirmRevoke() {
    if (!selected || revoking) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const result = await revokeAndDelete(selected.id);
      if (result === "revoked") {
        setRevokeVisible(false);
        setRoute({ name: "list" });
      } else {
        // Real failure (offline / server fault): keep the sheet open, the link live, and offer retry.
        setRevokeError("Couldn't revoke the link. Check your connection and try again.");
      }
    } finally {
      setRevoking(false);
    }
  }

  async function confirmDelete() {
    const id = selected?.id;
    setDeleteVisible(false);
    if (id) await deleteLocal(id);
    setRoute({ name: "list" });
  }

  // Initial load — show a spinner (avoids a flash of the empty state).
  if (loading && links.length === 0) {
    return (
      <Screen contentStyle={styles.fill}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  // Non-fatal load failure (local store unreadable). Honest copy + retry — never a silent wipe.
  if (error && links.length === 0) {
    return (
      <Screen contentStyle={styles.fill}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't load your links</Text>
          <Text style={styles.errorBody}>
            Your link history couldn't be read on this device. Your data hasn't been deleted.
          </Text>
          <Button kind="outline" onPress={() => void refresh()} style={styles.retry}>
            Retry
          </Button>
        </View>
      </Screen>
    );
  }

  // Empty state — no links at all.
  if (links.length === 0) {
    return <LinksEmptyScreen onCreate={() => onCreate?.()} />;
  }

  // Details route (falls back to the list if the selected id was deleted/refreshed away).
  if (route.name === "details" && selected) {
    return (
      <>
        <LinkDetailsScreen
          link={selected}
          onBack={backToList}
          onRevoke={openRevoke}
          onDelete={() => setDeleteVisible(true)}
        />
        <RevokeConfirmSheet
          visible={revokeVisible}
          link={selected}
          busy={revoking}
          error={revokeError}
          onCancel={cancelRevoke}
          onConfirm={() => void confirmRevoke()}
        />
        <DeleteLinkConfirmSheet
          visible={deleteVisible}
          link={selected}
          onCancel={() => setDeleteVisible(false)}
          onConfirm={() => void confirmDelete()}
        />
      </>
    );
  }

  // Default: the list, with pull-to-refresh. `offline` surfaces the "couldn't reach the server"
  // banner so rows read as last-known/"unknown" rather than a false "Revoked". The hook also reloads
  // on mount + after every mutation.
  return (
    <LinksListScreen
      links={links}
      onOpenLink={openLink}
      offline={offline}
      refreshing={loading}
      onRefresh={() => void refresh()}
    />
  );
}

export default LinksFlow;

const styles = StyleSheet.create({
  fill: {
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 22,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.onSurface,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 300,
  },
  retry: {
    marginTop: 8,
    width: "auto",
    paddingHorizontal: 24,
    alignSelf: "center",
  },
});
