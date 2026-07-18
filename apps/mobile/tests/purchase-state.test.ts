import { describe, expect, it } from "vitest";
import {
  classifyPurchaseError,
  isPurchaseInFlight,
  isRestoreInFlight,
  type PurchasePhase,
  purchaseStatusMessage,
  type RestorePhase,
  restoreStatusMessage,
} from "@/src/pro/purchase-state";

// Pure state model backing the honest Pro purchase / restore UX (PG-8). Tested per the node-env /
// no-React-renderer convention — the paywall + manage screens only render these classifications.

describe("classifyPurchaseError", () => {
  it("treats a user cancellation as 'cancelled' (NOT a failure)", () => {
    expect(classifyPurchaseError("user-cancelled")).toBe("cancelled");
  });

  it("treats a deferred (Ask-to-Buy / SCA) payment as 'deferred'", () => {
    expect(classifyPurchaseError("deferred-payment")).toBe("deferred");
  });

  it("treats any other / unknown / absent code as a generic 'failed'", () => {
    expect(classifyPurchaseError("network-error")).toBe("failed");
    expect(classifyPurchaseError("service-error")).toBe("failed");
    expect(classifyPurchaseError("unknown")).toBe("failed");
    expect(classifyPurchaseError(undefined)).toBe("failed");
    expect(classifyPurchaseError(null)).toBe("failed");
    expect(classifyPurchaseError("")).toBe("failed");
  });
});

describe("purchaseStatusMessage", () => {
  it("renders nothing while idle", () => {
    expect(purchaseStatusMessage({ kind: "idle" })).toBeNull();
  });

  it("shows a neutral 'Processing…' while pending", () => {
    expect(purchaseStatusMessage({ kind: "pending" })).toEqual({
      tone: "neutral",
      text: "Processing…",
    });
  });

  it("uses calm, non-alarming copy for a user cancellation", () => {
    const msg = purchaseStatusMessage({ kind: "error", reason: "cancelled" });
    expect(msg?.tone).toBe("neutral");
    expect(msg?.text).toBe("Purchase canceled.");
  });

  it("explains a deferred payment as a wait, not a failure", () => {
    const msg = purchaseStatusMessage({ kind: "error", reason: "deferred" });
    expect(msg?.tone).toBe("info");
    expect(msg?.text).toMatch(/approv/i);
  });

  it("offers a clear retry on a generic failure", () => {
    const msg = purchaseStatusMessage({ kind: "error", reason: "failed" });
    expect(msg?.tone).toBe("info");
    expect(msg?.text).toMatch(/try again/i);
  });
});

describe("restoreStatusMessage", () => {
  it("renders nothing while idle", () => {
    expect(restoreStatusMessage({ kind: "idle" })).toBeNull();
  });

  it("shows progress while restoring", () => {
    expect(restoreStatusMessage({ kind: "pending" })).toEqual({
      tone: "neutral",
      text: "Restoring…",
    });
  });

  it("confirms a successful restore", () => {
    expect(restoreStatusMessage({ kind: "done", restored: true })?.text).toBe(
      "Purchases restored.",
    );
  });

  it("reports when nothing was found to restore", () => {
    expect(restoreStatusMessage({ kind: "done", restored: false })?.text).toBe(
      "No purchases found.",
    );
  });

  it("offers a retry on a restore error", () => {
    const msg = restoreStatusMessage({ kind: "error" });
    expect(msg?.tone).toBe("info");
    expect(msg?.text).toMatch(/try again/i);
  });
});

describe("isPurchaseInFlight / isRestoreInFlight", () => {
  it("is true only while pending", () => {
    const cases: [PurchasePhase, boolean][] = [
      [{ kind: "idle" }, false],
      [{ kind: "pending" }, true],
      [{ kind: "error", reason: "failed" }, false],
    ];
    for (const [phase, expected] of cases) {
      expect(isPurchaseInFlight(phase)).toBe(expected);
    }

    const restores: [RestorePhase, boolean][] = [
      [{ kind: "idle" }, false],
      [{ kind: "pending" }, true],
      [{ kind: "done", restored: true }, false],
      [{ kind: "error" }, false],
    ];
    for (const [phase, expected] of restores) {
      expect(isRestoreInFlight(phase)).toBe(expected);
    }
  });
});
