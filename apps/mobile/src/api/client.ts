import Constants from "expo-constants";

// BASE_URL is the API origin (api.aesmsg.com) used for all network calls; LINK_ORIGIN is the
// web/universal-link host (aesmsg.com) used ONLY to build shareable /l/:id links. They are
// intentionally different hosts: the app intercepts links on the web host, while the API lives on
// its own standalone host. Both are injected at build time via app.config.ts `extra`.
export const BASE_URL = (Constants.expoConfig?.extra?.aesmsgApiBaseUrl as string) ?? "";
export const LINK_ORIGIN = (Constants.expoConfig?.extra?.aesmsgLinkOrigin as string) ?? "";

export interface MessageMetadata {
  status: "active" | "revoked" | "expired";
  expiresAt: string;
  maxOpens: number;
  opensCount: number;
}

export interface OpenMessageResponse {
  ciphertext: string;
  // createdAt is returned ONLY for legacy v1 links (whose AAD binds it). v2 links return null
  // and the reader reconstructs the v2 AAD without it. No recipient fingerprint is returned.
  createdAt: string | null;
  expiresAt: string;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

// Thrown when a request exceeds its timeout (the fetch was aborted by our own timer, not the
// caller). Distinct from a caller-initiated cancel (which rejects with the underlying AbortError)
// so the UI can tell "the network stalled" apart from "you cancelled".
export class TimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "TimeoutError";
  }
}

// Thrown when a 2xx response body is structurally wrong (not JSON, wrong shape, or missing a field
// a caller depends on). Deliberately NOT an ApiError: a caller that classifies errors by HTTP
// status (the reader's classifyReaderError) treats this as the safe, retryable "network" bucket
// rather than feeding `undefined`/garbage into reconciliation or the decrypt path.
export class MalformedResponseError extends Error {
  constructor(detail: string) {
    super(`Malformed API response: ${detail}`);
    this.name = "MalformedResponseError";
  }
}

// Thrown when the API base URL is missing in a build that MUST have one (a production release).
// Fails the request fast with a clear diagnostic instead of silently issuing a request to a blank /
// relative host and surfacing an inscrutable transport error.
export class ConfigError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ConfigError";
  }
}

// Default ceiling for every request. A hung connection must not strand the UI (e.g. the Encrypting
// overlay, UX §B) forever; after this the fetch is aborted and a TimeoutError is surfaced.
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
// Back-compat alias for the create/upload path (kept so external references keep resolving).
export const DEFAULT_UPLOAD_TIMEOUT_MS = DEFAULT_REQUEST_TIMEOUT_MS;

/** Per-request reliability knobs shared by every call. */
export interface RequestOptions {
  /** Abort the request after this many ms and reject with TimeoutError. Defaults to DEFAULT_REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
  /**
   * External abort signal (e.g. the sender tapping "Cancel"). Aborting rejects with the underlying
   * AbortError (NOT a TimeoutError), so a user cancel reads as a cancel.
   */
  signal?: AbortSignal;
}

// __DEV__ is injected by the RN/Metro bundler: `false` in a release build, `true` in a dev build.
// It is read via globalThis (never a bare identifier) so this compiles under Node/Vitest, where the
// global is absent → treated as non-production, letting the pure-logic tests (which mock the base
// URL to "") keep issuing root-relative requests exactly as before.
function isProductionRuntime(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === false;
}

// Resolve the base URL for a request. A production build with no base URL configured is a
// misconfiguration we refuse to paper over: fail fast with a clear ConfigError rather than fetch a
// blank/relative host. Dev and test builds tolerate an empty base (root-relative requests).
function requireBaseUrl(): string {
  if (BASE_URL === "" && isProductionRuntime()) {
    throw new ConfigError(
      "aesmsg API base URL is not configured (expo extra.aesmsgApiBaseUrl is empty). " +
        "A production build must be built with AESMSG_API_BASE_URL set — refusing to issue requests to a blank host.",
    );
  }
  return BASE_URL;
}

// Core transport shared by every call: resolves + prepends the base URL, arms an AbortController
// timeout, and forwards an optional external cancel signal. Distinguishes our own timeout (→
// TimeoutError) from a caller-initiated cancel (→ the underlying AbortError). Returns the raw
// Response; status/shape handling belongs to the caller (or fetchJson).
async function requestWithTimeout(
  path: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: externalSignal } = options;
  const url = `${requireBaseUrl()}${path}`;

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
    // Our own timeout aborted the fetch → surface a distinct, actionable error rather than a raw
    // AbortError (which is reserved for the caller's explicit cancel).
    if (timedOut) throw new TimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", forwardAbort);
  }
}

// Timeout-guarded request that parses + validates a JSON body. A non-ok status throws ApiError(status)
// — preserving the exact 400/404/410/429/5xx classification the reader (classifyReaderError) and the
// links reconciliation depend on. A 2xx body that is not JSON or fails the caller's shape check throws
// MalformedResponseError instead of returning garbage.
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

function isKnownStatus(value: unknown): value is "active" | "revoked" | "expired" {
  return value === "active" || value === "revoked" || value === "expired";
}

// Minimal shape checks (type-of, not a schema lib). Each validator asserts only the fields the
// callers actually consume, then passes the original body through so unrelated extra fields survive.
function validateMessageMetadata(body: unknown): MessageMetadata {
  if (!isRecord(body)) throw new MalformedResponseError("metadata was not an object");
  if (!isKnownStatus(body.status))
    throw new MalformedResponseError("metadata.status is missing or unknown");
  if (typeof body.expiresAt !== "string")
    throw new MalformedResponseError("metadata.expiresAt was not a string");
  if (typeof body.maxOpens !== "number")
    throw new MalformedResponseError("metadata.maxOpens was not a number");
  if (typeof body.opensCount !== "number")
    throw new MalformedResponseError("metadata.opensCount was not a number");
  return body as unknown as MessageMetadata;
}

function validateOpenMessageResponse(body: unknown): OpenMessageResponse {
  if (!isRecord(body)) throw new MalformedResponseError("open response was not an object");
  // ciphertext is the load-bearing field: the reader base64-decodes and decrypts it.
  if (typeof body.ciphertext !== "string" || body.ciphertext.length === 0)
    throw new MalformedResponseError("open response is missing ciphertext");
  if (typeof body.expiresAt !== "string")
    throw new MalformedResponseError("open response.expiresAt was not a string");
  // createdAt is string for legacy v1 links and null for v2 — both drive the AAD reconstruction.
  if (body.createdAt !== null && typeof body.createdAt !== "string")
    throw new MalformedResponseError("open response.createdAt was not a string or null");
  if (typeof body.maxOpens !== "number")
    throw new MalformedResponseError("open response.maxOpens was not a number");
  if (typeof body.opensCount !== "number")
    throw new MalformedResponseError("open response.opensCount was not a number");
  if (!isKnownStatus(body.status))
    throw new MalformedResponseError("open response.status is missing or unknown");
  return body as unknown as OpenMessageResponse;
}

function validateCreateMessageResponse(body: unknown): CreateMessageResponse {
  if (!isRecord(body)) throw new MalformedResponseError("create response was not an object");
  if (typeof body.id !== "string" || body.id.length === 0)
    throw new MalformedResponseError("create response is missing id");
  // revocationToken is optional: legacy server rows (created before authenticated revocation) omit
  // it. When present it must be a string.
  if (body.revocationToken !== undefined && typeof body.revocationToken !== "string")
    throw new MalformedResponseError("create response.revocationToken was not a string");
  return body as unknown as CreateMessageResponse;
}

function validateListMessagesResponse(body: unknown): ListMessagesResponse {
  if (!isRecord(body) || !Array.isArray(body.results))
    throw new MalformedResponseError("list response.results was not an array");
  for (const result of body.results) {
    if (!isRecord(result) || typeof result.id !== "string")
      throw new MalformedResponseError("list result is missing id");
    if (result.status === "gone") continue;
    if (result.status === "active") {
      // The active branch feeds numeric/date fields straight into reconciliation — validate them so
      // a malformed row can never masquerade as a live link with NaN/undefined metadata.
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

// Metadata only — safe preview, never consumes an open.
export async function getMessage(
  id: string,
  options: RequestOptions = {},
): Promise<MessageMetadata> {
  return fetchJson(
    `/api/messages/${encodeURIComponent(id)}`,
    { cache: "no-store" },
    validateMessageMetadata,
    options,
  );
}

// Consumes one open and returns the base64 ciphertext.
export async function openMessage(
  id: string,
  options: RequestOptions = {},
): Promise<OpenMessageResponse> {
  return fetchJson(
    `/api/messages/${encodeURIComponent(id)}/open`,
    { method: "POST" },
    validateOpenMessageResponse,
    options,
  );
}

export interface CreateMessageRequest {
  id: string;
  ciphertext: string; // base64
  expiresAt: string; // ISO 8601
  maxOpens: number;
}

export interface CreateMessageResponse {
  id: string;
  // Secret revocation token (BE-1 / R2), returned by the server EXACTLY ONCE at create and never
  // retrievable again. The client must persist it (encrypted at rest) to be able to revoke the link;
  // without it, only legacy server rows (created before authenticated revocation) can be revoked.
  revocationToken: string;
}

// Options for the create/upload. Extends the shared reliability knobs; the timeout defaults to
// DEFAULT_REQUEST_TIMEOUT_MS (== DEFAULT_UPLOAD_TIMEOUT_MS) so the Encrypting overlay can never
// strand the user on a hung connection.
export type PostMessageOptions = RequestOptions;

// Uploads the ciphertext + minimal metadata. The server stores ciphertext only. Guards against a
// hung connection with an internal timeout, and honors an external cancel signal — both abort the
// in-flight fetch (UX §B: the Encrypting overlay must never strand the user).
export async function postMessage(
  req: CreateMessageRequest,
  options: PostMessageOptions = {},
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

// ── Sent-links list + revoke (mirrors the web /links page) ──────────────────────
// One result per requested id. The server only echoes a live row as { status: "active", … };
// not_found / revoked / expired / past-expiry all collapse to { status: "gone" }.
export type ListMessageResult =
  | { id: string; status: "gone" }
  | {
      id: string;
      status: "active";
      expiresAt: string;
      maxOpens: number;
      opensCount: number;
    };

export interface ListMessagesResponse {
  results: ListMessageResult[];
}

// Bulk status fetch for the sender's locally-tracked links. Metadata only — never consumes an open
// and never returns ciphertext. An empty id list short-circuits (the server rejects [] as 400).
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

// Header carrying the secret revocation token to authenticate a revoke (BE-1 / R2). Must match the
// API's REVOCATION_TOKEN_HEADER (apps/api/src/lib/revocation-token.ts).
const REVOCATION_TOKEN_HEADER = "x-aesmsg-revocation-token";

// Revoke a link: purges the ciphertext server-side. Authenticated by the secret revocation token
// (BE-1 / R2) — minted at create, persisted with the sent-link record, and sent here in a HEADER
// (never the body: /revoke rejects non-empty bodies). Semantics are opaque server-side: the server
// always answers 200, but only actually revokes when the token matches (or for a legacy row created
// before authenticated revocation). Records with no token (`undefined`/`null`) still attempt the
// revoke un-tokened — legacy server rows honor it. Resolves on a 2xx, throws ApiError otherwise.
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
