import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { getPool } from "./pg/pool";

const ADVISORY_LOCK_KEY = 0xdeadbeef;

const defaultMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export interface RunMigrationsOptions {
  pool?: Pool;
  migrationsDir?: string;
}

export interface RunMigrationsResult {
  applied: string[];
}

export async function runMigrations(opts: RunMigrationsOptions = {}): Promise<RunMigrationsResult> {
  const pool = opts.pool ?? getPool();
  const migrationsDir = opts.migrationsDir ?? defaultMigrationsDir;
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const allFiles = await readdir(migrationsDir);
    const sqlFiles = allFiles.filter((f) => f.endsWith(".sql")).sort();

    const { rows } = await client.query<{ filename: string }>("SELECT filename FROM _migrations");
    const alreadyApplied = new Set(rows.map((r) => r.filename));

    const newlyApplied: string[] = [];
    for (const file of sqlFiles) {
      if (alreadyApplied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      newlyApplied.push(file);
    }

    return { applied: newlyApplied };
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]);
    } catch {
      // best-effort — if the connection died we don't care
    }
    client.release();
  }
}

/* v8 ignore start -- CLI entry point exercised manually */
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then((result) => {
      console.log(`Applied ${result.applied.length} migration(s):`);
      for (const f of result.applied) console.log(`  ${f}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
/* v8 ignore stop */
