import { StyleSheet, Text, View } from "react-native";
import {
  type BillingInterval,
  formatLiveRenewalLine,
  formatPlanLabel,
} from "@/src/account/account-format";
import { AppBar, Button, Card, Chip, Icon, ListGroup, ListRow, Screen } from "@/src/components";
import {
  isRestoreInFlight,
  type RestorePhase,
  restoreStatusMessage,
} from "@/src/pro/purchase-state";
import { colors } from "@/src/theme";

// 52 · Manage Subscription (grp-account.jsx → S_ManageSub). AppBar "Subscription", a current-plan
// card (plan label + Active chip + renewal line + App-Store billing note), a "Change plan" button, a
// "Restore purchases" row, and — pushed to the bottom — a destructive "Cancel subscription" row that
// opens the App Store (external).
//
// The plan snapshot (interval + renewsAt) is the LIVE entitlement, passed in by AccountFlow from the
// store, and the renewal PRICE is the live store `displayPrice` (never a fabricated amount — PG-8);
// when the live price isn't available the line is shown price-free. Change/Cancel deep-link to the OS
// subscription settings (Apple / Play); Restore re-queries the store and reflects progress + result.
// Cancel is destructive → error color, per the color-semantics invariant (red = destructive).

export interface ManageSubscriptionScreenProps {
  /** Billing interval of the active Pro subscription. */
  interval?: BillingInterval | undefined;
  /** Next renewal date, or null when the store doesn't expose one (e.g. Android). */
  renewsAt?: Date | null | undefined;
  /** Live store-localized price for the active interval; absent → a price-free renewal line. */
  livePrice?: string | undefined;
  /** In-flight / result state of a restore (drives the row's progress + "restored / none found"). */
  restorePhase?: RestorePhase | undefined;
  onBack?: (() => void) | undefined;
  /** Open the paywall to switch interval / tier. */
  onChangePlan?: (() => void) | undefined;
  /** Restore a prior purchase. */
  onRestore?: (() => void) | undefined;
  /** Open the App Store subscription management to cancel (external). */
  onCancel?: (() => void) | undefined;
}

const noop = () => {};
const IDLE_RESTORE: RestorePhase = { kind: "idle" };

export function ManageSubscriptionScreen({
  interval = "annual",
  renewsAt = null,
  livePrice,
  restorePhase = IDLE_RESTORE,
  onBack,
  onChangePlan,
  onRestore,
  onCancel,
}: ManageSubscriptionScreenProps) {
  const planLabel = formatPlanLabel("Pro", interval);
  const renewalLine = formatLiveRenewalLine(livePrice, interval, renewsAt);
  const restoring = isRestoreInFlight(restorePhase);
  const restoreStatus = restoreStatusMessage(restorePhase);

  return (
    <Screen topInset={false} contentStyle={styles.content}>
      <AppBar title="Subscription" onLeading={onBack ?? noop} />

      <Card style={styles.planCard}>
        <Text style={styles.label}>Current plan</Text>
        <View style={styles.planHead}>
          <Text style={styles.planName}>{planLabel}</Text>
          <Chip tone="green" icon="check_circle">
            Active
          </Chip>
        </View>
        <Text style={styles.renewal}>{renewalLine}</Text>
        <View style={styles.billingNote}>
          <Icon name="lock" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.billingText}>
            Billing is handled by the App Store. aesmsg never sees your card.
          </Text>
        </View>
      </Card>

      <Button kind="outline" onPress={onChangePlan ?? noop}>
        Change plan
      </Button>

      <ListGroup>
        <ListRow
          icon="restore"
          title={restoring ? "Restoring…" : "Restore purchases"}
          sub={restoreStatus && !restoring ? restoreStatus.text : undefined}
          onPress={restoring ? noop : (onRestore ?? noop)}
        />
      </ListGroup>

      {/* Spacer pushes the destructive action to the bottom, matching the design's flex spacer. */}
      <View style={styles.spacer} />

      <ListGroup>
        <ListRow
          icon="cancel"
          iconColor={colors.error}
          title={<Text style={styles.cancelLabel}>Cancel subscription</Text>}
          onPress={onCancel ?? noop}
          trailing={<Icon name="open_in_new" size={18} color={colors.outline} />}
        />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, flexGrow: 1 },
  planCard: { padding: 18 },
  label: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.72,
    textTransform: "uppercase",
    color: colors.onSurfaceVariant,
    marginBottom: 6,
  },
  planHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12,
  },
  planName: { fontSize: 24, fontWeight: "500", color: colors.onSurface, letterSpacing: -0.24 },
  renewal: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 23 },
  billingNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  billingText: { flex: 1, fontSize: 12, color: colors.onSurfaceVariant, lineHeight: 18 },
  spacer: { flex: 1, minHeight: 24 },
  cancelLabel: { fontSize: 15, color: colors.error },
});
