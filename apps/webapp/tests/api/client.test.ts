import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type CreateMessageRequest,
  classifyApiError,
  listMessages,
  MalformedResponseError,
  NetworkError,
  type OpenMessageResponse,
  openMessage,
  postMessage,
  REVOCATION_TOKEN_HEADER,
  revokeLink,
} from "@/src/api/client";

// process.env is replaced with {} in the browser test env (vitest.config define), so the client
// falls back to its default origin.
const API_ORIGIN = "https://api.aesmsg.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("postMessage POSTs JSON with exactly {id,ciphertext,expiresAt,maxOpens} and parses the response", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init as RequestInit;
      return jsonResponse(
        { id: "abc", url: "https://aesmsg.com/l/abc", revocationToken: "tok" },
        201,
      );
    });

    const req: CreateMessageRequest = {
      id: "AAAAAAAAAAAAAAAA",
      ciphertext: "Y2lwaGVy",
      expiresAt: "2030-01-01T00:00:00.000Z",
      maxOpens: 1,
    };
    const res = await postMessage(req);

    expect(capturedUrl).toBe(`${API_ORIGIN}/api/messages`);
    expect(capturedInit?.method).toBe("POST");
    expect((capturedInit?.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
    const sent = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["ciphertext", "expiresAt", "id", "maxOpens"]);
    expect(res).toEqual({ id: "abc", url: "https://aesmsg.com/l/abc", revocationToken: "tok" });
  });

  it("postMessage throws MalformedResponseError on a garbage 200 body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ nope: true }, 201));
    await expect(
      postMessage({ id: "x", ciphertext: "y", expiresAt: "z", maxOpens: 1 }),
    ).rejects.toBeInstanceOf(MalformedResponseError);
  });

  it("listMessages([]) short-circuits without a network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await listMessages([]);
    expect(res).toEqual({ results: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("listMessages posts the ids and parses the active/gone union", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { ids: string[] };
      expect(body.ids).toEqual(["id1", "id2"]);
      return jsonResponse({
        results: [
          {
            id: "id1",
            status: "active",
            expiresAt: "2030-01-01T00:00:00.000Z",
            maxOpens: 3,
            opensCount: 1,
          },
          { id: "id2", status: "gone" },
        ],
      });
    });
    const res = await listMessages(["id1", "id2"]);
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toMatchObject({ id: "id1", status: "active", opensCount: 1 });
    expect(res.results[1]).toEqual({ id: "id2", status: "gone" });
  });

  it("revokeLink sends the token header and an empty body, resolving on 2xx", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init as RequestInit;
      return jsonResponse({ id: "abc", status: "revoked" });
    });

    await revokeLink("abc", "secret-token");
    expect(capturedUrl).toBe(`${API_ORIGIN}/api/messages/abc/revoke`);
    expect(capturedInit?.method).toBe("POST");
    expect((capturedInit?.headers as Record<string, string>)[REVOCATION_TOKEN_HEADER]).toBe(
      "secret-token",
    );
    expect(capturedInit?.body).toBeUndefined();
  });

  it("revokeLink omits the token header when no token is supplied", async () => {
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      capturedInit = init as RequestInit;
      return jsonResponse({ id: "abc", status: "revoked" });
    });
    await revokeLink("abc");
    expect(
      (capturedInit?.headers as Record<string, string>)[REVOCATION_TOKEN_HEADER],
    ).toBeUndefined();
  });

  it("maps a rejected fetch to NetworkError → 'network'", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await postMessage({ id: "x", ciphertext: "y", expiresAt: "z", maxOpens: 1 }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(NetworkError);
    expect(classifyApiError(err)).toBe("network");
  });

  it("classifies each HTTP status into the right bucket", async () => {
    const cases: [number, string][] = [
      [400, "invalid"],
      [409, "conflict"],
      [404, "not_found"],
      [410, "gone"],
      [429, "rate_limited"],
      [500, "server"],
      [503, "server"],
      [418, "unknown"],
    ];
    for (const [status, kind] of cases) {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "x" }, status));
      const err = await postMessage({
        id: "x",
        ciphertext: "y",
        expiresAt: "z",
        maxOpens: 1,
      }).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(classifyApiError(err)).toBe(kind);
    }
  });

  it("classifies a MalformedResponseError as 'network' and unknown non-errors as 'unknown'", () => {
    expect(classifyApiError(new MalformedResponseError("bad"))).toBe("network");
    expect(classifyApiError(new Error("something else"))).toBe("unknown");
    expect(classifyApiError("nope")).toBe("unknown");
  });

  // ── openMessage (the reader's single open-consuming POST) ──────────────────────

  const OPEN_ID = "abcdefghijkl0123";

  const validOpenBody: OpenMessageResponse = {
    ciphertext: "Y2lwaGVydGV4dA==",
    createdAt: null,
    expiresAt: "2030-01-01T00:00:00.000Z",
    opensCount: 1,
    maxOpens: 1,
    status: "active",
  };

  it("openMessage POSTs to /api/messages/:id/open with NO body and parses the v2 response", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init as RequestInit;
      return jsonResponse(validOpenBody);
    });

    const res = await openMessage(OPEN_ID);

    expect(capturedUrl).toBe(`${API_ORIGIN}/api/messages/${OPEN_ID}/open`);
    expect(capturedInit?.method).toBe("POST");
    // The server 400s any body — the reader must send none (and no content-type).
    expect(capturedInit?.body).toBeUndefined();
    expect(capturedInit?.cache).toBe("no-store");
    expect(res).toEqual(validOpenBody);
  });

  it("openMessage preserves a legacy v1 createdAt string", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...validOpenBody, createdAt: "2026-01-01T00:00:00.000Z" }),
    );
    const res = await openMessage(OPEN_ID);
    expect(res.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("openMessage surfaces a 410 as ApiError(410) — the reader's opaque 'gone'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "gone" }, 410));
    const err = await openMessage(OPEN_ID).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(410);
  });

  it("openMessage surfaces a 400 as ApiError(400) — structurally invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "bad" }, 400));
    const err = await openMessage(OPEN_ID).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
  });

  it("openMessage throws MalformedResponseError on a garbage 200 body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ nope: true }));
    await expect(openMessage(OPEN_ID)).rejects.toBeInstanceOf(MalformedResponseError);
  });

  it("openMessage maps a rejected fetch to NetworkError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(openMessage(OPEN_ID)).rejects.toBeInstanceOf(NetworkError);
  });
});
