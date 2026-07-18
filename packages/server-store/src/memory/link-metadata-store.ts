import { timingSafeEqualHex } from "../constant-time";
import type {
  AdminPurgeResult,
  CiphertextStore,
  CreateLinkRecord,
  LinkMetadataStore,
  StorageStats,
} from "../interfaces";
import { terminalRetentionMs } from "../retention";
import type { LinkId, LinkMetadata, LinkStatus } from "../types";

export class MemoryLinkMetadataStore implements LinkMetadataStore {
  private readonly rows = new Map<LinkId, LinkMetadata>();
  // SHA-256 hex of each link's secret revocation token (BE-1 / R2), kept out of the LinkMetadata row
  // so `get`/`incrementOpens` never surface the hash. NULL = an "un-tokened" (legacy) row.
  private readonly revocationTokenHashes = new Map<LinkId, string | null>();
  // When each row went terminal (BE-7 / R18), kept out of the LinkMetadata row so it never leaks to
  // the API — the memory analogue of the Pg `terminal_at` column. Read only by pruneTerminal().
  private readonly terminalAt = new Map<LinkId, Date>();

  // Optional so the bare store still constructs for metadata-only tests. When wired, revoke()
  // purges the ciphertext too — parity with the Pg store, whose revoke() DELETEs link_ciphertexts
  // in the same transaction. Production wiring lives in apps/api/src/stores/stores.ts.
  constructor(private readonly ciphertexts?: CiphertextStore) {}

  async create(record: CreateLinkRecord): Promise<LinkMetadata> {
    if (this.rows.has(record.id)) {
      throw new Error(`MemoryLinkMetadataStore: link ${record.id} already exists`);
    }
    // New v2 links never carry a creation timestamp (parity with the Pg store's NULL created_at).
    // The revocation token hash is stored in a side map, never on the LinkMetadata row itself.
    const meta: LinkMetadata = {
      id: record.id,
      expiresAt: record.expiresAt,
      maxOpens: record.maxOpens,
      status: "active",
      opensCount: 0,
      createdAt: null,
    };
    this.rows.set(record.id, meta);
    this.revocationTokenHashes.set(record.id, record.revocationTokenHash ?? null);
    return meta;
  }

  async createWithCiphertext(
    record: CreateLinkRecord,
    ciphertext: Uint8Array,
  ): Promise<LinkMetadata> {
    // Atomic create (BE-5 / R22), the memory analogue of the Pg single-transaction create: add the
    // row, then write the blob; if the blob write throws, roll the row back so no orphan
    // live-but-empty link survives (parity with Pg's ROLLBACK). create() throws first on a duplicate
    // id, before anything is written.
    if (!this.ciphertexts) {
      throw new Error(
        "MemoryLinkMetadataStore: createWithCiphertext requires a wired CiphertextStore",
      );
    }
    const meta = await this.create(record);
    try {
      await this.ciphertexts.put(record.id, ciphertext);
    } catch (err) {
      this.rows.delete(record.id);
      this.revocationTokenHashes.delete(record.id);
      throw err;
    }
    return meta;
  }

  async get(id: LinkId): Promise<LinkMetadata | null> {
    return this.rows.get(id) ?? null;
  }

  async incrementOpens(id: LinkId): Promise<LinkMetadata | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    if (row.status !== "active") return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;

    const newCount = row.opensCount + 1;
    const newStatus: LinkStatus =
      row.maxOpens !== -1 && newCount >= row.maxOpens ? "expired" : row.status;
    const updated: LinkMetadata = { ...row, opensCount: newCount, status: newStatus };
    this.rows.set(id, updated);
    // BE-6 / R17: purge the ciphertext the instant THIS open exhausts a bounded link, mirroring the
    // Pg store's single-statement UPDATE+DELETE. The row was necessarily 'active' above, so a flip
    // to 'expired' here means this call consumed the final allowed open. Unlimited links
    // (maxOpens === -1) never flip and keep their blob until expiry/revoke. The status flip and the
    // delete happen back-to-back in this single-threaded method — the memory analogue of Pg's
    // same-transaction guarantee (no exhausted-with-ciphertext window). The sweep stays a backstop.
    if (newStatus === "expired") {
      // Exhausting the link's last open is a terminal transition — stamp it for the retention prune
      // (BE-7 / R18), mirroring the Pg CASE that sets terminal_at on the same flip.
      this.terminalAt.set(id, new Date());
      await this.ciphertexts?.delete(id);
    }
    return updated;
  }

  async revoke(id: LinkId, providedTokenHash: string | null = null): Promise<void> {
    // Authenticated revocation (BE-1 / R2). Semantics documented on LinkMetadataStore.revoke.
    const row = this.rows.get(id);
    // Unknown id, or a row already terminal → idempotent, indistinguishable no-op.
    if (!row || row.status !== "active") return;

    const storedHash = this.revocationTokenHashes.get(id) ?? null;
    if (storedHash !== null) {
      // Tokened row: revoke ONLY on a constant-time hash match. A missing or mismatched token is a
      // silent no-op — a third party who only saw the link can neither revoke nor tell outcomes
      // apart. The legitimate sender always holds the correct token, so this never affects them.
      if (providedTokenHash === null || !timingSafeEqualHex(storedHash, providedTokenHash)) return;
    }
    // Authorized (matching token) OR a legacy un-tokened row (storedHash === null): flip status,
    // stamp terminal_at for the retention prune (BE-7 / R18), and purge the ciphertext immediately
    // (parity with Pg's transactional UPDATE + DELETE).
    this.rows.set(id, { ...row, status: "revoked" });
    this.terminalAt.set(id, new Date());
    await this.ciphertexts?.delete(id);
  }

  async expirePastDue(): Promise<number> {
    const now = Date.now();
    for (const [id, row] of this.rows) {
      if (row.status === "active" && row.expiresAt.getTime() <= now) {
        this.rows.set(id, { ...row, status: "expired" });
        // Stamp the terminal transition so the retention prune can age it out (parity with the Pg
        // UPDATE ... SET terminal_at = now()).
        this.terminalAt.set(id, new Date());
      }
    }

    // Purge the ciphertext for every terminal row, mirroring the Pg store's
    //   DELETE FROM link_ciphertexts
    //     WHERE link_id IN (SELECT id FROM links WHERE status IN ('expired','revoked'))
    // This deliberately sweeps ALL terminal rows, not just the ones flipped above: a link that
    // hit maxOpens expired inside incrementOpens (which leaves its blob behind), so the time-based
    // pass alone would orphan that ciphertext. Return the number of blobs actually removed — Pg
    // returns the DELETE rowCount, so terminal rows whose ciphertext is already gone (e.g. a link
    // revoke() already purged) must not be counted. delete() is opaque, so probe with get() to
    // count only blobs that were really present.
    if (!this.ciphertexts) {
      // Still run the retention prune even without a ciphertext store wired (metadata-only setups).
      await this.pruneTerminal(new Date(Date.now() - terminalRetentionMs()));
      return 0;
    }
    let purged = 0;
    for (const [id, row] of this.rows) {
      if (row.status !== "expired" && row.status !== "revoked") continue;
      if ((await this.ciphertexts.get(id)) === null) continue;
      await this.ciphertexts.delete(id);
      purged++;
    }
    // Fold the retention prune into the existing sweep (BE-7 / R18) so the worker drives it with no
    // extra call. Return value stays the ciphertext-purge count for backward compatibility.
    await this.pruneTerminal(new Date(Date.now() - terminalRetentionMs()));
    return purged;
  }

  async pruneTerminal(before: Date): Promise<number> {
    // Delete terminal metadata rows that went terminal before `before` (BE-7 / R18), the memory
    // analogue of the Pg terminal-row DELETE. Also drop any lingering ciphertext for a pruned row to
    // mirror Pg's ON DELETE CASCADE (defensive — the blob was already purged at the terminal flip).
    const cutoff = before.getTime();
    let deleted = 0;
    for (const [id, row] of this.rows) {
      if (row.status !== "expired" && row.status !== "revoked") continue;
      const terminalAt = this.terminalAt.get(id);
      if (!terminalAt || terminalAt.getTime() >= cutoff) continue;
      this.rows.delete(id);
      this.revocationTokenHashes.delete(id);
      this.terminalAt.delete(id);
      await this.ciphertexts?.delete(id);
      deleted++;
    }
    return deleted;
  }

  async aggregateStats(): Promise<StorageStats> {
    // AGGREGATE only (PG-17 / PG-18 / R25): count active rows and delegate the ciphertext-byte SUM to
    // the wired ciphertext store. No link id, ciphertext, or per-row datum is exposed — just two
    // scalars. Mirrors the Pg store's count + SUM.
    let activeLinks = 0;
    for (const row of this.rows.values()) {
      if (row.status === "active") activeLinks++;
    }
    const ciphertextBytes = this.ciphertexts ? await this.ciphertexts.totalBytes() : 0;
    return { activeLinks, ciphertextBytes };
  }

  async adminPurge(id: LinkId): Promise<AdminPurgeResult> {
    // Operator abuse purge (PG-17 / R25) — the memory analogue of the Pg forced purge. UNLIKE
    // revoke(), there is NO token check: the operator override always purges. Flip an active row to
    // 'revoked' (stamping terminal_at so the retention prune ages it out), then delete any ciphertext
    // still present. Idempotent: an unknown id or an already-terminal row is a safe no-op the operator
    // can re-run. The status flip and the delete happen back-to-back in this single-threaded method,
    // the memory analogue of the Pg single-transaction guarantee.
    const row = this.rows.get(id);
    const found = row !== undefined;
    const wasActive = row?.status === "active";
    if (row && wasActive) {
      this.rows.set(id, { ...row, status: "revoked" });
      this.terminalAt.set(id, new Date());
    }
    let ciphertextRemoved = false;
    if (this.ciphertexts && (await this.ciphertexts.get(id)) !== null) {
      await this.ciphertexts.delete(id);
      ciphertextRemoved = true;
    }
    return { found, wasActive, ciphertextRemoved };
  }
}
