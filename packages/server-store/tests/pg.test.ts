import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { PgCiphertextStore } from "../src/pg/ciphertext-store.js";
import { PgLinkMetadataStore } from "../src/pg/link-metadata-store.js";
import { closePool, getPool } from "../src/pg/pool.js";
import type { LinkId } from "../src/types.js";
import { runCiphertextSuite } from "./shared-ciphertext-suite.js";
import { runLinkMetadataSuite } from "./shared-link-metadata-suite.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `aesmsg_pg_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Wraps a real Pool so that, on a checked-out client, the `link_ciphertexts` INSERT rejects while
 * BEGIN / the `links` INSERT / ROLLBACK all delegate normally. This drives createWithCiphertext down
 * its failure path to prove the transaction rolls the link row back too (BE-5 / R22). The client's
 * original `query` is restored on `release()` so the shared pool is not poisoned for later tests.
 */
function makeFaultyCiphertextPool(realPool: Pool): Pool {
  return {
    connect: async () => {
      const client = await realPool.connect();
      const origQuery = client.query.bind(client);
      const origRelease = client.release.bind(client);
      const patched = client as unknown as {
        query: (...args: unknown[]) => unknown;
        release: (...args: unknown[]) => unknown;
      };
      patched.query = (text: unknown, ...rest: unknown[]) => {
        const sql = typeof text === "string" ? text : ((text as { text?: string })?.text ?? "");
        if (/insert\s+into\s+link_ciphertexts/i.test(sql)) {
          return Promise.reject(new Error("simulated ciphertext write failure"));
        }
        return (origQuery as (...a: unknown[]) => unknown)(text, ...rest);
      };
      patched.release = (...args: unknown[]) => {
        patched.query = origQuery as (...a: unknown[]) => unknown;
        return (origRelease as (...a: unknown[]) => unknown)(...args);
      };
      return client;
    },
  } as unknown as Pool;
}

describe.skipIf(!TEST_DATABASE_URL)("Postgres stores", () => {
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
    await runMigrations({ pool });
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

  describe("PgLinkMetadataStore", () => {
    runLinkMetadataSuite(async () => {
      await pool.query("TRUNCATE links, link_ciphertexts CASCADE");
      return {
        store: new PgLinkMetadataStore(pool),
        ciphertexts: new PgCiphertextStore(pool),
        makeRollbackProbe: () => {
          const store = new PgLinkMetadataStore(makeFaultyCiphertextPool(pool));
          const reader = new PgLinkMetadataStore(pool);
          const ctReader = new PgCiphertextStore(pool);
          return {
            store,
            getLink: (id: LinkId) => reader.get(id),
            getCiphertext: (id: LinkId) => ctReader.get(id),
          };
        },
      };
    });

    it("migration 0004 created the terminal-status retention index (BE-7 / R18)", async () => {
      const { rows } = await pool.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = $1 AND tablename = 'links' AND indexname = 'idx_links_terminal_at'`,
        [SCHEMA],
      );
      expect(rows).toHaveLength(1);
    });

    it("revoke purges the ciphertext immediately (same operation as the status flip)", async () => {
      await pool.query("TRUNCATE links, link_ciphertexts CASCADE");
      const linkStore = new PgLinkMetadataStore(pool);
      const ctStore = new PgCiphertextStore(pool);
      const id = "link-revoke-purge" as LinkId;
      await linkStore.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      await ctStore.put(id, new Uint8Array([1, 2, 3]));

      await linkStore.revoke(id);

      // Status flips to revoked AND the ciphertext blob is physically deleted in one shot — the
      // privacy policy's "revocation purges the ciphertext" promise, honored without waiting for
      // the expirePastDue() sweep.
      expect((await linkStore.get(id))?.status).toBe("revoked");
      expect(await ctStore.get(id)).toBeNull();
    });

    it("incrementOpens is atomic under concurrent calls (max_opens=1)", async () => {
      await pool.query("TRUNCATE links, link_ciphertexts CASCADE");
      const id = "link-concurrent" as LinkId;
      const store = new PgLinkMetadataStore(pool);
      await store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 1,
      });
      const results = await Promise.all([store.incrementOpens(id), store.incrementOpens(id)]);
      const successes = results.filter((r) => r !== null);
      const failures = results.filter((r) => r === null);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(successes[0]?.opensCount).toBe(1);
      expect(successes[0]?.status).toBe("expired");
    });
  });

  describe("PgCiphertextStore", () => {
    runCiphertextSuite(async () => {
      await pool.query("TRUNCATE links, link_ciphertexts CASCADE");
      const linkStore = new PgLinkMetadataStore(pool);
      const ctStore = new PgCiphertextStore(pool);
      const ensureLinkExists = async (id: LinkId): Promise<void> => {
        await linkStore.create({
          id,
          expiresAt: new Date(Date.now() + 60_000),
          maxOpens: -1,
        });
      };
      return { store: ctStore, ensureLinkExists };
    });

    it("expirePastDue purges ciphertext rows for expired links", async () => {
      await pool.query("TRUNCATE links, link_ciphertexts CASCADE");
      const linkStore = new PgLinkMetadataStore(pool);
      const ctStore = new PgCiphertextStore(pool);
      const past = "ct-past" as LinkId;
      const future = "ct-future" as LinkId;
      await linkStore.create({
        id: past,
        expiresAt: new Date(Date.now() - 1000),
        maxOpens: -1,
      });
      await linkStore.create({
        id: future,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      await ctStore.put(past, new Uint8Array([1, 2, 3]));
      await ctStore.put(future, new Uint8Array([4, 5, 6]));

      const purged = await linkStore.expirePastDue();
      expect(purged).toBe(1);

      expect(await ctStore.get(past)).toBeNull();
      expect(Array.from((await ctStore.get(future)) ?? [])).toEqual([4, 5, 6]);
    });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("getPool / closePool helpers", () => {
  const helperUrls: string[] = [];

  afterEach(async () => {
    while (helperUrls.length > 0) {
      const url = helperUrls.pop();
      if (url) await closePool(url);
    }
  });

  it("caches singletons by URL", () => {
    const url = `${TEST_DATABASE_URL}?app_name=cache_test`;
    helperUrls.push(url);
    const a = getPool(url);
    const b = getPool(url);
    expect(a).toBe(b);
  });

  it("returns different pools for different URLs", () => {
    const u1 = `${TEST_DATABASE_URL}?app_name=multi_a`;
    const u2 = `${TEST_DATABASE_URL}?app_name=multi_b`;
    helperUrls.push(u1, u2);
    expect(getPool(u1)).not.toBe(getPool(u2));
  });

  it("throws when no URL is available", () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => getPool()).toThrow(/DATABASE_URL is not set/);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it("closePool() with no arg closes all cached pools", async () => {
    const u1 = `${TEST_DATABASE_URL}?app_name=closeall_a`;
    const u2 = `${TEST_DATABASE_URL}?app_name=closeall_b`;
    getPool(u1);
    getPool(u2);
    await closePool();
    // After closeAll, getPool() with same URL returns a fresh pool.
    helperUrls.push(u1, u2);
    expect(getPool(u1)).not.toBe(getPool(u2));
  });

  it("closePool with unknown URL is a no-op", async () => {
    await expect(closePool("postgres://nope:nope@localhost:1/never")).resolves.toBeUndefined();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("runMigrations error path", () => {
  let pool: Pool;
  let schema: string;

  beforeAll(async () => {
    schema = `aesmsg_mig_err_${Math.random().toString(36).slice(2, 10)}`;
    const adminPool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await adminPool.query(`CREATE SCHEMA "${schema}"`);
    } finally {
      await adminPool.end();
    }
    pool = new Pool({
      connectionString: TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
  });

  afterAll(async () => {
    await pool.end();
    const adminPool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await adminPool.end();
    }
  });

  it("rolls back and rethrows when a migration file is invalid SQL", async () => {
    const tmpDir = `/tmp/server-store-mig-${Math.random().toString(36).slice(2, 10)}`;
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(tmpDir, { recursive: true });
    await writeFile(`${tmpDir}/0001_broken.sql`, "CREATE TABLE WITH BAD SYNTAX;");

    await expect(runMigrations({ pool, migrationsDir: tmpDir })).rejects.toThrow();

    // _migrations table exists but has no rows for the broken file
    const { rows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM _migrations WHERE filename = $1",
      ["0001_broken.sql"],
    );
    expect(rows).toHaveLength(0);
  });
});
