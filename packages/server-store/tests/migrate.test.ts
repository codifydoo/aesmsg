import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `aesmsg_mig_${Math.random().toString(36).slice(2, 10)}`;

describe.skipIf(!TEST_DATABASE_URL)("runMigrations", () => {
  let pool: Pool;

  beforeAll(async () => {
    const adminPool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await adminPool.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await adminPool.end();
    }
    pool = new Pool({
      connectionString: TEST_DATABASE_URL,
      options: `-c search_path=${SCHEMA}`,
    });
  });

  afterAll(async () => {
    await pool.end();
    const adminPool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await adminPool.query(`DROP SCHEMA "${SCHEMA}" CASCADE`);
    } finally {
      await adminPool.end();
    }
  });

  it("creates _migrations + applies all migrations on a fresh schema (0001 first)", async () => {
    const result = await runMigrations({ pool });
    // Migrations apply in lexical order: 0001 first, then 0002 (the metadata-leakage migration).
    expect(result.applied[0]).toBe("0001_init.sql");
    expect(result.applied).toContain("0002_drop_recipient_fp_and_nullable_createdat.sql");

    const { rows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM _migrations ORDER BY filename",
    );
    const applied = rows.map((r) => r.filename);
    expect(applied).toContain("0001_init.sql");
    expect(applied).toContain("0002_drop_recipient_fp_and_nullable_createdat.sql");

    const linksOk = await pool.query("SELECT 1 FROM links LIMIT 0");
    expect(linksOk.rowCount).toBe(0);
    const ctOk = await pool.query("SELECT 1 FROM link_ciphertexts LIMIT 0");
    expect(ctOk.rowCount).toBe(0);
    // 0002 dropped recipient_fp; selecting it must now error.
    await expect(pool.query("SELECT recipient_fp FROM links LIMIT 0")).rejects.toThrow();
  });

  it("is idempotent — second run applies nothing and does not error", async () => {
    const result = await runMigrations({ pool });
    expect(result.applied).toEqual([]);

    const { rows } = await pool.query<{ filename: string }>("SELECT filename FROM _migrations");
    const applied = rows.map((r) => r.filename);
    expect(applied).toContain("0001_init.sql");
    expect(applied).toContain("0002_drop_recipient_fp_and_nullable_createdat.sql");
  });
});
