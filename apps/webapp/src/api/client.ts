// Typed transport over the zero-knowledge message API (apps/api `/api/messages/*`). Mirrors the
// mobile client (apps/mobile/src/api/client.ts) transport + validators, adapted for the browser:
// the origin comes from NEXT_PUBLIC_AESMSG_API_ORIGIN (already in the SP1 CSP connect-src), and a
// rejected fetch (offline / DNS / CORS-blocked) is normalized to a NetworkError.
//
// SP2 ships create (postMessage), list (listMessages), and revoke (revokeLink). The reader's
// getMessage/openMessage response types are DECLARED for SP3 but not wired here.

const API_ORIGIN = process.env.NEXT_PUBLIC_AESMSG_API_ORIGIN ?? "https://api.aesmsg.com";

// Header carrying the secret revocation token that authenticates a revoke (BE-1 / R2). Must match the
// API's REVOCATION_TOKEN_HEADER (apps/api/src/lib/revocation-token.ts).
export const REVOCATION_TOKEN_HEADER = "x-aesmsg-revocation-token";

// Default per-request ceiling — a hung connection must never strand the sender's Encrypting overlay.
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

// ── Error taxonomy ──────────────────────────────────────────────────────────────

/** A non-2xx HTTP response. `status` preserves the exact 400/404/409/410/429/5xx classification. */
export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

/** Our own timeout aborted the request (distinct from a caller-initiated cancel → AbortError). */
export class TimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "TimeoutError";
  }
}

/** A 2xx body that is not JSON or structurally wrong. Treated as the safe, retryable network bucket. */
export class MalformedResponseError extends Error {
  constructor(detail: string) {
    super(`Malformed API response: ${detail}`);
    this.name = "MalformedResponseError";
  }
}

/** The fetch itself rejected: offline, DNS failure, or a CORS-blocked cross-origin request. */
export class NetworkError extends Error {
  constructor() {
    super("Network request failed");
    this.name = "NetworkError";
  }
}

/**
 * Map any thrown transport error to a calm, leak-free bucket screens can render copy for. The links
 * list treats 404/410/"gone" uniformly as "no longer available".
 */
export type ApiErrorKind =
  | "network"
  | "not_found"
  | "gone"
  | "rate_limited"
  | "invalid"
  | "conflict"
  | "server"
  | "unknown";

export function classifyApiError(err: unknown): ApiErrorKind {
  // Timeout + malformed body are safe, retryable transport-level failures (never a leak of detail).
  if (err instanceof NetworkError || err instanceof TimeoutError) return "network";
  if (err instanceof MalformedResponseError) return "network";
  if (err instanceof ApiError) {
    if (err.status === 404) return "not_found";
    if (err.status === 410) return "gone";
    if (err.status === 429) return "rate_limited";
    // 409 is a link-id collision — NOT a caller-fixable validation error, so it gets its own bucket
    // with retry-oriented copy (a fresh id is minted on retry). 400 is genuine bad-input (e.g. an
    // expiry beyond the retention ceiling) and keeps the "double-check the expiry" copy.
    if (err.status === 409) return "conflict";
    if (err.status === 400) return "invalid";
    if (err.status >= 500) return "server";
    return "unknown";
  }
  return "unknown";
}

// ── Reliability knobs ─────────────────────────────────────────────────────────────

export interface RequestOptions {
  /** Abort + reject with TimeoutError after this many ms. Defaults to DEFAULT_REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
  /** External cancel signal (e.g. a "Cancel" button). Aborting rejects with the underlying AbortError. */
  signal?: AbortSignal;
}

async function requestWithTimeout(
  path: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: externalSignal } = options;
  const url = `${API_ORIGIN}${path}`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", forwardAbort);
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // Our own timeout → a distinct, actionable error.
    if (timedOut) throw new TimeoutError();
    // A caller-initiated cancel surfaces the underlying AbortError so a user cancel reads as a cancel.
    if (externalSignal?.aborted) throw err;
    // Everything else (offline, DNS, CORS-blocked) is a network failure.
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", forwardAbort);
  }
}

async function fetchJson<T>(
  path: string,
  init: RequestInit,
  validate: (body: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const res = await requestWithTimeout(path, init, options);
  if (!res.ok) throw new ApiError(res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MalformedResponseError("body was not valid JSON");
  }
  return validate(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── Create ────────────────────────────────────────────────────────────────────────

export interface CreateMessageRequest {
  id: string;
  ciphertext: string; // base64
  expiresAt: string; // ISO 8601
  maxOpens: number; // positive int, or -1 for unlimited
}

export interface CreateMessageResponse {
  id: string;
  /** Shareable link the server minted: `${AESMSG_PUBLIC_LINK_ORIGIN}/l/<id>` (aesmsg.com bouncer). */
  url: string;
  /** Secret revocation token, returned EXACTLY ONCE at create and never retrievable again. */
  revocationToken: string;
}

function validateCreateMessageResponse(body: unknown): CreateMessageResponse {
  if (!isRecord(body)) throw new MalformedResponseError("create response was not an object");
  if (typeof body.id !== "string" || body.id.length === 0)
    throw new MalformedResponseError("create response is missing id");
  if (typeof body.url !== "string" || body.url.length === 0)
    throw new MalformedResponseError("create response is missing url");
  if (typeof body.revocationToken !== "string" || body.revocationToken.length === 0)
    throw new MalformedResponseError("create response is missing revocationToken");
  return body as unknown as CreateMessageResponse;
}

/** Upload the ciphertext + minimal metadata. The server stores ciphertext only. */
export async function postMessage(
  req: CreateMessageRequest,
  options: RequestOptions = {},
): Promise<CreateMessageResponse> {
  return fetchJson(
    "/api/messages",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    },
    validateCreateMessageResponse,
    options,
  );
}

// ── List (bulk status) ──────────────────────────────────────────────────────────

// One result per requested id. The server echoes a live row as { status: "active", … }; not_found /
// revoked / expired / past-expiry all collapse to { status: "gone" }.
export type ListMessageResult =
  | { id: string; status: "gone" }
  | { id: string; status: "active"; expiresAt: string; maxOpens: number; opensCount: number };

export interface ListMessagesResponse {
  results: ListMessageResult[];
}

function validateListMessagesResponse(body: unknown): ListMessagesResponse {
  if (!isRecord(body) || !Array.isArray(body.results))
    throw new MalformedResponseError("list response.results was not an array");
  for (const result of body.results) {
    if (!isRecord(result) || typeof result.id !== "string")
      throw new MalformedResponseError("list result is missing id");
    if (result.status === "gone") continue;
    if (result.status === "active") {
      if (
        typeof result.expiresAt !== "string" ||
        typeof result.maxOpens !== "number" ||
        typeof result.opensCount !== "number"
      )
        throw new MalformedResponseError("active list result is missing fields");
      continue;
    }
    throw new MalformedResponseError("list result has an unknown status");
  }
  return body as unknown as ListMessagesResponse;
}

/**
 * Bulk status fetch for the sender's locally-tracked links. Metadata only — never consumes an open,
 * never returns ciphertext. An empty id list short-circuits (the server rejects `[]` as 400).
 */
export async function listMessages(
  ids: string[],
  options: RequestOptions = {},
): Promise<ListMessagesResponse> {
  if (ids.length === 0) return { results: [] };
  return fetchJson(
    "/api/messages/list",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
      cache: "no-store",
    },
    validateListMessagesResponse,
    options,
  );
}

// ── Revoke ─────────────────────────────────────────────────────────────────────

/**
 * Revoke a link: purges the ciphertext server-side. Authenticated by the secret revocation token,
 * sent in a HEADER (never the body: /revoke rejects non-empty bodies). Opaque server-side — always a
 * 200 — but only actually revokes when the token matches. Resolves on 2xx; throws ApiError otherwise.
 */
export async function revokeLink(
  id: string,
  revocationToken?: string | null,
  options: RequestOptions = {},
): Promise<void> {
  const headers: Record<string, string> = {};
  if (revocationToken) headers[REVOCATION_TOKEN_HEADER] = revocationToken;
  const res = await requestWithTimeout(
    `/api/messages/${encodeURIComponent(id)}/revoke`,
    { method: "POST", headers },
    options,
  );
  if (!res.ok) throw new ApiError(res.status);
}

// ── Reader types (SP3 — declared, not wired here) ─────────────────────────────────

export interface MessageMetadata {
  status: "active" | "revoked" | "expired";
  expiresAt: string;
  maxOpens: number;
  opensCount: number;
}

export interface OpenMessageResponse {
  ciphertext: string;
  /** string for legacy v1 links; null for v2 (the reader rebuilds the v2 AAD without it). */
  createdAt: string | null;
  expiresAt: string;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}
