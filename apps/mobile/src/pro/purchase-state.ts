// Pure state model + classifiers for the Pro purchase / restore flows. No React, no native, no I/O —
// the entitlement context (the ONLY file that touches expo-iap) maps the store's callback/return
// values into these, and the paywall renders them. Unit-tested in plain Node per the mobile test
// convention (no React renderer).

/** How to treat a purchase error. A user-cancelled purchase is a deliberate choice, NOT a failure. */
export type PurchaseErrorKind = "cancelled" | "deferred" | "failed";

/** Paywall purchase progress: driven by requestPurchase + the store's success/error callbacks. */
export type PurchasePhase =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; reason: PurchaseErrorKind };

/** Restore-purchases progress + outcome. `restored` distinguishes "restored" from "none found". */
export type RestorePhase =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; restored: boolean }
  | { kind: "error" };

// expo-iap ErrorCode string values we special-case, kept as plain string literals (not an SDK import)
// so this pure module stays free of the native SDK. The context forwards `error.code` verbatim.
//   ErrorCode.UserCancelled === "user-cancelled" (the user dismissed the sheet — not an error)
//   ErrorCode.DeferredPayment === "deferred-payment" (Ask-to-Buy / SCA pending — will resolve later)
const USER_CANCELLED = "user-cancelled";
const DEFERRED_PAYMENT = "deferred-payment";

/** Classify an expo-iap purchase error code. Unknown / absent → a generic failure. */
export function classifyPurchaseError(code: string | undefined | null): PurchaseErrorKind {
  if (code === USER_CANCELLED) return "cancelled";
  if (code === DEFERRED_PAYMENT) return "deferred";
  return "failed";
}

/** A calm, non-alarming status line. `tone` is presentation-only; nothing here is destructive (no red). */
export interface StatusMessage {
  tone: "neutral" | "info";
  text: string;
}

/** The status line to show for a purchase phase, or `null` to render nothing (idle). */
export function purchaseStatusMessage(phase: PurchasePhase): StatusMessage | null {
  if (phase.kind === "pending") return { tone: "neutral", text: "Processing…" };
  if (phase.kind === "error") {
    if (phase.reason === "cancelled") return { tone: "neutral", text: "Purchase canceled." };
    if (phase.reason === "deferred") {
      return { tone: "info", text: "Waiting for approval. Pro unlocks once it's approved." };
    }
    return { tone: "info", text: "Purchase didn't complete. Please try again." };
  }
  return null;
}

/** The status line to show for a restore phase, or `null` to render nothing (idle). */
export function restoreStatusMessage(phase: RestorePhase): StatusMessage | null {
  if (phase.kind === "pending") return { tone: "neutral", text: "Restoring…" };
  if (phase.kind === "done") {
    return phase.restored
      ? { tone: "neutral", text: "Purchases restored." }
      : { tone: "neutral", text: "No purchases found." };
  }
  if (phase.kind === "error") {
    return { tone: "info", text: "Couldn't restore purchases. Please try again." };
  }
  return null;
}

/** Whether the upgrade CTA should show a spinner + be disabled (a purchase is in flight). */
export function isPurchaseInFlight(phase: PurchasePhase): boolean {
  return phase.kind === "pending";
}

/** Whether the restore control should show progress + be disabled (a restore is in flight). */
export function isRestoreInFlight(phase: RestorePhase): boolean {
  return phase.kind === "pending";
}
