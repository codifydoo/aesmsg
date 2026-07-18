import type { LinkId, LinkMetadata } from "./types";

/**
 * Caller-supplied fields for a new link. `status`, `opensCount`, and `createdAt` are derived by the
 * store (createdAt is always stored NULL for v2 links). `revocationTokenHash` is the SHA-256 hex of
 * the secret revocation token (BE-1 / R2); only the hash is persisted. Omit it (or pass null) to
 * create an "un-tokened" row — revoke() then accepts an un-tokened request for it (legacy behavior).
 */
export type CreateLinkRecord = Omit<LinkMetadata, "opensCount" | "status" | "createdAt"> & {
  revocationTokenHash?: string | null;
};

/**
 * AGGREGATE-ONLY storage stats for the ops metrics surface (PG-17 / PG-18 / R25). Both fields are a
 * single COUNT / SUM over the whole store — never a per-row read. They expose volume, not identity:
 * no link id, no ciphertext, no recipient, nothing that correlates a link to a user (zero-knowledge).
 */
export interface StorageStats {
  /** COUNT of links whose status is still 'active'. */
  readonly activeLinks: number;
  /** SUM of the byte size of every stored ciphertext blob. */
  readonly ciphertextBytes: number;
}

/**
 * Outcome of an operator abuse purge (PG-17 / R25). Purely informational — the purge itself is
 * unconditional and idempotent, so a second run of the same id is a safe no-op.
 */
export interface AdminPurgeResult {
  /** Whether a link row for the id existed at all. */
  readonly found: boolean;
  /** Whether that row was still 'active' (i.e. this call flipped it terminal). */
  readonly wasActive: boolean;
  /** Whether a ciphertext blob was actually deleted by this call. */
  readonly ciphertextRemoved: boolean;
}

export interface LinkMetadataStore {
  /** Creates a v2 link: createdAt is never supplied by the caller and is stored as NULL. */
  create(record: CreateLinkRecord): Promise<LinkMetadata>;
  /**
   * Atomic create (BE-5 / R22): writes the link-metadata row AND its ciphertext in ONE transaction.
   * On any failure BOTH are rolled back, so a crash or a ciphertext-write error can never leave an
   * orphan — neither a live-but-empty link row (which would burn the id with 409 forever and consume
   * the first open) nor a dangling blob. The API create path uses this instead of `create()` +
   * `CiphertextStore.put()` as two separate operations. The stored blob is opaque bytes; nothing
   * about the plaintext is inspected or persisted (zero-knowledge preserved).
   */
  createWithCiphertext(record: CreateLinkRecord, ciphertext: Uint8Array): Promise<LinkMetadata>;
  get(id: LinkId): Promise<LinkMetadata | null>;
  /** Atomic. Returns null if the link is not active or already past expiry/max-opens. */
  incrementOpens(id: LinkId): Promise<LinkMetadata | null>;
  /**
   * Authenticated revocation (BE-1 / R2). `providedTokenHash` is the SHA-256 hex of the secret
   * revocation token from the request header, or null when none was supplied. Semantics:
   *   - unknown id, or a row that is not active → no-op (idempotent, indistinguishable);
   *   - active row WITH a stored token hash → revoke + purge ONLY when `providedTokenHash` matches
   *     it (constant-time); a missing or mismatched token is a silent no-op (a third party who only
   *     saw the link can neither revoke nor tell the outcomes apart);
   *   - active LEGACY row (stored hash NULL, created before BE-1) → revoke + purge even un-tokened,
   *     so existing users' revoke keeps working until the row ages out via expiry.
   * When it does revoke, the ciphertext purge is transactional with the status flip (as before).
   */
  revoke(id: LinkId, providedTokenHash?: string | null): Promise<void>;
  /**
   * Marks expired rows as expired and purges associated ciphertext. Returns number of ciphertexts
   * purged. Also prunes terminal metadata rows past the configured retention window (BE-7 / R18) as
   * a side effect, so the worker's existing sweep drives retention with no extra call.
   */
  expirePastDue(): Promise<number>;
  /**
   * Prunes (DELETEs) terminal (expired/revoked) metadata rows whose terminal transition happened
   * strictly before `before` (BE-7 / R18). Returns the number of metadata rows deleted. Any lingering
   * ciphertext for a pruned row is removed too (Pg: `ON DELETE CASCADE`; memory: mirrored), though in
   * practice the blob was already purged at the terminal transition. `expirePastDue()` already calls
   * this with `now - retention`; call it directly only for tests or a manual sweep.
   */
  pruneTerminal(before: Date): Promise<number>;
  /**
   * AGGREGATE storage stats for the ops metrics surface (PG-17 / PG-18 / R25). Returns only a COUNT
   * of active links and the SUM of ciphertext bytes — never per-row data. Cheap enough to run on a
   * gated, infrequent /metrics scrape.
   */
  aggregateStats(): Promise<StorageStats>;
  /**
   * OPERATOR abuse purge (PG-17 / R25). Unconditionally purges the ciphertext for `id` and marks the
   * row terminal — regardless of any revocation token (this is the operator override, NOT the
   * token-gated user revoke()). Reuses the same transactional status-flip + ciphertext-DELETE path as
   * revoke()'s authorized branch. Idempotent: an unknown or already-terminal id is a safe no-op, so an
   * operator can re-run it freely. This is the ONLY way to remove reported/abusive content from a
   * zero-knowledge store — the server can never read the plaintext, so a specific id is all it can act
   * on. See docs/ops-runbook.md.
   */
  adminPurge(id: LinkId): Promise<AdminPurgeResult>;
}

export interface CiphertextStore {
  put(id: LinkId, blob: Uint8Array): Promise<void>;
  get(id: LinkId): Promise<Uint8Array | null>;
  delete(id: LinkId): Promise<void>;
  /**
   * AGGREGATE total bytes of every stored ciphertext (SUM of blob sizes) for the storage metric
   * (PG-18 / R25). Never reads or returns an individual blob — a single SUM only.
   */
  totalBytes(): Promise<number>;
}

export interface RateLimitStore {
  /** Increments the counter for `key` in the current `windowSeconds`-wide window and returns the new count. */
  incrementAndGet(key: string, windowSeconds: number): Promise<number>;
}
