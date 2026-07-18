import type { Pool } from "pg";
import { timingSafeEqualHex } from "../constant-time";
import type {
  AdminPurgeResult,
  CreateLinkRecord,
  LinkMetadataStore,
  StorageStats,
} from "../interfaces";
import { terminalRetentionMs } from "../retention";
import type { LinkId, LinkMetadata, LinkStatus } from "../types";
import { PgCiphertextStore } from "./ciphertext-store";
import { getPool } from "./pool";

interface Row {
  id: string;
  status: LinkStatus;
  created_at: Date | null;
  expires_at: Date;
  max_opens: number;
  opens_count: number;
}

function rowToMeta(row: Row): LinkMetadata {
  return {
    id: row.id as LinkId,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxOpens: row.max_opens,
    opensCount: row.opens_count,
  };
}

export class PgLinkMetadataStore implements LinkMetadataStore {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  async create(record: CreateLinkRecord): Promise<LinkMetadata> {
    // created_at is intentionally omitted: it is now nullable with no default, so new v2 rows
    // persist NULL (no creation timestamp leaked). Legacy v1 rows keep whatever they already had.
    // revocation_token_hash stores ONLY the SHA-256 hex of the secret token (BE-1 / R2); NULL when
    // the caller supplies no hash (an un-tokened / legacy-style row). It is never RETURNED.
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO links (id, status, expires_at, max_opens, opens_count, revocation_token_hash)
       VALUES ($1, 'active', $2, $3, 0, $4)
       RETURNING id, status, created_at, expires_at, max_opens, opens_count`,
      [record.id, record.expiresAt, record.maxOpens, record.revocationTokenHash ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error("PgLinkMetadataStore: INSERT did not RETURN a row");
    return rowToMeta(row);
  }

  async createWithCiphertext(
    record: CreateLinkRecord,
    ciphertext: Uint8Array,
  ): Promise<LinkMetadata> {
    // Atomic create (BE-5 / R22): the link-metadata row and its ciphertext row are written in ONE
    // transaction. Either both commit or, on any error (a duplicate id, a ciphertext write failure,
    // a mid-create crash), NEITHER does — ROLLBACK removes the link row too, so there is never an
    // orphan live-but-empty link (which would burn the id and consume the first open) nor a dangling
    // blob. The ciphertext INSERT mirrors PgCiphertextStore.put but runs on THIS transaction's client
    // (the separate store uses a different pooled connection, so it cannot share the transaction).
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<Row>(
        `INSERT INTO links (id, status, expires_at, max_opens, opens_count, revocation_token_hash)
         VALUES ($1, 'active', $2, $3, 0, $4)
         RETURNING id, status, created_at, expires_at, max_opens, opens_count`,
        [record.id, record.expiresAt, record.maxOpens, record.revocationTokenHash ?? null],
      );
      const row = rows[0];
      if (!row) throw new Error("PgLinkMetadataStore: INSERT did not RETURN a row");
      await client.query(`INSERT INTO link_ciphertexts (link_id, blob, size) VALUES ($1, $2, $3)`, [
        record.id,
        Buffer.from(ciphertext),
        ciphertext.byteLength,
      ]);
      await client.query("COMMIT");
      return rowToMeta(row);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async get(id: LinkId): Promise<LinkMetadata | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT id, status, created_at, expires_at, max_opens, opens_count
       FROM links WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToMeta(rows[0]) : null;
  }

  async incrementOpens(id: LinkId): Promise<LinkMetadata | null> {
    // Atomic open-consumption that ALSO purges the ciphertext the instant the LAST allowed open is
    // consumed (BE-6 / R17). One writable-CTE statement = one implicit transaction = one round-trip:
    //   - `updated` is the previous guarded UPDATE, unchanged. Its WHERE (status='active' AND not
    //     past expiry) row-locks the link, so under concurrent opens exactly ONE call matches and
    //     RETURNs a row; the losers match nothing and fall through to null (identical to before —
    //     see the pg "atomic under concurrent calls" test).
    //   - The CASE flips status to 'expired' only when a BOUNDED link (max_opens != -1) reaches its
    //     cap on this open. Unlimited links (max_opens = -1) never flip here, so `purged` never
    //     fires for them; they age out via expiry/revoke exactly as before.
    //   - `purged` DELETEs the blob only for a row that just became 'expired'. A data-modifying CTE
    //     always runs to completion, so the DELETE fires even though the final SELECT ignores it.
    //     Because it lives in the same statement as `updated`, the status flip and the blob delete
    //     commit together: there is no observable window where the row is exhausted while its
    //     ciphertext still exists, and no second round-trip a concurrent open could interleave with.
    //     This mirrors how revoke() purges transactionally. The sweep (expirePastDue) remains a
    //     backstop for links that go terminal by TIME rather than by opens.
    // GET/open opacity is unchanged: the link row is kept (status='expired'), so a later open still
    // returns null (→ 410) and get() still returns the expired row (→ 404); only the blob is gone.
    const { rows } = await this.pool.query<Row>(
      `WITH updated AS (
         UPDATE links
            SET opens_count = opens_count + 1,
                status = CASE
                  WHEN max_opens != -1 AND opens_count + 1 >= max_opens THEN 'expired'
                  ELSE status
                END,
                -- Stamp terminal_at when THIS open exhausts a bounded link so the retention prune
                -- (BE-7 / R18) can age the leftover row out. Unlimited links never flip here, so
                -- their terminal_at stays NULL until expiry/revoke stamps it.
                terminal_at = CASE
                  WHEN max_opens != -1 AND opens_count + 1 >= max_opens THEN now()
                  ELSE terminal_at
                END
          WHERE id = $1 AND status = 'active' AND expires_at > now()
          RETURNING id, status, created_at, expires_at, max_opens, opens_count
       ),
       purged AS (
         DELETE FROM link_ciphertexts
          WHERE link_id IN (SELECT id FROM updated WHERE status = 'expired')
       )
       SELECT id, status, created_at, expires_at, max_opens, opens_count FROM updated`,
      [id],
    );
    return rows[0] ? rowToMeta(rows[0]) : null;
  }

  async revoke(id: LinkId, providedTokenHash: string | null = null): Promise<void> {
    // Authenticated revocation (BE-1 / R2). Semantics documented on LinkMetadataStore.revoke.
    //
    // Revocation purges the ciphertext immediately (the published privacy promise), not on the
    // expirePastDue() sweep. The link row is kept (status='revoked') so opens return 410 without
    // leaking metadata, but the blob is physically deleted. The authorization check, the status
    // flip, and the blob DELETE run in ONE transaction (row locked FOR UPDATE) so the row is never
    // observed revoked-with-ciphertext-still-present (or vice versa), and a concurrent open can't
    // race the check.
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{
        status: LinkStatus;
        revocation_token_hash: string | null;
      }>("SELECT status, revocation_token_hash FROM links WHERE id = $1 FOR UPDATE", [id]);
      const row = rows[0];

      // Unknown id, or a row already terminal → idempotent, indistinguishable no-op (COMMIT the
      // empty transaction and return without touching anything).
      if (!row || row.status !== "active") {
        await client.query("COMMIT");
        return;
      }

      const storedHash = row.revocation_token_hash;
      if (storedHash !== null) {
        // Tokened row: revoke ONLY on a constant-time hash match. A missing or mismatched token is a
        // silent no-op so a third party who only saw the link can neither revoke nor tell outcomes
        // apart. The legitimate sender always holds the correct token, so this never affects them.
        if (providedTokenHash === null || !timingSafeEqualHex(storedHash, providedTokenHash)) {
          await client.query("COMMIT");
          return;
        }
      }

      // Authorized (matching token) OR a legacy un-tokened row (stored hash NULL): flip status,
      // stamp terminal_at for the retention prune (BE-7 / R18), and purge the blob in the same
      // transaction.
      await client.query("UPDATE links SET status = 'revoked', terminal_at = now() WHERE id = $1", [
        id,
      ]);
      await client.query("DELETE FROM link_ciphertexts WHERE link_id = $1", [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async expirePastDue(): Promise<number> {
    // Mark newly past-due rows terminal, stamping terminal_at so the retention prune can age them out.
    await this.pool.query(
      `UPDATE links SET status = 'expired', terminal_at = now()
        WHERE status = 'active' AND expires_at <= now()`,
    );
    // Purge ciphertext for every terminal row. The subquery filters on status only; the partial
    // index idx_links_terminal_at (WHERE status IN ('expired','revoked')) makes it an index scan
    // rather than the growing seq scan flagged in BE-7.
    const { rowCount } = await this.pool.query(
      `DELETE FROM link_ciphertexts
       WHERE link_id IN (SELECT id FROM links WHERE status IN ('expired', 'revoked'))`,
    );
    // Fold the retention prune into the existing sweep (BE-7 / R18) so the worker drives it with no
    // extra call. Return value stays the ciphertext-purge count for backward compatibility.
    await this.pruneTerminal(new Date(Date.now() - terminalRetentionMs()));
    return rowCount ?? 0;
  }

  async pruneTerminal(before: Date): Promise<number> {
    // Delete terminal metadata rows that went terminal before `before` (BE-7 / R18). The partial
    // index idx_links_terminal_at supports both the status filter and the terminal_at range. Any
    // ciphertext still referencing a pruned row is removed by ON DELETE CASCADE (defensive — the
    // blob was already purged when the row went terminal).
    const { rowCount } = await this.pool.query(
      `DELETE FROM links
        WHERE status IN ('expired', 'revoked') AND terminal_at IS NOT NULL AND terminal_at < $1`,
      [before],
    );
    return rowCount ?? 0;
  }

  async aggregateStats(): Promise<StorageStats> {
    // AGGREGATE only (PG-17 / PG-18 / R25): a single COUNT of active links, plus the ciphertext-byte
    // SUM delegated to the ciphertext store (same pool). No id or blob is read — two scalars only.
    const { rows } = await this.pool.query<{ active_links: string }>(
      "SELECT count(*)::bigint AS active_links FROM links WHERE status = 'active'",
    );
    const activeLinks = Number(rows[0]?.active_links ?? 0);
    const ciphertextBytes = await new PgCiphertextStore(this.pool).totalBytes();
    return { activeLinks, ciphertextBytes };
  }

  async adminPurge(id: LinkId): Promise<AdminPurgeResult> {
    // Operator abuse purge (PG-17 / R25). Reuses revoke()'s transactional status-flip + ciphertext
    // DELETE shape, but WITHOUT the revocation-token check — this is the operator override, not the
    // user's token-gated revoke. Row locked FOR UPDATE so a concurrent open can't race it; an active
    // row is flipped 'revoked' (terminal_at stamped for the retention prune) and any remaining blob is
    // deleted in the SAME transaction. Idempotent: an unknown id or already-terminal row is a safe
    // no-op — the operator can re-run it freely.
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ status: LinkStatus }>(
        "SELECT status FROM links WHERE id = $1 FOR UPDATE",
        [id],
      );
      const row = rows[0];
      const found = row !== undefined;
      const wasActive = row?.status === "active";
      if (wasActive) {
        await client.query(
          "UPDATE links SET status = 'revoked', terminal_at = now() WHERE id = $1",
          [id],
        );
      }
      const { rowCount } = await client.query("DELETE FROM link_ciphertexts WHERE link_id = $1", [
        id,
      ]);
      await client.query("COMMIT");
      return { found, wasActive, ciphertextRemoved: (rowCount ?? 0) > 0 };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
