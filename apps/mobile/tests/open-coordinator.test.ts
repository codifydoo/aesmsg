import { describe, expect, it, vi } from "vitest";
import type { OpenMessageResponse } from "@/src/api/client";
import { createOpenCoordinator } from "@/src/reader/open-coordinator";

// open-coordinator only TYPE-imports OpenMessageResponse (erased at runtime), so it loads in plain
// Node with no expo-constants / react-native dependency — nothing to mock here.
//
// These tests pin the FE-2 / R7 invariants directly on the pure coordinator: the /open POST (modeled
// by the `run` spy) is issued EXACTLY ONCE per intended read, is HELD across an unmount so a resume
// costs no second open, and is never issued at all when the user declines.

const ID = "abcdefghijkl0123";
const OTHER_ID = "zzzzzzzzzzzz9999";

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

// A manually-settled promise so a test can hold the POST "in flight" while it fires a second begin().
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("openCoordinator — single-tap open", () => {
  it("issues exactly one /open (run called once) and returns 'started'", async () => {
    const coord = createOpenCoordinator();
    const response = makeResponse();
    const run = vi.fn(async () => response);

    const result = coord.begin(ID, run);

    expect(result.kind).toBe("started");
    expect(run).toHaveBeenCalledTimes(1);
    if (result.kind === "started") await expect(result.promise).resolves.toBe(response);
  });
});

describe("openCoordinator — double-tap issues exactly ONE /open", () => {
  it("a second begin while in-flight JOINS the same POST (run called once)", async () => {
    const coord = createOpenCoordinator();
    const response = makeResponse();
    const d = deferred<OpenMessageResponse>();
    const run = vi.fn(() => d.promise);

    const first = coord.begin(ID, run); // tap 1 → issues the POST
    const second = coord.begin(ID, run); // tap 2 (still in-flight) → must NOT issue a second POST

    expect(first.kind).toBe("started");
    expect(second.kind).toBe("joined");
    expect(run).toHaveBeenCalledTimes(1);

    // Both taps resolve from the one POST.
    d.resolve(response);
    if (first.kind === "started") await expect(first.promise).resolves.toBe(response);
    if (second.kind === "joined") await expect(second.promise).resolves.toBe(response);

    // And a third begin after completion reuses the held ciphertext — still one POST total.
    const third = coord.begin(ID, run);
    expect(third.kind).toBe("held");
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("openCoordinator — resume after background retains ciphertext, no second /open", () => {
  it("holds the fetched response across an unmount so peek() returns it with no new POST", async () => {
    const coord = createOpenCoordinator();
    const response = makeResponse();
    const run = vi.fn(async () => response);

    // Mount 1: open, then the app is backgrounded (the reader unmounts) — we simply never clear().
    const started = coord.begin(ID, run);
    if (started.kind === "started") await started.promise;

    // Mount 2 (resume): the held ciphertext is still available and is NOT re-fetched.
    const snap = coord.peek(ID);
    expect(snap?.phase).toBe("held");
    expect(snap?.response).toBe(response);

    // Even an explicit re-begin on resume reuses the held response — zero additional POSTs.
    const resumed = coord.begin(ID, run);
    expect(resumed.kind).toBe("held");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a remount while the POST is still in flight JOINS it (peek exposes the pending promise)", async () => {
    const coord = createOpenCoordinator();
    const response = makeResponse();
    const d = deferred<OpenMessageResponse>();
    const run = vi.fn(() => d.promise);

    coord.begin(ID, run); // POST issued, still pending when the interruption hits

    // Resume mid-flight: peek surfaces the same promise to await — no new POST is started.
    const snap = coord.peek(ID);
    expect(snap?.phase).toBe("in-flight");
    expect(snap?.promise).toBeInstanceOf(Promise);

    d.resolve(response);
    await expect(snap?.promise).resolves.toBe(response);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("openCoordinator — decline consumes zero /open", () => {
  it("never calls run when the user backs out without opening", () => {
    const coord = createOpenCoordinator();
    const run = vi.fn(async () => makeResponse());

    // Decline = the flow calls clear()/onDone without ever calling begin().
    expect(coord.peek(ID)).toBeNull();
    coord.clear(ID);

    expect(run).not.toHaveBeenCalled();
    expect(coord.peek(ID)).toBeNull();
  });
});

describe("openCoordinator — a held session never re-opens (wrong-key retry cannot burn an open)", () => {
  it("returns 'held' (no run) once completed, modeling the removed DecryptionFailed retry", async () => {
    const coord = createOpenCoordinator();
    const response = makeResponse();
    const run = vi.fn(async () => response);

    const started = coord.begin(ID, run);
    if (started.kind === "started") await started.promise;

    // Whatever re-entry a (now-removed) retry might have caused: reuse the held ciphertext locally,
    // never a fresh POST.
    for (let i = 0; i < 3; i++) {
      const again = coord.begin(ID, run);
      expect(again.kind).toBe("held");
    }
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("openCoordinator — a failed POST resets to idle so a legitimate retry can re-open", () => {
  it("clears the session on rejection; the next begin issues a fresh POST", async () => {
    const coord = createOpenCoordinator();
    const failing = vi.fn(async () => {
      throw new Error("network down");
    });

    const first = coord.begin(ID, failing);
    expect(first.kind).toBe("started");
    if (first.kind === "started") await expect(first.promise).rejects.toThrow("network down");

    // No open was recorded — the coordinator is idle again.
    expect(coord.peek(ID)).toBeNull();

    // A retry (e.g. from the Network-error terminal) issues a brand-new POST.
    const response = makeResponse();
    const ok = vi.fn(async () => response);
    const retry = coord.begin(ID, ok);
    expect(retry.kind).toBe("started");
    expect(ok).toHaveBeenCalledTimes(1);
    if (retry.kind === "started") await expect(retry.promise).resolves.toBe(response);
  });
});

describe("openCoordinator — a different id supersedes the prior session", () => {
  it("opening another link drops the previous held ciphertext", async () => {
    const coord = createOpenCoordinator();
    const responseA = makeResponse({ ciphertext: "QQ==" });
    const runA = vi.fn(async () => responseA);
    const startedA = coord.begin(ID, runA);
    if (startedA.kind === "started") await startedA.promise;
    expect(coord.peek(ID)?.phase).toBe("held");

    const responseB = makeResponse({ ciphertext: "Qg==" });
    const runB = vi.fn(async () => responseB);
    const startedB = coord.begin(OTHER_ID, runB);

    expect(startedB.kind).toBe("started");
    expect(runB).toHaveBeenCalledTimes(1);
    // The old session is gone; peeking the old id yields nothing.
    expect(coord.peek(ID)).toBeNull();
  });

  it("clear() only forgets a matching id", async () => {
    const coord = createOpenCoordinator();
    const response = makeResponse();
    const run = vi.fn(async () => response);
    const started = coord.begin(ID, run);
    if (started.kind === "started") await started.promise;

    coord.clear(OTHER_ID); // wrong id — no effect
    expect(coord.peek(ID)?.phase).toBe("held");

    coord.clear(ID); // right id — forgotten
    expect(coord.peek(ID)).toBeNull();
  });
});
