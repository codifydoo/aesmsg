import { afterEach, describe, expect, it, vi } from "vitest";

// expo-constants statically imports react-native (Flow syntax), unparseable under Node vitest.
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { aesmsgApiBaseUrl: "https://send.test", aesmsgLinkOrigin: "https://links.test" },
    },
  },
}));

import { postMessage, TimeoutError } from "@/src/api/client";

const REQ = {
  id: "abcdEFGH12345678",
  ciphertext: "AAAA",
  expiresAt: "2026-06-03T10:00:00.000Z",
  maxOpens: 1,
};

// A fetch that only settles when its AbortSignal fires — models a stalled upload so the timeout /
// cancel paths are observable without a real network.
function stalledFetch(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

describe("postMessage timeout + cancel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aborts a stalled upload after the timeout and rejects with TimeoutError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      stalledFetch(init as RequestInit),
    );
    await expect(postMessage(REQ, { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("an external cancel aborts the upload and rejects (NOT as a timeout)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      stalledFetch(init as RequestInit),
    );
    const external = new AbortController();
    // Give the timeout plenty of headroom so this rejection is unambiguously the cancel.
    const p = postMessage(REQ, { signal: external.signal, timeoutMs: 60_000 });
    external.abort();
    await expect(p).rejects.not.toBeInstanceOf(TimeoutError);
  });

  it("returns the create response when the upload completes before the timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: REQ.id, revocationToken: "tok" }), { status: 201 }),
    );
    const res = await postMessage(REQ, { timeoutMs: 5_000 });
    expect(res).toEqual({ id: REQ.id, revocationToken: "tok" });
  });
});
