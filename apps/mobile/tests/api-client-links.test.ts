import { afterEach, describe, expect, it, vi } from "vitest";

// expo-constants statically imports react-native (Flow syntax), unparseable under Node vitest, so
// it MUST be mocked. Empty base URL mirrors client.ts's `?? ""`, keeping request paths root-relative.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "" } } },
}));

import {
  ConfigError,
  listMessages,
  MalformedResponseError,
  revokeLink,
  TimeoutError,
} from "@/src/api/client";

afterEach(() => {
  vi.restoreAllMocks();
  // A test flips `__DEV__` to false to simulate a production build; never let it bleed forward.
  vi.unstubAllGlobals();
});

// A fetch that never resolves on its own but rejects with an AbortError the moment the request's
// signal fires — mirroring the platform fetch when our internal timeout aborts it.
function hangingFetch(): typeof fetch {
  return ((_url: string | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort);
      }
    })) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("listMessages", () => {
  it("POSTs the ids array to /api/messages/list and returns the parsed results", async () => {
    const body = {
      results: [
        {
          id: "aaaaaaaaaaaaaaaa",
          status: "active",
          expiresAt: "2026-06-01T10:00:00.000Z",
          maxOpens: 3,
          opensCount: 1,
        },
        { id: "bbbbbbbbbbbbbbbb", status: "gone" },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));

    const res = await listMessages(["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"]);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/messages\/list$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      ids: ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"],
    });
    expect(res).toEqual(body);
  });

  it("returns { results: [] } without a network call when ids is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await listMessages([]);
    expect(res).toEqual({ results: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws ApiError carrying the status on a non-ok response (429 rate limited)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 429));
    await expect(listMessages(["aaaaaaaaaaaaaaaa"])).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
    });
  });
});

function headerValue(init: RequestInit | undefined, name: string): string | null {
  // revokeLink builds a plain Record<string,string>; normalize to a Headers lookup so the assertion
  // is robost to case and shape.
  return new Headers((init?.headers ?? {}) as HeadersInit).get(name);
}

const REVOCATION_TOKEN_HEADER = "x-aesmsg-revocation-token";

describe("revokeLink", () => {
  it("POSTs to /api/messages/:id/revoke and resolves on success (no token → no header)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ id: "aaaaaaaaaaaaaaaa", status: "revoked" }));

    // Legacy record with no token: still attempts the revoke, but sends NO token header.
    await revokeLink("aaaaaaaaaaaaaaaa");

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/messages/aaaaaaaaaaaaaaaa/revoke");
    expect(init?.method).toBe("POST");
    expect(headerValue(init, REVOCATION_TOKEN_HEADER)).toBeNull();
  });

  it("sends the secret token in the x-aesmsg-revocation-token header when provided (BE-1 / R2)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ id: "aaaaaaaaaaaaaaaa", status: "revoked" }));

    await revokeLink("aaaaaaaaaaaaaaaa", "revtok-secret-123");

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(headerValue(init, REVOCATION_TOKEN_HEADER)).toBe("revtok-secret-123");
  });

  it("omits the token header when the token is null (never sends an empty header)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ id: "aaaaaaaaaaaaaaaa", status: "revoked" }));

    await revokeLink("aaaaaaaaaaaaaaaa", null);

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(headerValue(init, REVOCATION_TOKEN_HEADER)).toBeNull();
  });

  it("throws ApiError on a non-ok revoke response (400 bad id)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 400));
    await expect(revokeLink("../../etc")).rejects.toMatchObject({ name: "ApiError", status: 400 });
  });
});

describe("api-client reliability (FE-3) — links + revoke", () => {
  it("listMessages rejects with TimeoutError when the request hangs past the timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch());
    await expect(listMessages(["aaaaaaaaaaaaaaaa"], { timeoutMs: 5 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it("revokeLink rejects with TimeoutError when the request hangs past the timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch());
    await expect(
      revokeLink("aaaaaaaaaaaaaaaa", "revtok-secret-123", { timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("listMessages throws MalformedResponseError when a 'gone' result has no id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ results: [{ status: "gone" }] }),
    );
    await expect(listMessages(["aaaaaaaaaaaaaaaa"])).rejects.toBeInstanceOf(MalformedResponseError);
  });

  it("listMessages throws MalformedResponseError on an unknown per-result status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ results: [{ id: "aaaaaaaaaaaaaaaa", status: "weird" }] }),
    );
    await expect(listMessages(["aaaaaaaaaaaaaaaa"])).rejects.toBeInstanceOf(MalformedResponseError);
  });

  it("empty base URL in a production build (__DEV__ === false) fails fast with ConfigError, no fetch", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(listMessages(["aaaaaaaaaaaaaaaa"])).rejects.toBeInstanceOf(ConfigError);
    await expect(revokeLink("aaaaaaaaaaaaaaaa")).rejects.toBeInstanceOf(ConfigError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
