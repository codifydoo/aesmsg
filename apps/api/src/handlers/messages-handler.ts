import type {
  CiphertextStore,
  LinkId,
  LinkMetadataStore,
  RateLimitStore,
} from "@aesmsg/server-store/memory";
import { bytesToBase64 } from "../lib/base64";
import { getClientIp } from "../lib/client-ip";
import { hashIp } from "../lib/hash-ip";
import { LINK_ID_REGEX } from "../lib/link-id";
import {
  hashRevocationToken,
  mintRevocationToken,
  REVOCATION_TOKEN_HEADER,
} from "../lib/revocation-token";

export interface MessagesHandlerDeps {
  links: LinkMetadataStore;
  ciphertexts: CiphertextStore;
  rateLimit: RateLimitStore;
  now: () => Date;
  publicLinkOrigin: string;
  /**
   * Global retention ceiling (roadmap 2.5, SEC-6/PG-6/PG-8): the maximum lifetime, in ms, that a
   * created link may have (`expiresAt - now`). Bounds free "keep forever" links so the backend can't
   * become a permanent blob host. Optional so existing call sites/tests default to
   * DEFAULT_MAX_RETENTION_MS; production resolves it from AESMSG_MAX_RETENTION_MS (see server.ts).
   *
   * The server REJECTS an over-ceiling create (opaque 400) — it MUST NOT clamp expiresAt, because the
   * client seals the chosen expiry into the HPKE AAD and the recipient rebuilds that AAD from the
   * server-returned metadata; silently changing expiresAt would break decryption.
   */
  maxRetentionMs?: number;
}

interface RequestBody {
  id: string;
  ciphertext: string;
  expiresAt: string;
  maxOpens: number;
}

// Sized to carry the {text + file attachments} envelope (≤25 MiB plaintext for Pro) plus HPKE/AEAD
// overhead, then base64 inflation (~1.34x) for the request body. The server treats the blob
// as opaque bytes — it never inspects the envelope structure, preserving zero-knowledge.
const MAX_BODY_BYTES = 37 * 1024 * 1024; // was 20 MiB — base64-in-JSON body for a 25 MiB attachment
const MAX_CIPHERTEXT_BYTES = 26 * 1024 * 1024; // was 14 MiB — 25 MiB plaintext + HPKE/Padmé overhead
const MIN_CIPHERTEXT_BYTES = 32;
// Global retention ceiling (roadmap 2.5). DEFAULT: 365 days. Must stay >= the client's longest
// offered lifetime (apps/mobile MAX_LINK_LIFETIME_MS) — lowering it below that would start rejecting
// the client's longest-expiry option. This SUPERSEDES the old year-9999 "never" sentinel: a create
// with a year-9999 expiry now exceeds the ceiling and is rejected (that is intended).
export const DEFAULT_MAX_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 365 days
// Clock-skew grace so a client computing `now + 365d` slightly ahead of the server isn't rejected at
// the exact boundary. Applied on top of the ceiling before rejecting.
const RETENTION_GRACE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Resolve the retention ceiling from AESMSG_MAX_RETENTION_MS. Soft config: a missing, blank, or
 * non-positive/non-finite value falls back to the safe DEFAULT_MAX_RETENTION_MS (365 days) rather
 * than failing boot. Kept here (next to the default) so the server wiring and the handler agree.
 */
export function resolveMaxRetentionMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_RETENTION_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_RETENTION_MS;
  return parsed;
}
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 30;
const GET_RATE_LIMIT_MAX = 60;

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

function parseBody(raw: string): RequestBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Partial<RequestBody>;
  if (
    typeof p.id !== "string" ||
    typeof p.ciphertext !== "string" ||
    typeof p.expiresAt !== "string" ||
    typeof p.maxOpens !== "number"
  ) {
    return null;
  }
  return p as RequestBody;
}

function decodeBase64(s: string): Uint8Array | null {
  if (!BASE64_REGEX.test(s)) return null;
  try {
    const binary = atob(s);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function createMessagesHandler(deps: MessagesHandlerDeps) {
  return async function POST(request: Request): Promise<Response> {
    // Rate-limit BEFORE any body work (BE-2 / R3). The client IP is Fastify's resolved `request.ip`
    // (stamped by fastify-adapter into CLIENT_IP_HEADER), not a spoofable raw XFF read. An over-limit
    // client is rejected here — before we read, JSON.parse, or base64-decode the up-to-37 MiB body —
    // so upload spam can't force the server to do the expensive body work at all.
    const ip = hashIp(getClientIp(request));
    const count = await deps.rateLimit.incrementAndGet(`messages:${ip}`, RATE_LIMIT_WINDOW_SECONDS);
    if (count > RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return jsonError(400, "bad_request");

    const body = parseBody(raw);
    if (!body) return jsonError(400, "bad_request");

    if (!LINK_ID_REGEX.test(body.id)) return jsonError(400, "bad_request");
    if (!Number.isInteger(body.maxOpens) || (body.maxOpens <= 0 && body.maxOpens !== -1)) {
      return jsonError(400, "bad_request");
    }

    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) return jsonError(400, "bad_request");
    const now = deps.now();
    if (expiresAt.getTime() <= now.getTime()) return jsonError(400, "bad_request");
    // Retention ceiling (roadmap 2.5, SEC-6/PG-6/PG-8). REJECT — do NOT clamp — any expiry beyond the
    // ceiling (+ a clock-skew grace). Clamping is impossible here: expiresAt is bound into the client's
    // HPKE AAD and the recipient rebuilds that AAD from this metadata, so a server-side change would
    // break decryption. Rejecting forces the client to resend a ceiling-compliant expiry it also
    // sealed with. This also subsumes the old year-9999 "never" sentinel (now rejected, as intended).
    const maxRetentionMs = deps.maxRetentionMs ?? DEFAULT_MAX_RETENTION_MS;
    if (expiresAt.getTime() - now.getTime() > maxRetentionMs + RETENTION_GRACE_MS) {
      return jsonError(400, "bad_request");
    }

    const blob = decodeBase64(body.ciphertext);
    if (!blob) return jsonError(400, "bad_request");
    if (blob.byteLength < MIN_CIPHERTEXT_BYTES || blob.byteLength > MAX_CIPHERTEXT_BYTES) {
      return jsonError(400, "bad_request");
    }

    const id = body.id as LinkId;
    const existing = await deps.links.get(id);
    if (existing) return jsonError(409, "id_conflict");

    // Authenticated revocation (BE-1 / R2): mint a secret token, persist ONLY its hash, and return
    // the raw token to the creator once. Revoke later requires presenting the token (in a header).
    const revocationToken = mintRevocationToken();
    const revocationTokenHash = hashRevocationToken(revocationToken);
    try {
      // Atomic create (BE-5 / R22): the link-metadata row and the ciphertext are written in ONE
      // store transaction, so a failure or crash mid-create can never strand a live-but-empty link
      // row (which would burn the id forever and consume the first open). No best-effort cleanup is
      // needed — the store rolls BOTH rows back on any error. v2 link: no recipient fingerprint and
      // no creation timestamp are persisted server-side.
      await deps.links.createWithCiphertext(
        { id, expiresAt, maxOpens: body.maxOpens, revocationTokenHash },
        blob,
      );
    } catch {
      return jsonError(500, "internal_error");
    }

    // `revocationToken` is shown exactly once — it is never stored in plaintext and can't be
    // retrieved again. The client must persist it (encrypted at rest) to be able to revoke.
    return jsonOk({ id: body.id, url: `${deps.publicLinkOrigin}/l/${body.id}`, revocationToken });
  };
}

export interface GetMessageHandlerDeps {
  links: LinkMetadataStore;
  rateLimit: RateLimitStore;
  now: () => Date;
}

export function createGetMessageHandler(deps: GetMessageHandlerDeps) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id } = await context.params;
    if (!LINK_ID_REGEX.test(id)) return jsonError(400, "bad_request");

    const ip = hashIp(getClientIp(request));
    const count = await deps.rateLimit.incrementAndGet(
      `messages:get:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > GET_RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    const row = await deps.links.get(id as LinkId);
    if (!row) return jsonError(404, "not_found");
    if (row.status !== "active") return jsonError(404, "not_found");
    if (row.expiresAt.getTime() <= deps.now().getTime()) return jsonError(404, "not_found");

    // Preview metadata only — no recipient fingerprint, no creation timestamp. createdAt is not
    // needed here: decryption (and any v1 AAD reconstruction) happens via the open endpoint.
    return new Response(
      JSON.stringify({
        status: row.status,
        expiresAt: row.expiresAt.toISOString(),
        maxOpens: row.maxOpens,
        opensCount: row.opensCount,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

export interface OpenMessageHandlerDeps {
  links: LinkMetadataStore;
  ciphertexts: CiphertextStore;
  rateLimit: RateLimitStore;
}

export function createOpenMessageHandler(deps: OpenMessageHandlerDeps) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id } = await context.params;
    if (!LINK_ID_REGEX.test(id)) return jsonError(400, "bad_request");

    // /open takes NO request body. Reject any (BE-2 / R3). A future open-consumption proof will
    // arrive via a request HEADER, not the body, so an empty body is the only valid shape.
    if ((await request.text()).length > 0) return jsonError(400, "bad_request");

    const ip = hashIp(getClientIp(request));
    const count = await deps.rateLimit.incrementAndGet(
      `messages:open:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    const linkId = id as LinkId;

    // Read the ciphertext BEFORE consuming the open. The delivering (last allowed) open PURGES the
    // blob inside incrementOpens — the memory store deletes it and the Pg store's writable-CTE
    // `purged` DELETEs it in the same statement. Reading afterward would miss the blob for a
    // view-once (or final) open and 410 the recipient on the very open that should deliver it.
    // incrementOpens remains the single atomic guard: this pre-fetched blob is delivered ONLY when
    // incrementOpens returns a non-null row (THIS request won the atomic open). Two concurrent opens
    // on a maxOpens=1 link both read the same blob here, but only the one whose incrementOpens
    // returns non-null delivers it; the loser matches nothing and gets an opaque 410. Non-last opens
    // (maxOpens=N, N>1) don't purge, so the order is equivalent for them.
    const blob = await deps.ciphertexts.get(linkId);

    const row = await deps.links.incrementOpens(linkId);
    // Missing / revoked / expired / exhausted → opaque 410. Discard the pre-fetched blob (a loser of
    // a concurrent race, or a not-live link, never delivers it).
    if (!row) return jsonError(410, "no_longer_available");
    // Row is live but the blob was absent at read time (shouldn't happen for an active link) →
    // opaque 410, no metadata leaked.
    if (!blob) return jsonError(410, "no_longer_available");

    // createdAt is load-bearing for legacy v1 links (their AAD binds it); v2 links store NULL and
    // the reader reconstructs the v2 AAD without it. No recipient fingerprint is returned.
    return new Response(
      JSON.stringify({
        ciphertext: bytesToBase64(blob),
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        expiresAt: row.expiresAt.toISOString(),
        opensCount: row.opensCount,
        maxOpens: row.maxOpens,
        status: row.status,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

const LIST_MAX_IDS = 100;
const LIST_RATE_LIMIT_MAX = 60;

interface ListRequestBody {
  ids: string[];
}

function parseListBody(raw: string): ListRequestBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const ids = (parsed as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return null;
  if (ids.length === 0 || ids.length > LIST_MAX_IDS) return null;
  for (const id of ids) {
    if (typeof id !== "string" || !LINK_ID_REGEX.test(id)) return null;
  }
  return { ids: ids as string[] };
}

export function createListMessagesHandler(deps: GetMessageHandlerDeps) {
  return async function POST(request: Request): Promise<Response> {
    // Rate-limit before parsing the body (BE-2 / R3), keyed on the trusted resolved `request.ip`.
    const ip = hashIp(getClientIp(request));
    const count = await deps.rateLimit.incrementAndGet(
      `messages:list:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > LIST_RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    const raw = await request.text();
    const body = parseListBody(raw);
    if (!body) return jsonError(400, "bad_request");

    const now = deps.now();
    const results = await Promise.all(
      body.ids.map(async (id) => {
        const row = await deps.links.get(id as LinkId);
        if (!row || row.status !== "active" || row.expiresAt.getTime() <= now.getTime()) {
          return { id, status: "gone" as const };
        }
        return {
          id,
          status: row.status,
          expiresAt: row.expiresAt.toISOString(),
          maxOpens: row.maxOpens,
          opensCount: row.opensCount,
        };
      }),
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

export interface RevokeMessageHandlerDeps {
  links: LinkMetadataStore;
  rateLimit: RateLimitStore;
}

export function createRevokeMessageHandler(deps: RevokeMessageHandlerDeps) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id } = await context.params;
    if (!LINK_ID_REGEX.test(id)) return jsonError(400, "bad_request");

    // /revoke takes NO request body (BE-2 / R3). The revocation token (BE-1) rides a request HEADER,
    // not the body — so reject any body and never grow a body token slot.
    if ((await request.text()).length > 0) return jsonError(400, "bad_request");

    const ip = hashIp(getClientIp(request));
    const count = await deps.rateLimit.incrementAndGet(
      `messages:revoke:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    // Authenticated revocation (BE-1 / R2). Hash the presented token and hand the store ONLY the
    // hash (the raw token never reaches the store). The store applies the opaque semantics:
    //   - token matches an active tokened row → revoke + purge ciphertext (transactionally);
    //   - active LEGACY row (no stored hash, pre-BE-1) → revoke + purge even un-tokened (ages out);
    //   - unknown / already-terminal id → no-op;
    //   - active tokened row with a missing/mismatched token → silent no-op (a third party who only
    //     saw the link can neither revoke nor distinguish the outcome).
    // Every branch returns an IDENTICAL 200 { id, status: "revoked" } so outcomes are opaque. Since
    // the legitimate sender always holds the correct token, the silent-no-op branch never affects
    // honest senders.
    const tokenHeader = request.headers.get(REVOCATION_TOKEN_HEADER);
    const providedTokenHash = tokenHeader ? hashRevocationToken(tokenHeader) : null;
    await deps.links.revoke(id as LinkId, providedTokenHash);
    return new Response(JSON.stringify({ id, status: "revoked" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}
