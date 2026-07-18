import { describe, expect, it } from "vitest";
import {
  isDimmedStatus,
  isExpiringStatus,
  type LinkStatus,
  statusDescriptor,
} from "@/src/links/link-status";

// statusDescriptor backs the Links tab's status chips; per the node-env / no-React-renderer
// convention the pure status->tone/icon/label mapping is tested here, not by rendering rows.
// The expected values mirror the design map in grp-links.jsx `LinkListRow`.

describe("statusDescriptor", () => {
  it("maps available -> green check_circle Available", () => {
    expect(statusDescriptor("available")).toEqual({
      tone: "green",
      icon: "check_circle",
      label: "Available",
    });
  });

  it("maps opened -> violet visibility Opened", () => {
    expect(statusDescriptor("opened")).toEqual({
      tone: "violet",
      icon: "visibility",
      label: "Opened",
    });
  });

  it("maps expiring -> amber schedule Expiring soon", () => {
    expect(statusDescriptor("expiring")).toEqual({
      tone: "amber",
      icon: "schedule",
      label: "Expiring soon",
    });
  });

  it("maps revoked -> error block Revoked", () => {
    expect(statusDescriptor("revoked")).toEqual({
      tone: "error",
      icon: "block",
      label: "Revoked",
    });
  });

  it("maps expired -> neutral history Expired", () => {
    expect(statusDescriptor("expired")).toEqual({
      tone: "neutral",
      icon: "history",
      label: "Expired",
    });
  });

  it("maps unknown -> neutral cloud_off Status unknown (offline; NEVER error/red)", () => {
    expect(statusDescriptor("unknown")).toEqual({
      tone: "neutral",
      icon: "cloud_off",
      label: "Status unknown",
    });
  });

  it("covers every LinkStatus with a defined descriptor", () => {
    const all: LinkStatus[] = ["available", "opened", "expiring", "revoked", "expired", "unknown"];
    for (const s of all) {
      const d = statusDescriptor(s);
      expect(d.tone).toBeTruthy();
      expect(d.icon).toBeTruthy();
      expect(d.label).toBeTruthy();
    }
  });

  it("uses error tone ONLY for the destructive revoked end-state (color-semantics guard)", () => {
    const errorTones = (
      ["available", "opened", "expiring", "revoked", "expired", "unknown"] as LinkStatus[]
    ).filter((s) => statusDescriptor(s).tone === "error");
    // The offline "unknown" state must stay neutral — a fetch failure is not a revocation (FE-4/R4).
    expect(errorTones).toEqual(["revoked"]);
  });
});

describe("isDimmedStatus", () => {
  it("dims the inert revoked / expired end-states", () => {
    expect(isDimmedStatus("revoked")).toBe(true);
    expect(isDimmedStatus("expired")).toBe(true);
  });

  it("keeps actionable statuses at full opacity", () => {
    expect(isDimmedStatus("available")).toBe(false);
    expect(isDimmedStatus("opened")).toBe(false);
    expect(isDimmedStatus("expiring")).toBe(false);
    // "unknown" is presumed still-live (offline) — it must not look like a dead end-state.
    expect(isDimmedStatus("unknown")).toBe(false);
  });
});

describe("isExpiringStatus", () => {
  it("flags only expiring for the amber left-border accent", () => {
    expect(isExpiringStatus("expiring")).toBe(true);
    expect(isExpiringStatus("available")).toBe(false);
    expect(isExpiringStatus("opened")).toBe(false);
    expect(isExpiringStatus("revoked")).toBe(false);
    expect(isExpiringStatus("expired")).toBe(false);
    expect(isExpiringStatus("unknown")).toBe(false);
  });
});
