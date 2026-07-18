import type { PublicKeyString } from "@aesmsg/crypto";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import { AccountScreen } from "@/src/account/AccountScreen";
import { ManageSubscriptionScreen } from "@/src/account/ManageSubscriptionScreen";
import { PaywallScreen } from "@/src/account/PaywallScreen";
import { UpgradeSuccessScreen } from "@/src/account/UpgradeSuccessScreen";
import { useEntitlement } from "@/src/pro/entitlement-context";
import { livePriceForInterval } from "@/src/pro/paywall-price";
import { PRIVACY_URL, TERMS_URL } from "@/src/system/legal-links";

// AccountFlow — the self-contained Account / Monetization stack (50–53). Two paths from the root:
//   Account (50) → Paywall (51) → Upgrade Success (53)   [purchase]
//   Account (50) → Manage Subscription (52)               [existing Pro subscriber]
//
// Subscription state is LIVE, read from the store via useEntitlement() (StoreKit 2 / Play Billing).
// No mock state, no server: the entitlement is derived on-device, preserving the zero-knowledge
// backend. A purchase "succeeds" when the store reports the new active subscription (entitlement.isPro
// flips true), which we detect to show the success screen. Change/Cancel deep-link to the OS
// subscription settings; the app never manages billing directly.
//
// `onClose` is the flow-level dismiss for the host (e.g. the tab host / a modal). The design's Account
// screen (50) is a tab root with no back/close of its own, so the flow renders no close button.

type Route = "account" | "paywall" | "upgradeSuccess" | "manage";

export interface AccountFlowProps {
  /** Dismiss the whole Account stack (e.g. close the modal / pop the tab root). */
  onClose?: (() => void) | undefined;
  /** Real public key — drives the Account screen's key-derived avatar + real short fingerprint. */
  publicKeyString?: PublicKeyString | undefined;
}

/** Open the platform's subscription-management page (used for Change plan / Cancel). */
function openStoreSubscriptions() {
  const url =
    Platform.OS === "ios"
      ? "itms-apps://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions";
  void Linking.openURL(url);
}

export default function AccountFlow({ publicKeyString }: AccountFlowProps = {}) {
  const [route, setRoute] = useState<Route>("account");
  const {
    entitlement,
    products,
    productsStatus,
    purchasePhase,
    restorePhase,
    loadProducts,
    purchase,
    restore,
    resetFeedback,
  } = useEntitlement();

  // Track an in-flight purchase so we only celebrate a genuine free→pro transition — not an
  // already-Pro user who opened the paywall to change plans.
  const [purchasing, setPurchasing] = useState(false);
  const wasProAtPurchase = useRef(false);

  // Fetch live, store-localized prices when a price-showing screen opens. The paywall also clears any
  // stale purchase/restore status so a prior attempt's message doesn't linger on reopen.
  useEffect(() => {
    if (route === "paywall") {
      resetFeedback();
      void loadProducts();
    } else if (route === "manage") {
      void loadProducts();
    }
  }, [route, loadProducts, resetFeedback]);

  // Completed upgrade: the store now reports an active Pro subscription that wasn't there before.
  useEffect(() => {
    if (purchasing && entitlement.isPro && !wasProAtPurchase.current) {
      setPurchasing(false);
      setRoute("upgradeSuccess");
    }
  }, [purchasing, entitlement.isPro]);

  // A failed / cancelled purchase clears the in-flight flag so a later unrelated entitlement change
  // (e.g. a restore) can't retroactively fire the "upgrade success" screen.
  useEffect(() => {
    if (purchasePhase.kind === "error") setPurchasing(false);
  }, [purchasePhase]);

  switch (route) {
    case "paywall":
      return (
        <PaywallScreen
          products={products}
          productsStatus={productsStatus}
          purchasePhase={purchasePhase}
          restorePhase={restorePhase}
          onRetryProducts={() => void loadProducts()}
          onClose={() => setRoute("account")}
          onSelectPlan={(interval) => {
            wasProAtPurchase.current = entitlement.isPro;
            setPurchasing(true);
            void purchase(interval);
          }}
          onRestore={() => void restore()}
          onOpenTerms={() => void Linking.openURL(TERMS_URL)}
          onOpenPrivacy={() => void Linking.openURL(PRIVACY_URL)}
        />
      );

    case "upgradeSuccess":
      return (
        <UpgradeSuccessScreen
          onDone={() => setRoute("account")}
          onManageSubscription={() => setRoute("manage")}
        />
      );

    case "manage": {
      const manageInterval = entitlement.interval ?? "annual";
      return (
        <ManageSubscriptionScreen
          interval={manageInterval}
          renewsAt={entitlement.renewsAt}
          livePrice={livePriceForInterval(products, manageInterval)}
          restorePhase={restorePhase}
          onBack={() => setRoute("account")}
          onChangePlan={() => setRoute("paywall")}
          onRestore={() => void restore()}
          onCancel={openStoreSubscriptions}
        />
      );
    }

    default:
      return (
        <AccountScreen
          planId={entitlement.isPro ? "pro" : "free"}
          publicKeyString={publicKeyString}
          onUpgrade={() => setRoute("paywall")}
          onManageSubscription={() => setRoute("manage")}
        />
      );
  }
}
