import { describe, expect, it, vi } from "vitest";
import type { OpenMessageResponse } from "@/src/api/client";
import { decideDecryptGate, runDecryptGate } from "@/src/reader/decrypt-gate";
import { createOpenCoordinator } from "@/src/reader/open-coordinator";

// decrypt-gate + open-coordinator both only TYPE-import OpenMessageResponse (erased at runtime), so
// this loads in plain Node with no expo / react-native dependency — nothing to mock.
//
// These tests pin the FE-1 / R5 per-decrypt biometric gate invariants on pure logic (the same
// functions ReaderFlow wires): the plaintext (local decrypt) callback fires ONLY after a successful
// biometric auth, a failed / retried gate derives NO plaintext, and — crucially, against the FE-2
// coordinator — the gate issues ZERO additional /open regardless of how many times it is retried.

const ID = "abcdefghijkl0123";

function makeResponse(overrides: Partial<OpenMessageResponse> = {}): OpenMessageResponse {
  return {
    ciphertext: "Y2lwaGVy",
    createdAt: null,
    expiresAt: "2026-05-11T12:00:00.000Z",
    opensCount: 1,
    maxOpens: 1,
    status: "active",
    ...overrides,
  };
}

describe("decideDecryptGate", () => {
  it("skips the gate when the setting is OFF (decrypt directly; identity unlock still applied)", () => {
    expect(decideDecryptGate({ requireUnlock: false, capable: true })).toBe("skip");
    // Capability is irrelevant when the guard is off.
    expect(decideDecryptGate({ requireUnlock: false, capable: false })).toBe("skip");
  });

  it("prompts when the setting is ON and the device can run a biometric prompt", () => {
    expect(decideDecryptGate({ requireUnlock: true, capable: true })).toBe("prompt");
  });

  it("reports 'unavailable' (never a silent bypass) when the setting is ON but the device can't prompt", () => {
    expect(decideDecryptGate({ requireUnlock: true, capable: false })).toBe("unavailable");
  });
});

describe("runDecryptGate", () => {
  it("runs the local decrypt ONLY after a successful auth", async () => {
    const order: string[] = [];
    const authenticate = vi.fn(async () => {
      order.push("auth");
    });
    const onAuthenticated = vi.fn(async () => {
      order.push("decrypt");
    });

    await runDecryptGate({ authenticate, onAuthenticated });

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    // Ordering is the whole point of the gate: authenticate strictly before decrypt.
    expect(order).toEqual(["auth", "decrypt"]);
  });

  it("does NOT derive plaintext when auth is cancelled/failed, and propagates the rejection", async () => {
    const authenticate = vi.fn(async () => {
      throw new Error("cancelled");
    });
    const onAuthenticated = vi.fn();

    await expect(runDecryptGate({ authenticate, onAuthenticated })).rejects.toThrow("cancelled");
    // The plaintext callback is never reached on a failed gate.
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});

describe("runDecryptGate + open-coordinator — a failed/retried gate costs ZERO additional /open", () => {
  it("holds the single open across gate failures; plaintext only after auth success", async () => {
    const coord = createOpenCoordinator();
    const response = makeResponse();
    // `run` models POST /api/messages/:id/open — the ONLY open-consuming call.
    const run = vi.fn(async () => response);
    // `decrypt` models the LOCAL decrypt (decryptOpenResponse) — consumes NO open.
    const decrypt = vi.fn(async () => {});

    // 1) The one intended open: exactly one POST, ciphertext held.
    const started = coord.begin(ID, run);
    expect(started.kind).toBe("started");
    if (started.kind === "started") await started.promise;

    // 2) Gate attempt fails (user cancels the biometric prompt). No plaintext; NO extra open.
    const rejecting = vi.fn(async () => {
      throw new Error("cancelled");
    });
    const held1 = coord.begin(ID, run); // re-entry (e.g. resume) returns the HELD ciphertext, no POST
    expect(held1.kind).toBe("held");
    await expect(
      runDecryptGate({ authenticate: rejecting, onAuthenticated: () => decrypt() }),
    ).rejects.toThrow("cancelled");
    expect(decrypt).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);

    // 3) Retry the gate — still no new POST — and this time auth succeeds → decrypt runs once.
    const resolving = vi.fn(async () => {});
    const held2 = coord.begin(ID, run);
    expect(held2.kind).toBe("held");
    await runDecryptGate({ authenticate: resolving, onAuthenticated: () => decrypt() });

    expect(decrypt).toHaveBeenCalledTimes(1);
    // The whole gated read consumed exactly ONE open across the failure + retry.
    expect(run).toHaveBeenCalledTimes(1);
  });
});
