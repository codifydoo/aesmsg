import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { PRO_FEATURES, PRO_PRICING, PRO_RENEWAL_DISCLOSURE } from "@/src/account/account-data";
import { annualSavingsLabel, type BillingInterval } from "@/src/account/account-format";
import { AppBar, Button, Card, Icon, Screen } from "@/src/components";
import type { PlanProduct } from "@/src/pro/entitlement-model";
import {
  type PriceDisplay,
  type ProductsStatus,
  selectPriceDisplay,
} from "@/src/pro/paywall-price";
import {
  isPurchaseInFlight,
  isRestoreInFlight,
  type PurchasePhase,
  purchaseStatusMessage,
  type RestorePhase,
  restoreStatusMessage,
  type StatusMessage,
} from "@/src/pro/purchase-state";
import { colors, type } from "@/src/theme";

// 51 · Pricing / Paywall (grp-account.jsx → S_Paywall). AppBar "aesmsg Pro", a headline, a
// Monthly/Annual segmented control (Annual badged with the savings %), a highlighted Pro plan card
// (price + feature checklist), App-Store billing reassurance, and a pinned footer with the upgrade
// CTA + "Restore purchases".
//
// PRICE INVARIANT (PG-8): the displayed price is ONLY ever the live store-localized `displayPrice`
// (via the pure `selectPriceDisplay`). While products load we show a SKELETON, and if the store can't
// price the selected plan we show an honest error + Retry — never a hardcoded/fabricated amount. The
// unit is "/yr" for the annual total and "/mo" otherwise. `onSelectPlan(interval)` triggers the real
// StoreKit/Play purchase; the CTA shows progress while it's in flight and both purchase and restore
// surface a calm status line (incl. user-cancel, which is not treated as an error). Calm/premium copy.
//
// The Annual segment uses a custom 2-option control (not the kit SegmentedControl) so it can carry an
// inline emerald savings badge, matching the design's `.seg` with a colored span. The savings badge is
// a marketing ratio we set in App Store Connect (not a displayed currency amount), so it is kept.

export interface PaywallScreenProps {
  /** Live, store-localized products (from the entitlement context). */
  products?: PlanProduct[] | undefined;
  /** Load state of `products` — drives the price skeleton vs. error/retry (never a faked price). */
  productsStatus?: ProductsStatus | undefined;
  /** In-flight / error state of the active purchase. */
  purchasePhase?: PurchasePhase | undefined;
  /** In-flight / result state of a restore. */
  restorePhase?: RestorePhase | undefined;
  /** Re-fetch store products after a price load error. */
  onRetryProducts?: (() => void) | undefined;
  /** Dismiss the paywall (modal close). */
  onClose?: (() => void) | undefined;
  /** Called with the chosen billing interval when the user taps Upgrade. */
  onSelectPlan?: ((interval: BillingInterval) => void) | undefined;
  /** Restore a prior purchase. */
  onRestore?: (() => void) | undefined;
  /** Open the Terms of Use / EULA (App Store Guideline 3.1.2 requires it at the point of purchase). */
  onOpenTerms?: (() => void) | undefined;
  /** Open the Privacy Policy (App Store Guideline 3.1.2 requires it at the point of purchase). */
  onOpenPrivacy?: (() => void) | undefined;
}

const noop = () => {};
const IDLE_PURCHASE: PurchasePhase = { kind: "idle" };
const IDLE_RESTORE: RestorePhase = { kind: "idle" };

export function PaywallScreen({
  products = [],
  productsStatus = "loading",
  purchasePhase = IDLE_PURCHASE,
  restorePhase = IDLE_RESTORE,
  onRetryProducts,
  onClose,
  onSelectPlan,
  onRestore,
  onOpenTerms,
  onOpenPrivacy,
}: PaywallScreenProps) {
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const price = selectPriceDisplay(products, interval, productsStatus);
  const savings = annualSavingsLabel(PRO_PRICING);

  const purchasing = isPurchaseInFlight(purchasePhase);
  const restoring = isRestoreInFlight(restorePhase);
  // Don't let the user commit to a purchase whose price we can't honestly show.
  const canBuy = price.state === "price" && !purchasing && !restoring;
  const purchaseStatus = purchaseStatusMessage(purchasePhase);
  const restoreStatus = restoreStatusMessage(restorePhase);

  return (
    <Screen topInset={false} contentStyle={styles.content}>
      <AppBar title="aesmsg Pro" leading="close" onLeading={onClose ?? noop} />

      <Text style={styles.headline}>More room to share securely.</Text>

      {/* Monthly / Annual selector with inline savings badge */}
      <View style={styles.seg} accessibilityRole="tablist">
        <IntervalButton
          label="Monthly"
          selected={interval === "monthly"}
          onPress={() => setInterval("monthly")}
        />
        <IntervalButton
          label="Annual"
          badge={savings ? `· ${savings}` : undefined}
          selected={interval === "annual"}
          onPress={() => setInterval("annual")}
        />
      </View>

      {/* Highlighted Pro plan card */}
      <Card style={styles.planCard}>
        <View style={styles.priceRow}>
          <Text style={styles.planName}>Pro</Text>
          <PriceView price={price} onRetry={onRetryProducts ?? noop} />
        </View>
        <View style={styles.features}>
          {PRO_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Icon name="check" size={18} color={colors.emerald} />
              <Text style={styles.featureLabel}>{feature}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Text style={styles.fineprint}>{PRO_RENEWAL_DISCLOSURE}</Text>

      <View style={styles.footer}>
        {/* Progress = the CTA switches to "Processing…" + disables; a spinner sits just below it. On
            failure/cancel the button re-enables and a calm status line explains what happened. */}
        <Button disabled={!canBuy} onPress={() => onSelectPlan?.(interval)}>
          {purchasing ? "Processing…" : "Upgrade to Pro"}
        </Button>
        {purchasing ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.ctaSpinner} />
        ) : purchaseStatus ? (
          <StatusLine message={purchaseStatus} />
        ) : null}
        <Pressable
          onPress={restoring ? noop : (onRestore ?? noop)}
          disabled={restoring}
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          accessibilityState={{ disabled: restoring }}
          style={styles.restoreTap}
        >
          <Text style={[styles.restore, restoring && styles.restoreDisabled]}>
            {restoring ? "Restoring…" : "Restore purchases"}
          </Text>
        </Pressable>
        {restoreStatus && !restoring ? <StatusLine message={restoreStatus} /> : null}
        <View style={styles.legalRow}>
          <Pressable
            onPress={onOpenTerms ?? noop}
            accessibilityRole="link"
            accessibilityLabel="Terms of Use"
            hitSlop={8}
          >
            <Text style={styles.legalLink}>Terms of Use</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable
            onPress={onOpenPrivacy ?? noop}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            hitSlop={8}
          >
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

// The price row content — the store price + its unit, a skeleton while products load, or an honest
// error with a Retry (never a fabricated amount).
function PriceView({ price, onRetry }: { price: PriceDisplay; onRetry: () => void }) {
  if (price.state === "price") {
    return (
      <View style={styles.priceRight}>
        <Text style={styles.price}>{price.price}</Text>
        <Text style={styles.priceUnit}>{price.unit}</Text>
      </View>
    );
  }
  if (price.state === "loading") {
    return <View style={styles.priceSkeleton} accessibilityLabel="Loading price" />;
  }
  return (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel="Retry loading price"
      hitSlop={8}
      style={styles.priceRetry}
    >
      <Icon name="refresh" size={16} color={colors.onSurfaceVariant} />
      <Text style={styles.priceRetryLabel}>Price unavailable · Retry</Text>
    </Pressable>
  );
}

function StatusLine({ message }: { message: StatusMessage }) {
  return (
    <Text
      style={[styles.status, message.tone === "info" && styles.statusInfo]}
      accessibilityLiveRegion="polite"
    >
      {message.text}
    </Text>
  );
}

interface IntervalButtonProps {
  label: string;
  badge?: string | undefined;
  selected: boolean;
  onPress: () => void;
}

function IntervalButton({ label, badge, selected, onPress }: IntervalButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={[styles.segBtn, selected && styles.segBtnSel]}
    >
      <Text style={[styles.segLabel, selected && styles.segLabelSel]} numberOfLines={1}>
        {label}
        {badge ? <Text style={styles.segBadge}> {badge}</Text> : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  headline: { ...type.h2, color: colors.onSurface },
  seg: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  segBtnSel: { backgroundColor: colors.surfaceContainerHighest },
  segLabel: { fontSize: 13, fontWeight: "500", color: colors.onSurfaceVariant },
  segLabelSel: { color: colors.onSurface },
  segBadge: { color: colors.emerald },
  planCard: {
    padding: 16,
    borderColor: colors.primary,
    // soft violet glow — box-shadow: 0 0 24px -10px rgba(207,188,255,.4)
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  planName: { ...type.h2, fontSize: 20, color: colors.onSurface },
  priceRight: { flexDirection: "row", alignItems: "baseline" },
  price: { ...type.h1, fontSize: 26, color: colors.onSurface },
  priceUnit: { color: colors.onSurfaceVariant, fontSize: 15 },
  // Placeholder shown while the store price loads — never a stand-in number.
  priceSkeleton: {
    width: 96,
    height: 26,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainerHighest,
  },
  priceRetry: { flexDirection: "row", alignItems: "center", gap: 6 },
  priceRetryLabel: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: "500" },
  features: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureLabel: { ...type.body, color: colors.onSurface },
  fineprint: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 16,
  },
  footer: { gap: 12, paddingTop: 8 },
  ctaSpinner: { alignSelf: "center" },
  status: {
    textAlign: "center",
    color: colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
  },
  statusInfo: { color: colors.onSurface },
  restoreTap: { alignSelf: "center", paddingVertical: 4 },
  restore: {
    textAlign: "center",
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: "500",
  },
  restoreDisabled: { opacity: 0.5 },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  legalLink: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: "500" },
  legalDot: { color: colors.onSurfaceVariant, fontSize: 13 },
});
