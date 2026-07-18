import type { Pool } from "pg";
import type { CiphertextStore } from "../interfaces";
import type { LinkId } from "../types";
import { getPool } from "./pool";

export class PgCiphertextStore implements CiphertextStore {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  async put(id: LinkId, blob: Uint8Array): Promise<void> {
    await this.pool.query(
      `INSERT INTO link_ciphertexts (link_id, blob, size)
       VALUES ($1, $2, $3)
       ON CONFLICT (link_id) DO UPDATE SET blob = EXCLUDED.blob, size = EXCLUDED.size`,
      [id, Buffer.from(blob), blob.byteLength],
    );
  }

  async get(id: LinkId): Promise<Uint8Array | null> {
    const { rows } = await this.pool.query<{ blob: Buffer }>(
      "SELECT blob FROM link_ciphertexts WHERE link_id = $1",
      [id],
    );
    const row = rows[0];
    return row ? new Uint8Array(row.blob) : null;
  }

  async delete(id: LinkId): Promise<void> {
    await this.pool.query("DELETE FROM link_ciphertexts WHERE link_id = $1", [id]);
  }

  async totalBytes(): Promise<number> {
    // AGGREGATE only (PG-18 / R25): a single SUM over the pre-computed `size` column (no blob is
    // read). coalesce keeps it 0 on an empty table. Returned as a plain number for the metric gauge.
    const { rows } = await this.pool.query<{ bytes: string }>(
      "SELECT coalesce(sum(size), 0)::bigint AS bytes FROM link_ciphertexts",
    );
    return Number(rows[0]?.bytes ?? 0);
  }
}
