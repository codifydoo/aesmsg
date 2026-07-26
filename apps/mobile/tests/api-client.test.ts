import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  ConfigError,
  type CreateMessageRequest,
  getMessage,
  listMessages,
  MalformedResponseError,
  openMessage,
  postMessage,
  revokeLink,
  TimeoutError,
} from "@/src/api/client";

// expo-constants (SDK 56) statically imports react-native, whose Flow syntax cannot be parsed
// under Node vitest, so it MUST be mocked. The empty base URL mirrors client.ts's `?? ""`
// production default, keeping the asserted request paths root-relative.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "" } } },
}));

afterEach(() => {
  vi.restoreAllMocks();
  // Some tests flip the RN/Metro `__DEV__` global to false to simulate a production build; make sure
  // that never bleeds into the next case (which would make the empty base URL throw ConfigError).
  vi.unstubAllGlobals();
});

const METADATA = {
  status: "active" as const,
  recipientFingerprint: "fp-abc",
  createdAt: "2026-05-10T12:00:00.000Z",
  expiresAt: "2026-05-11T12:00:00.000Z",
  maxOpens: 1,
  opensCount: 0,
};

const OPEN_RESPONSE = {
  ciphertext: "AAAA",
  recipientFingerprint: "fp-abc",
  createdAt: "2026-05-10T12:00:00.000Z",
  expiresAt: "2026-05-11T12:00:00.000Z",
  opensCount: 1,
  maxOpens: 1,
  status: "active" as const,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api-client", () => {
  describe("getMessage", () => {
    it("issues a GET (no method) to /api/messages/:id with cache: no-store and returns parsed metadata", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(METADATA));

      const result = await getMessage("abcdefghijkl0123");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] ?? [];
      expect(String(url)).toContain("/api/messages/abcdefghijkl0123");
      // A safe preview must never consume an open: GET, never POST.
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.cache).toBe("no-store");
      expect(result).toEqual(METADATA);
    });

    it("throws ApiError with .status and .name on a non-ok response (404)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 404));

      const err = await getMessage("abcdefghijkl0123").then(
        () => {
          throw new Error("expected getMessage to reject");
        },
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      expect((err as ApiError).name).toBe("ApiError");
    });

    it("throws ApiError carrying the 410 status (gone / revoked / expired)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 410));

      await expect(getMessage("abcdefghijkl0123")).rejects.toMatchObject({
        name: "ApiError",
        status: 410,
      });
    });
  });

  describe("openMessage", () => {
    it("issues a POST to /api/messages/:id/open and returns the parsed response", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(OPEN_RESPONSE));

      const result = await openMessage("abcdefghijkl0123");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] ?? [];
      expect(String(url)).toContain("/api/messages/abcdefghijkl0123/open");
      expect(init?.method).toBe("POST");
      expect(result).toEqual(OPEN_RESPONSE);
    });

    it("throws ApiError with .status on a non-ok response (429 rate limited)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 429));

      await expect(openMessage("abcdefghijkl0123")).rejects.toMatchObject({
        name: "ApiError",
        status: 429,
      });
    });

    // The server rejects ANY body on /open (BE-2 / R3). Omitting `body` looks correct but is not:
    // expo/fetch's Android native layer cannot issue a bodyless POST — OkHttp demands a non-null
    // body, so it substitutes a single NUL byte, which the server reads as a real body and 400s.
    // That 400 classifies as "invalid" and shows the recipient "not a valid secure message", so the
    // Android app could never open a link. Passing an EXPLICIT empty body keeps expo/fetch on its
    // caller-supplied path and sends a true Content-Length: 0 on both platforms.
    it("sends an explicit empty body so Android's fetch cannot substitute a NUL byte", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(OPEN_RESPONSE));

      await openMessage("abcdefghijkl0123");

      const [, init] = fetchSpy.mock.calls[0] ?? [];
      expect(init?.body).toBe("");
    });
  });

  describe("postMessage", () => {
    const req: CreateMessageRequest = {
      id: "abcdefghijklmnop",
      recipientFingerprint: "AM-0000-0000",
      ciphertext: "AAAA",
      createdAtMs: 1_700_000_000_000,
      expiresAt: new Date(1_700_000_000_000 + 86_400_000).toISOString(),
      maxOpens: 1,
    };

    afterEach(() => vi.restoreAllMocks());

    it("POSTs JSON to /api/messages and returns the parsed body", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ id: req.id }), { status: 201 }));
      const res = await postMessage(req);
      expect(res.id).toBe(req.id);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/messages$/);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({ id: req.id, maxOpens: 1 });
    });

    it("throws ApiError on a non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
      await expect(postMessage(req)).rejects.toMatchObject({ name: "ApiError", status: 500 });
    });
  });
});

// A fetch that never resolves on its own but rejects with an AbortError the moment the request's
// signal fires — exactly how the platform fetch behaves when our internal timeout aborts it. Lets a
// tiny timeoutMs drive the TimeoutError path deterministically without fake timers.
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

describe("api-client reliability (FE-3)", () => {
  const createReq: CreateMessageRequest = {
    id: "abcdefghijklmnop",
    ciphertext: "AAAA",
    expiresAt: new Date(1_700_000_000_000 + 86_400_000).toISOString(),
    maxOpens: 1,
  };

  describe("request timeouts fire on every call type", () => {
    it("getMessage rejects with TimeoutError when the request hangs past the timeout", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch());
      await expect(getMessage("abcdefghijkl0123", { timeoutMs: 5 })).rejects.toBeInstanceOf(
        TimeoutError,
      );
    });

    it("openMessage rejects with TimeoutError when the request hangs past the timeout", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch());
      await expect(openMessage("abcdefghijkl0123", { timeoutMs: 5 })).rejects.toBeInstanceOf(
        TimeoutError,
      );
    });

    it("postMessage rejects with TimeoutError when the upload hangs past the timeout", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch());
      await expect(postMessage(createReq, { timeoutMs: 5 })).rejects.toBeInstanceOf(TimeoutError);
    });

    it("listMessages rejects with TimeoutError when the request hangs past the timeout", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch());
      await expect(listMessages(["abcdefghijkl0123"], { timeoutMs: 5 })).rejects.toBeInstanceOf(
        TimeoutError,
      );
    });

    it("revokeLink rejects with TimeoutError when the request hangs past the timeout", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch());
      await expect(revokeLink("abcdefghijkl0123", null, { timeoutMs: 5 })).rejects.toBeInstanceOf(
        TimeoutError,
      );
    });

    it("a caller-initiated cancel rejects with the AbortError, NOT a TimeoutError", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch());
      const controller = new AbortController();
      const pending = postMessage(createReq, { signal: controller.signal, timeoutMs: 60_000 });
      controller.abort();
      const err = await pending.then(
        () => {
          throw new Error("expected the cancel to reject");
        },
        (e: unknown) => e,
      );
      expect(err).not.toBeInstanceOf(TimeoutError);
      expect((err as { name?: string }).name).toBe("AbortError");
    });
  });

  describe("malformed 2xx responses throw MalformedResponseError (never return garbage)", () => {
    it("getMessage: body is not an object", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse("not-an-object"));
      await expect(getMessage("abcdefghijkl0123")).rejects.toBeInstanceOf(MalformedResponseError);
    });

    it("getMessage: missing a required field (expiresAt)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ status: "active", maxOpens: 1, opensCount: 0 }),
      );
      await expect(getMessage("abcdefghijkl0123")).rejects.toBeInstanceOf(MalformedResponseError);
    });

    it("getMessage: body is not valid JSON at all", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not json{", { status: 200 }));
      await expect(getMessage("abcdefghijkl0123")).rejects.toBeInstanceOf(MalformedResponseError);
    });

    it("openMessage: missing ciphertext (the load-bearing field)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({
          createdAt: null,
          expiresAt: "2026-05-11T12:00:00.000Z",
          opensCount: 1,
          maxOpens: 1,
          status: "active",
        }),
      );
      await expect(openMessage("abcdefghijkl0123")).rejects.toBeInstanceOf(MalformedResponseError);
    });

    it("postMessage: response has no id", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 201));
      await expect(postMessage(createReq)).rejects.toBeInstanceOf(MalformedResponseError);
    });

    it("listMessages: results is not an array", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ results: "nope" }));
      await expect(listMessages(["abcdefghijkl0123"])).rejects.toBeInstanceOf(
        MalformedResponseError,
      );
    });

    it("listMessages: an active result is missing its numeric fields", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ results: [{ id: "abcdefghijkl0123", status: "active" }] }),
      );
      await expect(listMessages(["abcdefghijkl0123"])).rejects.toBeInstanceOf(
        MalformedResponseError,
      );
    });
  });

  describe("HTTP-status classification is unchanged (reader/links depend on ApiError.status)", () => {
    it("getMessage 400 → ApiError(400) [structural 'not a link' → reader 'invalid']", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 400));
      await expect(getMessage("abcdefghijkl0123")).rejects.toMatchObject({
        name: "ApiError",
        status: 400,
      });
    });

    it("openMessage 410 → ApiError(410) [gone → reader opaque 'gone']", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 410));
      await expect(openMessage("abcdefghijkl0123")).rejects.toMatchObject({
        name: "ApiError",
        status: 410,
      });
    });

    it("openMessage 404 → ApiError(404) [gone → reader opaque 'gone']", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 404));
      await expect(openMessage("abcdefghijkl0123")).rejects.toMatchObject({
        name: "ApiError",
        status: 404,
      });
    });
  });

  describe("empty base URL fails fast in a production build", () => {
    it("getMessage throws ConfigError and issues NO fetch when __DEV__ === false and the base is empty", async () => {
      // Simulate a release build: the RN/Metro `__DEV__` global is false. The mocked base URL is "".
      vi.stubGlobal("__DEV__", false);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await expect(getMessage("abcdefghijkl0123")).rejects.toBeInstanceOf(ConfigError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("postMessage throws ConfigError and issues NO fetch in a production build with an empty base", async () => {
      vi.stubGlobal("__DEV__", false);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await expect(postMessage(createReq)).rejects.toBeInstanceOf(ConfigError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("dev/test builds (no __DEV__ / undefined) tolerate an empty base and still issue the request", async () => {
      // No __DEV__ stub → undefined → non-production → root-relative request proceeds as today.
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(METADATA));
      await getMessage("abcdefghijkl0123");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/messages/abcdefghijkl0123");
    });
  });
});
