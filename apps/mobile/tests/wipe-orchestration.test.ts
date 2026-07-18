import { describe, expect, it, vi } from "vitest";
import {
  isAlreadyGoneRevokeError,
  type RevokeFailure,
  type RevokeThenWipeDeps,
  revokeAllThenWipe,
  selectLiveTrackedLinks,
  type WipeLinkRef,
} from "@/src/settings/wipe-orchestration";

// Pure orchestration — no React renderer, no native modules. Fakes for the injected link source,
// revoke call, acknowledgement gate, and identity purge (per the mobile node-env test convention).

/** An ApiError-shaped rejection: revokeLink throws `{ name, status }` for non-2xx responses. */
function apiError(status: number): Error & { status: number } {
  const err = new Error(`API error ${status}`) as Error & { status: number };
  err.name = "ApiError";
  err.status = status;
  return err;
}

function link(id: string, label: string | null = null): WipeLinkRef {
  return { id, label };
}

/** Build the dep set with sensible defaults; override per case. */
function makeDeps(overrides: Partial<RevokeThenWipeDeps> = {}) {
  const wipe = vi.fn(async () => {});
  const revoke = vi.fn(async (_id: string) => {});
  const confirmProceedDespiteFailures = vi.fn(async (_f: RevokeFailure[]) => true);
  const listLinksToRevoke = vi.fn(async () => [] as WipeLinkRef[]);
  const deps: RevokeThenWipeDeps = {
    listLinksToRevoke,
    revoke,
    confirmProceedDespiteFailures,
    wipe,
    ...overrides,
  };
  return { deps, wipe, revoke, confirmProceedDespiteFailures, listLinksToRevoke };
}

describe("isAlreadyGoneRevokeError", () => {
  it("treats 404 and 410 as already-gone (success)", () => {
    expect(isAlreadyGoneRevokeError(apiError(404))).toBe(true);
    expect(isAlreadyGoneRevokeError(apiError(410))).toBe(true);
  });

  it("treats other statuses / shapes as genuine failures", () => {
    expect(isAlreadyGoneRevokeError(apiError(500))).toBe(false);
    expect(isAlreadyGoneRevokeError(apiError(429))).toBe(false);
    expect(isAlreadyGoneRevokeError(new Error("network down"))).toBe(false);
    expect(isAlreadyGoneRevokeError(null)).toBe(false);
    expect(isAlreadyGoneRevokeError(undefined)).toBe(false);
  });
});

describe("selectLiveTrackedLinks", () => {
  const NOW = Date.parse("2026-07-16T12:00:00.000Z");

  it("keeps only records whose expiry is strictly in the future and maps to {id,label}", () => {
    const records = [
      { id: "live1", label: "prod key", expiresAt: "2026-07-16T13:00:00.000Z" },
      { id: "expired", label: null, expiresAt: "2026-07-16T11:00:00.000Z" },
      { id: "never", label: "forever", expiresAt: "9999-12-31T23:59:59.000Z" },
    ];
    expect(selectLiveTrackedLinks(records, NOW)).toEqual([
      { id: "live1", label: "prod key" },
      { id: "never", label: "forever" },
    ]);
  });

  it("drops a record whose expiry is exactly now (already dead)", () => {
    const records = [{ id: "boundary", label: null, expiresAt: "2026-07-16T12:00:00.000Z" }];
    expect(selectLiveTrackedLinks(records, NOW)).toEqual([]);
  });
});

describe("revokeAllThenWipe", () => {
  it("empty link list → wipes straight away, never asks for acknowledgement", async () => {
    const { deps, wipe, revoke, confirmProceedDespiteFailures } = makeDeps();

    const result = await revokeAllThenWipe(deps);

    expect(revoke).not.toHaveBeenCalled();
    expect(confirmProceedDespiteFailures).not.toHaveBeenCalled();
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ wiped: true, revokedCount: 0, failures: [] });
  });

  it("all links revoked → wipe proceeds without an acknowledgement prompt", async () => {
    const { deps, wipe, revoke, confirmProceedDespiteFailures } = makeDeps({
      listLinksToRevoke: async () => [link("a"), link("b"), link("c")],
    });

    const result = await revokeAllThenWipe(deps);

    expect(revoke).toHaveBeenCalledTimes(3);
    expect(confirmProceedDespiteFailures).not.toHaveBeenCalled();
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(result.wiped).toBe(true);
    expect(result.revokedCount).toBe(3);
    expect(result.failures).toEqual([]);
  });

  it("counts 404/410 as successful revokes (already gone) — no failure, no prompt", async () => {
    const revoke = vi.fn(async (id: string) => {
      if (id === "gone404") throw apiError(404);
      if (id === "gone410") throw apiError(410);
    });
    const { deps, wipe, confirmProceedDespiteFailures } = makeDeps({
      listLinksToRevoke: async () => [link("ok"), link("gone404"), link("gone410")],
      revoke,
    });

    const result = await revokeAllThenWipe(deps);

    expect(confirmProceedDespiteFailures).not.toHaveBeenCalled();
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ wiped: true, revokedCount: 3, failures: [] });
  });

  it("reports progress after every attempt (done of total)", async () => {
    const onProgress = vi.fn();
    const { deps } = makeDeps({
      listLinksToRevoke: async () => [link("a"), link("b")],
      onProgress,
    });

    await revokeAllThenWipe(deps);

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("some revokes fail → surfaces failures and REQUIRES acknowledgement before wiping", async () => {
    const revoke = vi.fn(async (id: string) => {
      if (id === "bad") throw apiError(500); // genuine server failure
    });
    const confirmProceedDespiteFailures = vi.fn(async () => true); // user acknowledges
    const { deps, wipe } = makeDeps({
      listLinksToRevoke: async () => [link("ok"), link("bad", "staging secret")],
      revoke,
      confirmProceedDespiteFailures,
    });

    const result = await revokeAllThenWipe(deps);

    // The failing link was surfaced to the acknowledgement gate...
    expect(confirmProceedDespiteFailures).toHaveBeenCalledTimes(1);
    const surfaced = confirmProceedDespiteFailures.mock.calls[0]?.[0] as RevokeFailure[];
    expect(surfaced.map((f) => f.link)).toEqual([{ id: "bad", label: "staging secret" }]);
    // ...and only after the ack does the wipe run.
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(result.wiped).toBe(true);
    expect(result.revokedCount).toBe(1);
    expect(result.failures.map((f) => f.link.id)).toEqual(["bad"]);
  });

  it("wipe is still possible AFTER the user acknowledges the failures", async () => {
    const revoke = vi.fn(async () => {
      throw apiError(503); // every revoke fails (offline / server down)
    });
    const confirmProceedDespiteFailures = vi.fn(async () => true);
    const { deps, wipe } = makeDeps({
      listLinksToRevoke: async () => [link("x"), link("y")],
      revoke,
      confirmProceedDespiteFailures,
    });

    const result = await revokeAllThenWipe(deps);

    expect(wipe).toHaveBeenCalledTimes(1);
    expect(result.wiped).toBe(true);
    expect(result.failures.map((f) => f.link.id)).toEqual(["x", "y"]);
  });

  it("declining the acknowledgement ABORTS the wipe (identity left intact)", async () => {
    const revoke = vi.fn(async () => {
      throw apiError(500);
    });
    const confirmProceedDespiteFailures = vi.fn(async () => false); // user cancels
    const { deps, wipe } = makeDeps({
      listLinksToRevoke: async () => [link("a")],
      revoke,
      confirmProceedDespiteFailures,
    });

    const result = await revokeAllThenWipe(deps);

    expect(confirmProceedDespiteFailures).toHaveBeenCalledTimes(1);
    expect(wipe).not.toHaveBeenCalled();
    expect(result.wiped).toBe(false);
    expect(result.revokedCount).toBe(0);
    expect(result.failures.map((f) => f.link.id)).toEqual(["a"]);
  });
});
