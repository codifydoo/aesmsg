// Thin native boundary over expo-iap (v4.3.1). This is the ONLY file in the Pro feature that touches
// the store SDK; everything downstream consumes the single derived `entitlement` and the priced
// `products` list. Zero-knowledge by construction: this provider talks ONLY to the device<->store
// (Apple StoreKit 2 / Google Play Billing). It NEVER calls the aesmsg API, never transmits a purchase
// token, and keeps no persistent app-side entitlement cache — the store answers (incl. offline), and
// on-device receipt verification is what we rely on.
//
// expo-iap v4 NOTE: inside the `useIAP` hook, fetchProducts / getActiveSubscriptions / requestPurchase
// all resolve to Promise<void> and instead push results into the hook's reactive state
// (`subscriptions`, `activeSubscriptions`). So we call those imperatively to *trigger a refresh* and
// derive our values from the hook state via memo/effect — we do NOT read return values from them.

import { useIAP } from "expo-iap";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  type ActiveSubscriptionInput,
  ALL_PRODUCT_IDS,
  type Entitlement,
  type Interval,
  type PlanProduct,
  PRODUCT_IDS,
  type ProductInput,
  toEntitlement,
  toPlanProducts,
} from "@/src/pro/entitlement-model";
import type { ProductsStatus } from "@/src/pro/paywall-price";
import {
  classifyPurchaseError,
  type PurchasePhase,
  type RestorePhase,
} from "@/src/pro/purchase-state";

interface EntitlementContextValue {
  /** The single derived entitlement the rest of the app reasons about. */
  entitlement: Entitlement;
  /** True until the first active-subscription query resolves (then stays false). */
  loading: boolean;
  /** Store-localized paywall products (empty until loadProducts succeeds). */
  products: PlanProduct[];
  /** Load state of `products` — drives the paywall skeleton / error-retry (never a fabricated price). */
  productsStatus: ProductsStatus;
  /** In-flight / error state of the active purchase (drives the CTA spinner + status line). */
  purchasePhase: PurchasePhase;
  /** In-flight / result state of a restore (drives the restore progress + "restored / none found"). */
  restorePhase: RestorePhase;
  /** Re-query active subscriptions from the store and re-derive the entitlement. */
  refresh: () => Promise<void>;
  /** Fetch subscription products for the paywall. */
  loadProducts: () => Promise<void>;
  /** Start the native purchase sheet. Result arrives via the store's purchase-updated callback. */
  purchase: (interval: Interval) => Promise<void>;
  /** Restore prior purchases (re-syncs active subscriptions). */
  restore: () => Promise<void>;
  /** Clear any lingering purchase/restore status (e.g. when (re)opening the paywall). */
  resetFeedback: () => void;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

const SUBSCRIPTION_IDS = [...ALL_PRODUCT_IDS];

// ── DEV-ONLY override ───────────────────────────────────────────────────────────────────────────
// Flip DEV_FORCE_PRO to `true` in a LOCAL edit to force a Pro entitlement on a dev build, so the
// Pro-gated UI (custom expiry, 25 MB attachments, Manage screen) can be exercised WITHOUT a real
// purchase — useful on a build where a local .storekit config isn't applied (e.g. an EAS build).
// Guarded by `__DEV__`, so it is dead-code-eliminated from release builds and can NEVER ship.
// Don't commit this set to `true`. Prefer a real StoreKit-config purchase when you can — it exercises
// the actual purchase path end to end (see apps/mobile/storekit/README.md).
const DEV_FORCE_PRO = false;

const DEV_PRO_ENTITLEMENT: Entitlement = {
  isPro: true,
  interval: "annual",
  renewsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  productId: PRODUCT_IDS.annual,
};

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  // Paywall price load state — starts "loading" so the paywall shows a skeleton, never a stale/faked
  // price. loadProducts() resets it; an effect flips it to "ready" once priced products arrive; a
  // store error while we still have no price flips it to "error" (honest retry).
  const [productsStatus, setProductsStatus] = useState<ProductsStatus>("loading");
  const [purchasePhase, setPurchasePhase] = useState<PurchasePhase>({ kind: "idle" });
  const [restorePhase, setRestorePhase] = useState<RestorePhase>({ kind: "idle" });

  const {
    connected,
    subscriptions,
    activeSubscriptions,
    fetchProducts,
    getActiveSubscriptions,
    hasActiveSubscriptions,
    requestPurchase,
    restorePurchases,
  } = useIAP({
    // A completed purchase (or a StoreKit replay) lands here — clear the in-flight state and re-query
    // active subs so the entitlement flips Pro on.
    onPurchaseSuccess: () => {
      setPurchasePhase({ kind: "idle" });
      void getActiveSubscriptions(SUBSCRIPTION_IDS);
    },
    // Purchase failures (incl. user-cancelled) route here. We classify them so the paywall can show a
    // calm, non-alarming message (a user-cancel is NOT treated as a failure).
    onPurchaseError: (error) => {
      setPurchasePhase({ kind: "error", reason: classifyPurchaseError(error.code) });
    },
    // fetchProducts / getActiveSubscriptions failures (network / store-not-ready) surface here; we
    // keep the last known state, stop the initial spinner, and — if we still have no price to show —
    // mark the paywall products as errored so it offers a retry instead of an infinite skeleton.
    onError: () => {
      setLoading(false);
      setProductsStatus((s) => (s === "ready" ? s : "error"));
    },
  });

  // Trigger an active-subscriptions query. Results land in `activeSubscriptions` state, mapped below.
  const refresh = useCallback(async () => {
    if (!connected) return;
    // getActiveSubscriptions resolves void; errors route to useIAP's onError. We still stop the
    // initial spinner once a query round-trips (success path) here.
    await getActiveSubscriptions(SUBSCRIPTION_IDS);
    setLoading(false);
  }, [connected, getActiveSubscriptions]);

  const loadProducts = useCallback(async () => {
    if (!connected) {
      // No store connection ⇒ we can't price honestly. Surface an error/retry, not a skeleton.
      setProductsStatus("error");
      return;
    }
    setProductsStatus("loading");
    try {
      // type: "subs" routes results into the hook's `subscriptions` state (not `products`).
      await fetchProducts({ skus: SUBSCRIPTION_IDS, type: "subs" });
    } catch {
      setProductsStatus("error");
    }
    // The "ready" flip happens in the effect below, once priced products are actually in state.
  }, [connected, fetchProducts]);

  const resetFeedback = useCallback(() => {
    setPurchasePhase({ kind: "idle" });
    setRestorePhase({ kind: "idle" });
  }, []);

  const purchase = useCallback(
    async (interval: Interval) => {
      const sku = interval === "annual" ? PRODUCT_IDS.annual : PRODUCT_IDS.monthly;
      setPurchasePhase({ kind: "pending" });
      try {
        // v4 RequestSubscriptionPropsByPlatforms: apple takes { sku }, google takes { skus }. The
        // outcome normally arrives via onPurchaseSuccess / onPurchaseError; some SDK/platform paths
        // reject the promise instead, so we also classify a throw here (both feed the same UI).
        await requestPurchase({
          request: { apple: { sku }, google: { skus: [sku] } },
          type: "subs",
        });
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        setPurchasePhase({ kind: "error", reason: classifyPurchaseError(code) });
      }
    },
    [requestPurchase],
  );

  const restore = useCallback(async () => {
    if (!connected) {
      setRestorePhase({ kind: "error" });
      return;
    }
    setRestorePhase({ kind: "pending" });
    try {
      // iOS: lightweight sync + refresh available purchases; Android: re-query. Then re-derive, and
      // ask the store directly whether any aesmsg Pro sub is now active → "restored" vs "none found".
      await restorePurchases();
      await getActiveSubscriptions(SUBSCRIPTION_IDS);
      const restored = await hasActiveSubscriptions(SUBSCRIPTION_IDS);
      setRestorePhase({ kind: "done", restored });
    } catch {
      setRestorePhase({ kind: "error" });
    }
  }, [connected, restorePurchases, getActiveSubscriptions, hasActiveSubscriptions]);

  // Derive the entitlement purely from the hook's active-subscriptions state. expirationDateIOS is
  // epoch ms (absent on Android); ActiveSubscription.productId is the store product id on iOS and is
  // what toEntitlement matches against. We filter to isActive so a lapsed-but-still-listed sub can't
  // grant Pro.
  const entitlement = useMemo<Entitlement>(() => {
    // DEV escape hatch (see DEV_FORCE_PRO above) — impossible in a release build.
    if (__DEV__ && DEV_FORCE_PRO) return DEV_PRO_ENTITLEMENT;
    const inputs: ActiveSubscriptionInput[] = activeSubscriptions
      .filter((s) => s.isActive)
      .map((s) => ({
        productId: s.productId,
        expiresAtMs: s.expirationDateIOS ?? null,
      }));
    return toEntitlement(inputs);
  }, [activeSubscriptions]);

  // Derive paywall products from the hook's `subscriptions` state.
  const products = useMemo<PlanProduct[]>(() => {
    const inputs: ProductInput[] = subscriptions.map((p) => ({
      id: p.id,
      displayPrice: p.displayPrice,
      currencyCode: p.currency,
    }));
    return toPlanProducts(inputs);
  }, [subscriptions]);

  // Once priced products actually land in state, the paywall can price honestly → mark ready. (A
  // fetch error before this ran will have already flipped productsStatus to "error" via onError.)
  useEffect(() => {
    if (products.length > 0) setProductsStatus("ready");
  }, [products.length]);

  // Initial + reconnect refresh: query active subs as soon as the store connects.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-check on foreground — a subscription may have been purchased/cancelled in the system
  // subscription center, or renewed, while the app was backgrounded.
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === "active") void refresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<EntitlementContextValue>(
    () => ({
      entitlement,
      loading,
      products,
      productsStatus,
      purchasePhase,
      restorePhase,
      refresh,
      loadProducts,
      purchase,
      restore,
      resetFeedback,
    }),
    [
      entitlement,
      loading,
      products,
      productsStatus,
      purchasePhase,
      restorePhase,
      refresh,
      loadProducts,
      purchase,
      restore,
      resetFeedback,
    ],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error("useEntitlement must be used within <EntitlementProvider>");
  return ctx;
}
