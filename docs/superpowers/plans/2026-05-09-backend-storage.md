# Slice 4 — Backend storage layer (`@aesmsg/server-store`) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Node-only `@aesmsg/server-store` package with three store interfaces (`LinkMetadataStore`, `CiphertextStore`, `RateLimitStore`), Memory + Postgres + Redis implementations, plain-SQL migrations + a TS runner with advisory-lock concurrency safety, and parameterized contract tests gated behind `TEST_DATABASE_URL` and `TEST_REDIS_URL` so CI without a database still passes.

**Architecture:** Three small TS interfaces drive three implementations each. Memory variants are unit-test fixtures; Postgres variants share a cached `pg.Pool` singleton keyed by URL; Redis variant uses an `ioredis` singleton. Migrations are plain SQL files run by a 30-line TS runner that holds a `pg_advisory_lock` for the duration. Parameterized "shared suites" (`runLinkMetadataSuite`, `runCiphertextSuite`, `runRateLimitSuite`) run identical assertions against Memory + the real backends so the contract is enforced everywhere.

**Tech Stack:** Node 22, TypeScript 5.7 strict (`verbatimModuleSyntax`), Vitest 3 (Node env, no browser mode), `pg` 8.x, `ioredis` 5.x, plain SQL.

**Spec:** [`docs/superpowers/specs/2026-05-09-backend-storage-design.md`](../specs/2026-05-09-backend-storage-design.md)

---

## File map

```
packages/server-store/
├─ package.json                              (Task 1)
├─ README.md                                 (Task 1 stub → Task 13 full)
├─ tsconfig.json                             (Task 1)
├─ vitest.config.ts                          (Task 1)
├─ migrations/
│  └─ 0001_init.sql                          (Task 8)
├─ src/
│  ├─ index.ts                               (Task 1 stub → Tasks 2/6/12)
│  ├─ types.ts                               (Task 2)
│  ├─ interfaces.ts                          (Task 2)
│  ├─ migrate.ts                             (Task 8)
│  ├─ memory/
│  │  ├─ link-metadata-store.ts              (Task 3)
│  │  ├─ ciphertext-store.ts                 (Task 4)
│  │  └─ rate-limit-store.ts                 (Task 5)
│  ├─ pg/
│  │  ├─ pool.ts                             (Task 7)
│  │  ├─ link-metadata-store.ts              (Task 9)
│  │  └─ ciphertext-store.ts                 (Task 10)
│  └─ redis/
│     ├─ client.ts                           (Task 11)
│     └─ rate-limit-store.ts                 (Task 11)
└─ tests/
   ├─ shared-link-metadata-suite.ts          (Task 3)
   ├─ shared-ciphertext-suite.ts             (Task 4)
   ├─ shared-rate-limit-suite.ts             (Task 5)
   ├─ memory.test.ts                         (Tasks 3/4/5)
   ├─ migrate.test.ts                        (Task 8)
   ├─ pg.test.ts                             (Tasks 9/10)
   └─ redis.test.ts                          (Task 11)
```

Cross-reference: `docs/superpowers/specs/2026-05-09-project-init-design.md` §7 — appended in Task 13.

---

## Task 1: Scaffold `@aesmsg/server-store` package

**Files:**
- Create: `packages/server-store/package.json`
- Create: `packages/server-store/tsconfig.json`
- Create: `packages/server-store/vitest.config.ts`
- Create: `packages/server-store/README.md`
- Create: `packages/server-store/src/index.ts`

- [ ] **Step 1: Create `packages/server-store/package.json`**

```json
{
  "name": "@aesmsg/server-store",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:coverage": "vitest run --config vitest.config.ts --coverage",
    "migrate": "tsx src/migrate.ts"
  },
  "dependencies": {
    "ioredis": "^5.4.1",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/pg": "^8.11.10",
    "@vitest/coverage-v8": "^3.2.4",
    "tsx": "^4.19.2",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/server-store/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

The `lib` array deliberately omits `DOM` / `DOM.Iterable` — this is a Node-only package; importing browser types would be a smell.

- [ ] **Step 3: Create `packages/server-store/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types.ts", "src/interfaces.ts"],
      thresholds: {
        lines: 85,
      },
    },
  },
});
```

- [ ] **Step 4: Create `packages/server-store/README.md` (stub — final content lands in Task 13)**

```md
# @aesmsg/server-store

Server-side persistence and rate-limit primitives for aesmsg. **Node-only** — never import from `@aesmsg/ui` or any client component path.

See [Slice 4 spec](../../docs/superpowers/specs/2026-05-09-backend-storage-design.md). Full README content arrives at the end of Slice 4.
```

- [ ] **Step 5: Create `packages/server-store/src/index.ts` (empty barrel — fills in over the slice)**

```ts
export {};
```

The empty barrel keeps `tsc` happy with the package having a real entry point. We populate it in Task 2 once types exist.

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`
Expected: pnpm picks up the new workspace package, refreshes `pnpm-lock.yaml`, installs `pg`, `ioredis`, `@types/pg`, `tsx`, `@vitest/coverage-v8`.

- [ ] **Step 7: Verify the package is wired in**

Run: `pnpm --filter @aesmsg/server-store typecheck`
Expected: PASS (empty source, nothing to typecheck against, exit 0).

Run: `pnpm --filter @aesmsg/server-store test`
Expected: vitest reports "No test files found" or similar but exits 0 cleanly. (If it errors, check vitest.config.ts.)

- [ ] **Step 8: Commit**

```bash
git add packages/server-store pnpm-lock.yaml
git commit -m "feat(server-store): scaffold @aesmsg/server-store package"
```

---

## Task 2: Define `LinkMetadata` types and store interfaces

**Files:**
- Create: `packages/server-store/src/types.ts`
- Create: `packages/server-store/src/interfaces.ts`
- Modify: `packages/server-store/src/index.ts`

- [ ] **Step 1: Create `packages/server-store/src/types.ts`**

```ts
export type LinkId = string & { readonly __linkIdBrand: unique symbol };

export type LinkStatus = "active" | "revoked" | "expired";

export interface LinkMetadata {
  readonly id: LinkId;
  readonly status: LinkStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** -1 means unlimited until expiry. Otherwise a positive integer. */
  readonly maxOpens: number;
  readonly opensCount: number;
  readonly recipientFingerprint: string;
}
```

- [ ] **Step 2: Create `packages/server-store/src/interfaces.ts`**

```ts
import type { LinkId, LinkMetadata } from "./types.js";

export interface LinkMetadataStore {
  create(record: Omit<LinkMetadata, "createdAt" | "opensCount" | "status">): Promise<LinkMetadata>;
  get(id: LinkId): Promise<LinkMetadata | null>;
  /** Atomic. Returns null if the link is not active or already past expiry/max-opens. */
  incrementOpens(id: LinkId): Promise<LinkMetadata | null>;
  revoke(id: LinkId): Promise<void>;
  /** Marks expired rows as expired and purges associated ciphertext. Returns number of ciphertexts purged. */
  expirePastDue(): Promise<number>;
}

export interface CiphertextStore {
  put(id: LinkId, blob: Uint8Array): Promise<void>;
  get(id: LinkId): Promise<Uint8Array | null>;
  delete(id: LinkId): Promise<void>;
}

export interface RateLimitStore {
  /** Increments the counter for `key` in the current `windowSeconds`-wide window and returns the new count. */
  incrementAndGet(key: string, windowSeconds: number): Promise<number>;
}
```

- [ ] **Step 3: Update `packages/server-store/src/index.ts` to re-export types**

Replace the file contents with:

```ts
export type { LinkId, LinkMetadata, LinkStatus } from "./types.js";
export type { CiphertextStore, LinkMetadataStore, RateLimitStore } from "./interfaces.js";
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @aesmsg/server-store typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server-store/src
git commit -m "feat(server-store): add LinkMetadata types and store interfaces"
```

---

## Task 3: `MemoryLinkMetadataStore` + parameterized link-metadata suite

**Files:**
- Create: `packages/server-store/tests/shared-link-metadata-suite.ts`
- Create: `packages/server-store/tests/memory.test.ts`
- Create: `packages/server-store/src/memory/link-metadata-store.ts`

- [ ] **Step 1: Write the failing shared suite**

Create `packages/server-store/tests/shared-link-metadata-suite.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { LinkMetadataStore } from "../src/interfaces.js";
import type { LinkId } from "../src/types.js";

export interface LinkMetadataSuiteContext {
  store: LinkMetadataStore;
}

export function runLinkMetadataSuite(
  setup: () => Promise<LinkMetadataSuiteContext> | LinkMetadataSuiteContext,
): void {
  let ctx: LinkMetadataSuiteContext;

  beforeEach(async () => {
    ctx = await setup();
  });

  describe("create + get", () => {
    it("round-trips fields and seeds status='active', opensCount=0, createdAt", async () => {
      const id = "link-rt" as LinkId;
      const expiresAt = new Date(Date.now() + 60_000);
      const created = await ctx.store.create({
        id,
        expiresAt,
        maxOpens: 1,
        recipientFingerprint: "fp-abc",
      });
      expect(created.id).toBe(id);
      expect(created.status).toBe("active");
      expect(created.opensCount).toBe(0);
      expect(created.maxOpens).toBe(1);
      expect(created.recipientFingerprint).toBe("fp-abc");
      expect(created.expiresAt.getTime()).toBe(expiresAt.getTime());
      expect(created.createdAt).toBeInstanceOf(Date);

      const fetched = await ctx.store.get(id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(id);
      expect(fetched?.status).toBe("active");
    });

    it("get returns null for unknown id", async () => {
      const fetched = await ctx.store.get("does-not-exist" as LinkId);
      expect(fetched).toBeNull();
    });
  });

  describe("revoke", () => {
    it("marks status='revoked'", async () => {
      const id = "link-rev" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        recipientFingerprint: "fp",
      });
      await ctx.store.revoke(id);
      const fetched = await ctx.store.get(id);
      expect(fetched?.status).toBe("revoked");
    });

    it("revoke on missing id is a no-op (no throw)", async () => {
      await expect(ctx.store.revoke("missing" as LinkId)).resolves.toBeUndefined();
    });
  });

  describe("incrementOpens", () => {
    it("increments opensCount and flips to 'expired' when hitting maxOpens", async () => {
      const id = "link-cap" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 2,
        recipientFingerprint: "fp",
      });
      const r1 = await ctx.store.incrementOpens(id);
      expect(r1?.opensCount).toBe(1);
      expect(r1?.status).toBe("active");

      const r2 = await ctx.store.incrementOpens(id);
      expect(r2?.opensCount).toBe(2);
      expect(r2?.status).toBe("expired");

      const r3 = await ctx.store.incrementOpens(id);
      expect(r3).toBeNull();
    });

    it("with maxOpens=-1 stays active across many opens", async () => {
      const id = "link-unlim" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        recipientFingerprint: "fp",
      });
      for (let i = 1; i <= 5; i++) {
        const r = await ctx.store.incrementOpens(id);
        expect(r?.opensCount).toBe(i);
        expect(r?.status).toBe("active");
      }
    });

    it("returns null on a revoked link", async () => {
      const id = "link-rev2" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        recipientFingerprint: "fp",
      });
      await ctx.store.revoke(id);
      expect(await ctx.store.incrementOpens(id)).toBeNull();
    });

    it("returns null when expiresAt is already in the past", async () => {
      const id = "link-past" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() - 1000),
        maxOpens: -1,
        recipientFingerprint: "fp",
      });
      expect(await ctx.store.incrementOpens(id)).toBeNull();
    });
  });

  describe("expirePastDue", () => {
    it("marks past-expiry rows as 'expired' and leaves future rows 'active'", async () => {
      const past = "link-exp-past" as LinkId;
      const future = "link-exp-future" as LinkId;
      await ctx.store.create({
        id: past,
        expiresAt: new Date(Date.now() - 1000),
        maxOpens: -1,
        recipientFingerprint: "fp",
      });
      await ctx.store.create({
        id: future,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        recipientFingerprint: "fp",
      });
      const purged = await ctx.store.expirePastDue();
      expect(purged).toBeGreaterThanOrEqual(0);

      const pastRow = await ctx.store.get(past);
      expect(pastRow?.status).toBe("expired");
      const futureRow = await ctx.store.get(future);
      expect(futureRow?.status).toBe("active");
    });

    it("does not change rows already revoked or expired", async () => {
      const revoked = "link-rev3" as LinkId;
      await ctx.store.create({
        id: revoked,
        expiresAt: new Date(Date.now() - 1000),
        maxOpens: -1,
        recipientFingerprint: "fp",
      });
      await ctx.store.revoke(revoked);
      await ctx.store.expirePastDue();
      const row = await ctx.store.get(revoked);
      expect(row?.status).toBe("revoked");
    });
  });
}
```

- [ ] **Step 2: Wire the suite into `tests/memory.test.ts`**

Create `packages/server-store/tests/memory.test.ts`:

```ts
import { describe } from "vitest";
import { MemoryLinkMetadataStore } from "../src/memory/link-metadata-store.js";
import { runLinkMetadataSuite } from "./shared-link-metadata-suite.js";

describe("MemoryLinkMetadataStore", () => {
  runLinkMetadataSuite(() => ({ store: new MemoryLinkMetadataStore() }));
});
```

- [ ] **Step 3: Run tests — expect failure (module missing)**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: FAIL — `Cannot find module '../src/memory/link-metadata-store.js'`.

- [ ] **Step 4: Implement `src/memory/link-metadata-store.ts`**

Create `packages/server-store/src/memory/link-metadata-store.ts`:

```ts
import type { LinkMetadataStore } from "../interfaces.js";
import type { LinkId, LinkMetadata, LinkStatus } from "../types.js";

export class MemoryLinkMetadataStore implements LinkMetadataStore {
  private readonly rows = new Map<LinkId, LinkMetadata>();

  async create(
    record: Omit<LinkMetadata, "createdAt" | "opensCount" | "status">,
  ): Promise<LinkMetadata> {
    if (this.rows.has(record.id)) {
      throw new Error(`MemoryLinkMetadataStore: link ${record.id} already exists`);
    }
    const meta: LinkMetadata = {
      ...record,
      status: "active",
      opensCount: 0,
      createdAt: new Date(),
    };
    this.rows.set(record.id, meta);
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
    return updated;
  }

  async revoke(id: LinkId): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    this.rows.set(id, { ...row, status: "revoked" });
  }

  async expirePastDue(): Promise<number> {
    const now = Date.now();
    for (const [id, row] of this.rows) {
      if (row.status === "active" && row.expiresAt.getTime() <= now) {
        this.rows.set(id, { ...row, status: "expired" });
      }
    }
    return 0;
  }
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS — all link-metadata cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/server-store/src/memory/link-metadata-store.ts \
        packages/server-store/tests/shared-link-metadata-suite.ts \
        packages/server-store/tests/memory.test.ts
git commit -m "feat(server-store): MemoryLinkMetadataStore + shared link-metadata suite"
```

---

## Task 4: `MemoryCiphertextStore` + parameterized ciphertext suite

**Files:**
- Create: `packages/server-store/tests/shared-ciphertext-suite.ts`
- Modify: `packages/server-store/tests/memory.test.ts`
- Create: `packages/server-store/src/memory/ciphertext-store.ts`

- [ ] **Step 1: Write the failing shared suite**

Create `packages/server-store/tests/shared-ciphertext-suite.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { CiphertextStore } from "../src/interfaces.js";
import type { LinkId } from "../src/types.js";

export interface CiphertextSuiteContext {
  store: CiphertextStore;
  /** PG enforces FK on link_ciphertexts → links. Memory doesn't. Suite calls this before put(). */
  ensureLinkExists?: (id: LinkId) => Promise<void>;
}

export function runCiphertextSuite(
  setup: () => Promise<CiphertextSuiteContext> | CiphertextSuiteContext,
): void {
  let ctx: CiphertextSuiteContext;

  beforeEach(async () => {
    ctx = await setup();
  });

  describe("put + get", () => {
    it("round-trips bytes exactly", async () => {
      const id = "ct-rt" as LinkId;
      await ctx.ensureLinkExists?.(id);
      const blob = new Uint8Array([0, 1, 2, 3, 4, 5, 250, 255]);
      await ctx.store.put(id, blob);
      const fetched = await ctx.store.get(id);
      expect(fetched).not.toBeNull();
      expect(Array.from(fetched ?? [])).toEqual(Array.from(blob));
    });

    it("get returns null for unknown id", async () => {
      const fetched = await ctx.store.get("ct-missing" as LinkId);
      expect(fetched).toBeNull();
    });

    it("put on existing id overwrites", async () => {
      const id = "ct-overwrite" as LinkId;
      await ctx.ensureLinkExists?.(id);
      await ctx.store.put(id, new Uint8Array([1, 2, 3]));
      await ctx.store.put(id, new Uint8Array([9, 9, 9, 9]));
      const fetched = await ctx.store.get(id);
      expect(Array.from(fetched ?? [])).toEqual([9, 9, 9, 9]);
    });
  });

  describe("delete", () => {
    it("removes the row, get returns null after", async () => {
      const id = "ct-del" as LinkId;
      await ctx.ensureLinkExists?.(id);
      await ctx.store.put(id, new Uint8Array([1, 2, 3]));
      await ctx.store.delete(id);
      const fetched = await ctx.store.get(id);
      expect(fetched).toBeNull();
    });

    it("delete on missing id is a no-op (no throw)", async () => {
      await expect(ctx.store.delete("ct-missing-2" as LinkId)).resolves.toBeUndefined();
    });
  });
}
```

- [ ] **Step 2: Add the ciphertext suite to `tests/memory.test.ts`**

Update `packages/server-store/tests/memory.test.ts` to:

```ts
import { describe } from "vitest";
import { MemoryCiphertextStore } from "../src/memory/ciphertext-store.js";
import { MemoryLinkMetadataStore } from "../src/memory/link-metadata-store.js";
import { runCiphertextSuite } from "./shared-ciphertext-suite.js";
import { runLinkMetadataSuite } from "./shared-link-metadata-suite.js";

describe("MemoryLinkMetadataStore", () => {
  runLinkMetadataSuite(() => ({ store: new MemoryLinkMetadataStore() }));
});

describe("MemoryCiphertextStore", () => {
  runCiphertextSuite(() => ({ store: new MemoryCiphertextStore() }));
});
```

- [ ] **Step 3: Run tests — expect failure (module missing)**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: FAIL — `Cannot find module '../src/memory/ciphertext-store.js'`.

- [ ] **Step 4: Implement `src/memory/ciphertext-store.ts`**

Create `packages/server-store/src/memory/ciphertext-store.ts`:

```ts
import type { CiphertextStore } from "../interfaces.js";
import type { LinkId } from "../types.js";

export class MemoryCiphertextStore implements CiphertextStore {
  private readonly rows = new Map<LinkId, Uint8Array>();

  async put(id: LinkId, blob: Uint8Array): Promise<void> {
    this.rows.set(id, new Uint8Array(blob));
  }

  async get(id: LinkId): Promise<Uint8Array | null> {
    const row = this.rows.get(id);
    return row ? new Uint8Array(row) : null;
  }

  async delete(id: LinkId): Promise<void> {
    this.rows.delete(id);
  }
}
```

The `new Uint8Array(blob)` copy on `put` and `get` ensures callers cannot mutate stored bytes after the fact — matches what a real backend does (serializes to disk / network).

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server-store/src/memory/ciphertext-store.ts \
        packages/server-store/tests/shared-ciphertext-suite.ts \
        packages/server-store/tests/memory.test.ts
git commit -m "feat(server-store): MemoryCiphertextStore + shared ciphertext suite"
```

---

## Task 5: `MemoryRateLimitStore` + shared rate-limit suite + fake-timer TTL test

**Files:**
- Create: `packages/server-store/tests/shared-rate-limit-suite.ts`
- Modify: `packages/server-store/tests/memory.test.ts`
- Create: `packages/server-store/src/memory/rate-limit-store.ts`

- [ ] **Step 1: Write the failing shared suite**

Create `packages/server-store/tests/shared-rate-limit-suite.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { RateLimitStore } from "../src/interfaces.js";

export interface RateLimitSuiteContext {
  store: RateLimitStore;
  /** Test-run-unique prefix to avoid cross-run bleed against shared Redis. */
  keyPrefix: string;
}

export function runRateLimitSuite(
  setup: () => Promise<RateLimitSuiteContext> | RateLimitSuiteContext,
): void {
  let ctx: RateLimitSuiteContext;

  beforeEach(async () => {
    ctx = await setup();
  });

  describe("incrementAndGet", () => {
    it("first call returns 1", async () => {
      const k = `${ctx.keyPrefix}:first-${Math.random()}`;
      const c = await ctx.store.incrementAndGet(k, 60);
      expect(c).toBe(1);
    });

    it("subsequent calls increment", async () => {
      const k = `${ctx.keyPrefix}:incr-${Math.random()}`;
      expect(await ctx.store.incrementAndGet(k, 60)).toBe(1);
      expect(await ctx.store.incrementAndGet(k, 60)).toBe(2);
      expect(await ctx.store.incrementAndGet(k, 60)).toBe(3);
    });

    it("different keys are independent", async () => {
      const k1 = `${ctx.keyPrefix}:a-${Math.random()}`;
      const k2 = `${ctx.keyPrefix}:b-${Math.random()}`;
      expect(await ctx.store.incrementAndGet(k1, 60)).toBe(1);
      expect(await ctx.store.incrementAndGet(k2, 60)).toBe(1);
      expect(await ctx.store.incrementAndGet(k1, 60)).toBe(2);
      expect(await ctx.store.incrementAndGet(k2, 60)).toBe(2);
      expect(await ctx.store.incrementAndGet(k1, 60)).toBe(3);
    });
  });
}
```

- [ ] **Step 2: Add the rate-limit suite + memory-specific TTL test to `memory.test.ts`**

Update `packages/server-store/tests/memory.test.ts` to:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCiphertextStore } from "../src/memory/ciphertext-store.js";
import { MemoryLinkMetadataStore } from "../src/memory/link-metadata-store.js";
import { MemoryRateLimitStore } from "../src/memory/rate-limit-store.js";
import { runCiphertextSuite } from "./shared-ciphertext-suite.js";
import { runLinkMetadataSuite } from "./shared-link-metadata-suite.js";
import { runRateLimitSuite } from "./shared-rate-limit-suite.js";

describe("MemoryLinkMetadataStore", () => {
  runLinkMetadataSuite(() => ({ store: new MemoryLinkMetadataStore() }));
});

describe("MemoryCiphertextStore", () => {
  runCiphertextSuite(() => ({ store: new MemoryCiphertextStore() }));
});

describe("MemoryRateLimitStore", () => {
  runRateLimitSuite(() => ({
    store: new MemoryRateLimitStore(),
    keyPrefix: "mem-test",
  }));

  describe("TTL boundary", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("count resets when the wall clock crosses into a new window", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
      const store = new MemoryRateLimitStore();
      expect(await store.incrementAndGet("k", 1)).toBe(1);
      expect(await store.incrementAndGet("k", 1)).toBe(2);
      vi.advanceTimersByTime(1100);
      expect(await store.incrementAndGet("k", 1)).toBe(1);
    });
  });
});
```

- [ ] **Step 3: Run tests — expect failure (module missing)**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: FAIL — `Cannot find module '../src/memory/rate-limit-store.js'`.

- [ ] **Step 4: Implement `src/memory/rate-limit-store.ts`**

Create `packages/server-store/src/memory/rate-limit-store.ts`:

```ts
import type { RateLimitStore } from "../interfaces.js";

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, number>();

  async incrementAndGet(key: string, windowSeconds: number): Promise<number> {
    const windowFloor = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const windowKey = `${key}:${windowFloor}`;
    const next = (this.windows.get(windowKey) ?? 0) + 1;
    this.windows.set(windowKey, next);
    return next;
  }
}
```

The same window-floor formula the Redis variant will use (`floor(epoch / windowSeconds) * windowSeconds`). Crossing into a new window changes the key, so the count resets — matches Redis TTL behavior under fixed-window semantics.

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server-store/src/memory/rate-limit-store.ts \
        packages/server-store/tests/shared-rate-limit-suite.ts \
        packages/server-store/tests/memory.test.ts
git commit -m "feat(server-store): MemoryRateLimitStore + shared rate-limit suite"
```

---

## Task 6: Re-export memory implementations from the package barrel

**Files:**
- Modify: `packages/server-store/src/index.ts`

- [ ] **Step 1: Update barrel to export memory implementations**

Replace `packages/server-store/src/index.ts` with:

```ts
export type { LinkId, LinkMetadata, LinkStatus } from "./types.js";
export type { CiphertextStore, LinkMetadataStore, RateLimitStore } from "./interfaces.js";

export { MemoryCiphertextStore } from "./memory/ciphertext-store.js";
export { MemoryLinkMetadataStore } from "./memory/link-metadata-store.js";
export { MemoryRateLimitStore } from "./memory/rate-limit-store.js";
```

- [ ] **Step 2: Verify typecheck + tests still pass**

Run: `pnpm --filter @aesmsg/server-store typecheck && pnpm --filter @aesmsg/server-store test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server-store/src/index.ts
git commit -m "feat(server-store): export memory store implementations from barrel"
```

---

## Task 7: Postgres pool helper

**Files:**
- Create: `packages/server-store/src/pg/pool.ts`

- [ ] **Step 1: Create `src/pg/pool.ts`**

```ts
import { Pool } from "pg";

const pools = new Map<string, Pool>();

/**
 * Returns a cached `Pool` for the given URL (defaults to `process.env.DATABASE_URL`).
 * The same pool is reused across `Pg*Store` instances that target the same URL.
 */
export function getPool(connectionString?: string): Pool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("server-store: DATABASE_URL is not set");
  }
  let pool = pools.get(url);
  if (!pool) {
    pool = new Pool({ connectionString: url });
    pools.set(url, pool);
  }
  return pool;
}

/** Closes and forgets the cached pool for `connectionString` (or all pools if omitted). */
export async function closePool(connectionString?: string): Promise<void> {
  if (connectionString === undefined) {
    const all = Array.from(pools.values());
    pools.clear();
    await Promise.all(all.map((p) => p.end()));
    return;
  }
  const pool = pools.get(connectionString);
  if (pool) {
    pools.delete(connectionString);
    await pool.end();
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @aesmsg/server-store typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server-store/src/pg/pool.ts
git commit -m "feat(server-store): cached pg.Pool helper"
```

(No test commit yet — pool behavior is exercised through the gated `pg.test.ts` suites in Tasks 9/10.)

---

## Task 8: Migration SQL + runner with idempotency test

**Files:**
- Create: `packages/server-store/migrations/0001_init.sql`
- Create: `packages/server-store/src/migrate.ts`
- Create: `packages/server-store/tests/migrate.test.ts`

- [ ] **Step 1: Create the migration**

Create `packages/server-store/migrations/0001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS links (
  id              text PRIMARY KEY,
  status          text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  max_opens       integer NOT NULL CHECK (max_opens > 0 OR max_opens = -1),
  opens_count     integer NOT NULL DEFAULT 0 CHECK (opens_count >= 0),
  recipient_fp    text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_active_expires ON links (expires_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS link_ciphertexts (
  link_id   text PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE,
  blob      bytea NOT NULL,
  size      integer NOT NULL CHECK (size >= 0)
);
```

`IF NOT EXISTS` makes the SQL itself idempotent as a defense-in-depth measure; the runner's primary idempotency mechanism is the `_migrations` table (skip if already applied), but `IF NOT EXISTS` keeps things tidy if someone runs migrations manually without the runner.

The `_migrations` table is created by the runner (Step 2), not by this SQL — the runner needs to query it before applying any migration, so it has to bootstrap that table itself.

- [ ] **Step 2: Create the runner `src/migrate.ts`**

```ts
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { getPool } from "./pg/pool.js";

const ADVISORY_LOCK_KEY = 0xdeadbeef;

const defaultMigrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

export interface RunMigrationsOptions {
  pool?: Pool;
  migrationsDir?: string;
}

export interface RunMigrationsResult {
  applied: string[];
}

export async function runMigrations(
  opts: RunMigrationsOptions = {},
): Promise<RunMigrationsResult> {
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

    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM _migrations",
    );
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
```

- [ ] **Step 3: Write the gated migrate test**

Create `packages/server-store/tests/migrate.test.ts`:

```ts
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

  it("creates _migrations + applies 0001_init.sql on a fresh schema", async () => {
    const result = await runMigrations({ pool });
    expect(result.applied).toEqual(["0001_init.sql"]);

    const { rows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM _migrations ORDER BY filename",
    );
    expect(rows.map((r) => r.filename)).toEqual(["0001_init.sql"]);

    const linksOk = await pool.query("SELECT 1 FROM links LIMIT 0");
    expect(linksOk.rowCount).toBe(0);
    const ctOk = await pool.query("SELECT 1 FROM link_ciphertexts LIMIT 0");
    expect(ctOk.rowCount).toBe(0);
  });

  it("is idempotent — second run applies nothing and does not error", async () => {
    const result = await runMigrations({ pool });
    expect(result.applied).toEqual([]);

    const { rows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM _migrations",
    );
    expect(rows.map((r) => r.filename)).toEqual(["0001_init.sql"]);
  });
});
```

- [ ] **Step 4: Run tests without env var — expect pass (skip)**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS — migrate suite is skipped, memory suites still green.

- [ ] **Step 5: Run tests with `TEST_DATABASE_URL` — expect pass**

Run (assumes Postgres available locally; see README/spec §12 for Docker recipe):
`TEST_DATABASE_URL="postgres://postgres:secret@localhost:5432/postgres" pnpm --filter @aesmsg/server-store test`
Expected: PASS — both migrate cases green plus memory suites. (Skip this step if you do not have a local Postgres yet; you must run it before completing Task 13.)

- [ ] **Step 6: Commit**

```bash
git add packages/server-store/migrations \
        packages/server-store/src/migrate.ts \
        packages/server-store/tests/migrate.test.ts
git commit -m "feat(server-store): plain-SQL migrations + advisory-lock TS runner"
```

---

## Task 9: `PgLinkMetadataStore` + gated shared suite + concurrency test

**Files:**
- Create: `packages/server-store/src/pg/link-metadata-store.ts`
- Create: `packages/server-store/tests/pg.test.ts`

- [ ] **Step 1: Write the failing gated test**

Create `packages/server-store/tests/pg.test.ts`:

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { PgLinkMetadataStore } from "../src/pg/link-metadata-store.js";
import type { LinkId } from "../src/types.js";
import { runLinkMetadataSuite } from "./shared-link-metadata-suite.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `aesmsg_pg_${Math.random().toString(36).slice(2, 10)}`;

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
      return { store: new PgLinkMetadataStore(pool) };
    });

    it("incrementOpens is atomic under concurrent calls (max_opens=1)", async () => {
      await pool.query("TRUNCATE links, link_ciphertexts CASCADE");
      const id = "link-concurrent" as LinkId;
      const store = new PgLinkMetadataStore(pool);
      await store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 1,
        recipientFingerprint: "fp",
      });
      const results = await Promise.all([
        store.incrementOpens(id),
        store.incrementOpens(id),
      ]);
      const successes = results.filter((r) => r !== null);
      const failures = results.filter((r) => r === null);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(successes[0]?.opensCount).toBe(1);
      expect(successes[0]?.status).toBe("expired");
    });
  });
});
```

- [ ] **Step 2: Run tests — without env var, suite skips and memory passes**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS — pg suite skipped.

- [ ] **Step 3: Run tests with env var — expect failure (PgLinkMetadataStore missing)**

Run: `TEST_DATABASE_URL="postgres://postgres:secret@localhost:5432/postgres" pnpm --filter @aesmsg/server-store test`
Expected: FAIL — `Cannot find module '../src/pg/link-metadata-store.js'`. (Skip if you have not set up local Postgres yet — proceed to Step 4 anyway.)

- [ ] **Step 4: Implement `src/pg/link-metadata-store.ts`**

```ts
import type { Pool } from "pg";
import type { LinkMetadataStore } from "../interfaces.js";
import type { LinkId, LinkMetadata, LinkStatus } from "../types.js";
import { getPool } from "./pool.js";

interface Row {
  id: string;
  status: LinkStatus;
  created_at: Date;
  expires_at: Date;
  max_opens: number;
  opens_count: number;
  recipient_fp: string;
}

function rowToMeta(row: Row): LinkMetadata {
  return {
    id: row.id as LinkId,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxOpens: row.max_opens,
    opensCount: row.opens_count,
    recipientFingerprint: row.recipient_fp,
  };
}

export class PgLinkMetadataStore implements LinkMetadataStore {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  async create(
    record: Omit<LinkMetadata, "createdAt" | "opensCount" | "status">,
  ): Promise<LinkMetadata> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO links (id, status, expires_at, max_opens, opens_count, recipient_fp)
       VALUES ($1, 'active', $2, $3, 0, $4)
       RETURNING id, status, created_at, expires_at, max_opens, opens_count, recipient_fp`,
      [record.id, record.expiresAt, record.maxOpens, record.recipientFingerprint],
    );
    const row = rows[0];
    if (!row) throw new Error("PgLinkMetadataStore: INSERT did not RETURN a row");
    return rowToMeta(row);
  }

  async get(id: LinkId): Promise<LinkMetadata | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT id, status, created_at, expires_at, max_opens, opens_count, recipient_fp
       FROM links WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToMeta(rows[0]) : null;
  }

  async incrementOpens(id: LinkId): Promise<LinkMetadata | null> {
    const { rows } = await this.pool.query<Row>(
      `UPDATE links
         SET opens_count = opens_count + 1,
             status = CASE
               WHEN max_opens != -1 AND opens_count + 1 >= max_opens THEN 'expired'
               ELSE status
             END
       WHERE id = $1 AND status = 'active' AND expires_at > now()
       RETURNING id, status, created_at, expires_at, max_opens, opens_count, recipient_fp`,
      [id],
    );
    return rows[0] ? rowToMeta(rows[0]) : null;
  }

  async revoke(id: LinkId): Promise<void> {
    await this.pool.query("UPDATE links SET status = 'revoked' WHERE id = $1", [id]);
  }

  async expirePastDue(): Promise<number> {
    await this.pool.query(
      "UPDATE links SET status = 'expired' WHERE status = 'active' AND expires_at <= now()",
    );
    const { rowCount } = await this.pool.query(
      `DELETE FROM link_ciphertexts
       WHERE link_id IN (SELECT id FROM links WHERE status IN ('expired', 'revoked'))`,
    );
    return rowCount ?? 0;
  }
}
```

- [ ] **Step 5: Run gated tests — expect pass**

Run: `TEST_DATABASE_URL="postgres://postgres:secret@localhost:5432/postgres" pnpm --filter @aesmsg/server-store test`
Expected: PASS — link-metadata shared suite + concurrency test all green.

- [ ] **Step 6: Run without env var — expect pass (skip)**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS — pg suite skipped, memory still green.

- [ ] **Step 7: Commit**

```bash
git add packages/server-store/src/pg/link-metadata-store.ts \
        packages/server-store/tests/pg.test.ts
git commit -m "feat(server-store): PgLinkMetadataStore with atomic incrementOpens"
```

---

## Task 10: `PgCiphertextStore` + extend the gated suite

**Files:**
- Create: `packages/server-store/src/pg/ciphertext-store.ts`
- Modify: `packages/server-store/tests/pg.test.ts`

- [ ] **Step 1: Extend the gated test file with the ciphertext suite**

Update `packages/server-store/tests/pg.test.ts` — add an import + a new `describe` block inside the same outer `describe`. The full file becomes:

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { PgCiphertextStore } from "../src/pg/ciphertext-store.js";
import { PgLinkMetadataStore } from "../src/pg/link-metadata-store.js";
import type { LinkId } from "../src/types.js";
import { runCiphertextSuite } from "./shared-ciphertext-suite.js";
import { runLinkMetadataSuite } from "./shared-link-metadata-suite.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `aesmsg_pg_${Math.random().toString(36).slice(2, 10)}`;

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
      return { store: new PgLinkMetadataStore(pool) };
    });

    it("incrementOpens is atomic under concurrent calls (max_opens=1)", async () => {
      await pool.query("TRUNCATE links, link_ciphertexts CASCADE");
      const id = "link-concurrent" as LinkId;
      const store = new PgLinkMetadataStore(pool);
      await store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 1,
        recipientFingerprint: "fp",
      });
      const results = await Promise.all([
        store.incrementOpens(id),
        store.incrementOpens(id),
      ]);
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
          recipientFingerprint: "fp",
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
        recipientFingerprint: "fp",
      });
      await linkStore.create({
        id: future,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        recipientFingerprint: "fp",
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
```

- [ ] **Step 2: Run gated tests — expect failure (PgCiphertextStore missing)**

Run: `TEST_DATABASE_URL="postgres://postgres:secret@localhost:5432/postgres" pnpm --filter @aesmsg/server-store test`
Expected: FAIL — `Cannot find module '../src/pg/ciphertext-store.js'`.

- [ ] **Step 3: Implement `src/pg/ciphertext-store.ts`**

```ts
import type { Pool } from "pg";
import type { CiphertextStore } from "../interfaces.js";
import type { LinkId } from "../types.js";
import { getPool } from "./pool.js";

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
}
```

- [ ] **Step 4: Run gated tests — expect pass**

Run: `TEST_DATABASE_URL="postgres://postgres:secret@localhost:5432/postgres" pnpm --filter @aesmsg/server-store test`
Expected: PASS — ciphertext shared suite + the expirePastDue purge test all green.

- [ ] **Step 5: Run without env var — expect pass**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS — pg suite skipped.

- [ ] **Step 6: Commit**

```bash
git add packages/server-store/src/pg/ciphertext-store.ts \
        packages/server-store/tests/pg.test.ts
git commit -m "feat(server-store): PgCiphertextStore (bytea) + ciphertext purge test"
```

---

## Task 11: Redis client helper + `RedisRateLimitStore` + gated test

**Files:**
- Create: `packages/server-store/src/redis/client.ts`
- Create: `packages/server-store/src/redis/rate-limit-store.ts`
- Create: `packages/server-store/tests/redis.test.ts`

- [ ] **Step 1: Write the failing gated test**

Create `packages/server-store/tests/redis.test.ts`:

```ts
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisRateLimitStore } from "../src/redis/rate-limit-store.js";
import { runRateLimitSuite } from "./shared-rate-limit-suite.js";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const PREFIX = `test_${Math.random().toString(36).slice(2, 10)}`;

describe.skipIf(!TEST_REDIS_URL)("RedisRateLimitStore", () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(TEST_REDIS_URL as string);
  });

  afterAll(async () => {
    const keys = await redis.keys(`ratelimit:${PREFIX}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  runRateLimitSuite(() => ({
    store: new RedisRateLimitStore(redis),
    keyPrefix: PREFIX,
  }));

  it("TTL boundary resets the counter after windowSeconds elapses", async () => {
    const store = new RedisRateLimitStore(redis);
    const key = `${PREFIX}:ttl-${Math.random().toString(36).slice(2, 6)}`;
    expect(await store.incrementAndGet(key, 1)).toBe(1);
    expect(await store.incrementAndGet(key, 1)).toBe(2);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await store.incrementAndGet(key, 1)).toBe(1);
  }, 5000);
});
```

- [ ] **Step 2: Run tests without env var — expect pass (skip)**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS — redis suite skipped.

- [ ] **Step 3: Run with env var — expect failure (modules missing)**

Run: `TEST_REDIS_URL="redis://localhost:6379" pnpm --filter @aesmsg/server-store test`
Expected: FAIL — `Cannot find module '../src/redis/rate-limit-store.js'`. (Skip if you do not have local Redis yet — proceed to Step 4 anyway.)

- [ ] **Step 4: Implement `src/redis/client.ts`**

```ts
import { Redis } from "ioredis";

const clients = new Map<string, Redis>();

/** Returns a cached `ioredis` client for `connectionString` (defaults to `process.env.REDIS_URL`). */
export function getRedis(connectionString?: string): Redis {
  const url = connectionString ?? process.env.REDIS_URL;
  if (!url) {
    throw new Error("server-store: REDIS_URL is not set");
  }
  let client = clients.get(url);
  if (!client) {
    client = new Redis(url);
    clients.set(url, client);
  }
  return client;
}

export async function closeRedis(connectionString?: string): Promise<void> {
  if (connectionString === undefined) {
    const all = Array.from(clients.values());
    clients.clear();
    await Promise.all(all.map((c) => c.quit()));
    return;
  }
  const client = clients.get(connectionString);
  if (client) {
    clients.delete(connectionString);
    await client.quit();
  }
}
```

- [ ] **Step 5: Implement `src/redis/rate-limit-store.ts`**

```ts
import type { Redis } from "ioredis";
import type { RateLimitStore } from "../interfaces.js";
import { getRedis } from "./client.js";

export class RedisRateLimitStore implements RateLimitStore {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? getRedis();
  }

  async incrementAndGet(key: string, windowSeconds: number): Promise<number> {
    const windowFloor = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const redisKey = `ratelimit:${key}:${windowFloor}`;
    const tx = this.redis.multi();
    tx.incr(redisKey);
    tx.expire(redisKey, windowSeconds, "NX");
    const replies = await tx.exec();
    if (!replies) throw new Error("RedisRateLimitStore: multi() returned null");
    const incrReply = replies[0];
    if (!incrReply) throw new Error("RedisRateLimitStore: missing INCR reply");
    const [incrErr, count] = incrReply as [Error | null, number | string];
    if (incrErr) throw incrErr;
    return Number(count);
  }
}
```

`expire(key, seconds, "NX")` requires Redis ≥ 7.0 — `NX` means "only set TTL if the key does not already have one", which keeps the TTL anchored to the first INCR rather than re-extending on every call.

- [ ] **Step 6: Run with env var — expect pass**

Run: `TEST_REDIS_URL="redis://localhost:6379" pnpm --filter @aesmsg/server-store test`
Expected: PASS — rate-limit shared suite + TTL boundary test all green.

- [ ] **Step 7: Run without env var — still pass**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS — redis suite skipped.

- [ ] **Step 8: Commit**

```bash
git add packages/server-store/src/redis \
        packages/server-store/tests/redis.test.ts
git commit -m "feat(server-store): RedisRateLimitStore (fixed-window) + cached client"
```

---

## Task 12: Final barrel exports for Pg + Redis + helpers + `runMigrations`

**Files:**
- Modify: `packages/server-store/src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with the full barrel**

```ts
export type { LinkId, LinkMetadata, LinkStatus } from "./types.js";
export type { CiphertextStore, LinkMetadataStore, RateLimitStore } from "./interfaces.js";

export { MemoryCiphertextStore } from "./memory/ciphertext-store.js";
export { MemoryLinkMetadataStore } from "./memory/link-metadata-store.js";
export { MemoryRateLimitStore } from "./memory/rate-limit-store.js";

export { PgCiphertextStore } from "./pg/ciphertext-store.js";
export { PgLinkMetadataStore } from "./pg/link-metadata-store.js";
export { closePool, getPool } from "./pg/pool.js";

export { closeRedis, getRedis } from "./redis/client.js";
export { RedisRateLimitStore } from "./redis/rate-limit-store.js";

export { runMigrations } from "./migrate.js";
export type { RunMigrationsOptions, RunMigrationsResult } from "./migrate.js";
```

- [ ] **Step 2: Verify typecheck + tests + lint**

Run in parallel (or sequentially):
- `pnpm --filter @aesmsg/server-store typecheck`
- `pnpm --filter @aesmsg/server-store test`
- `pnpm lint`

Expected: PASS for all three. Lint should be clean — Biome's recommended rules don't trip on this code style.

- [ ] **Step 3: Commit**

```bash
git add packages/server-store/src/index.ts
git commit -m "feat(server-store): finalize package barrel exports"
```

---

## Task 13: README content + cross-reference from init spec §7

**Files:**
- Modify: `packages/server-store/README.md`
- Modify: `docs/superpowers/specs/2026-05-09-project-init-design.md`

- [ ] **Step 1: Replace `packages/server-store/README.md` with the full content**

```md
# @aesmsg/server-store

Server-side persistence + rate-limit primitives for aesmsg. **Node-only** — never import from `@aesmsg/ui`, browser code, or any client-component path. Importing from a Next.js Server Component or API route is fine.

## Interfaces

```ts
interface LinkMetadataStore {
  create(record: Omit<LinkMetadata, "createdAt" | "opensCount" | "status">): Promise<LinkMetadata>;
  get(id: LinkId): Promise<LinkMetadata | null>;
  /** Atomic. Returns null if the link is not active or already past expiry/max-opens. */
  incrementOpens(id: LinkId): Promise<LinkMetadata | null>;
  revoke(id: LinkId): Promise<void>;
  /** Marks expired rows as expired and purges associated ciphertext. Returns number of ciphertexts purged. */
  expirePastDue(): Promise<number>;
}

interface CiphertextStore {
  put(id: LinkId, blob: Uint8Array): Promise<void>;
  get(id: LinkId): Promise<Uint8Array | null>;
  delete(id: LinkId): Promise<void>;
}

interface RateLimitStore {
  /** Fixed-window counter. Returns the new count for the current window. */
  incrementAndGet(key: string, windowSeconds: number): Promise<number>;
}
```

Each interface has three implementations:

| Interface | Memory | Postgres / Redis |
|---|---|---|
| `LinkMetadataStore` | `MemoryLinkMetadataStore` | `PgLinkMetadataStore` |
| `CiphertextStore` | `MemoryCiphertextStore` | `PgCiphertextStore` (bytea — Phase 1 fallback) |
| `RateLimitStore` | `MemoryRateLimitStore` | `RedisRateLimitStore` (fixed-window) |

`Pg*` and `Redis*` accept an injected `pg.Pool` / `Redis` instance for tests; in production, omit it and they pick up the URL-keyed cached singleton from `getPool()` / `getRedis()`.

## Environment variables

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `PgLinkMetadataStore`, `PgCiphertextStore`, `runMigrations` | Standard Postgres URL: `postgres://user:pass@host:port/dbname` |
| `REDIS_URL` | `RedisRateLimitStore` | Standard Redis URL: `redis://[user:pass@]host[:port][/db]` |
| `TEST_DATABASE_URL` | `pg.test.ts`, `migrate.test.ts` | If unset, those suites skip |
| `TEST_REDIS_URL` | `redis.test.ts` | If unset, that suite skips |

## Local Postgres + Redis via Docker

```bash
docker run --name pg -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:16
docker run --name redis -p 6379:6379 -d redis:7

export DATABASE_URL=postgres://postgres:secret@localhost:5432/postgres
export REDIS_URL=redis://localhost:6379

# Apply migrations
pnpm --filter @aesmsg/server-store exec tsx src/migrate.ts

# Run the full integration suite
TEST_DATABASE_URL=$DATABASE_URL TEST_REDIS_URL=$REDIS_URL \
  pnpm --filter @aesmsg/server-store test
```

## Atomic operations — quick reference

`incrementOpens` is a single UPDATE with a `CASE`-driven status flip; two simultaneous calls against the same row are serialized by Postgres MVCC + row locks, so exactly one wins when `max_opens = 1`. See `src/pg/link-metadata-store.ts`.

`expirePastDue` runs a non-transactional two-step: mark active rows past expiry as `'expired'`, then `DELETE FROM link_ciphertexts WHERE link_id IN (... rows in terminal status)`. The metadata row is **kept** so callers can distinguish expired/revoked from "never existed".

The Redis rate limit uses a fixed-window counter — `KEY = ratelimit:<key>:<window-floor-epoch>`, INCR + `EXPIRE … NX` in a `MULTI`. Requires Redis 7.0+ for the `NX` flag.

## Migrations

Plain SQL files in `migrations/`, applied in lexicographic order by `runMigrations()` in `src/migrate.ts`. The runner records applied filenames in a `_migrations` table (created on first run) and holds `pg_advisory_lock(0xdeadbeef)` for the duration so two processes running simultaneously serialize. Down-migrations are not supported in Phase 1 — a rollback is a database restore.

## Slice 5 onwards

Slice 5 (sender flow) is the first consumer of this package — `apps/web/src/app/api/messages/route.ts` calls `PgLinkMetadataStore` + `PgCiphertextStore` to persist newly-created links. See [the next spec](../../docs/superpowers/specs/) once it lands.
```

- [ ] **Step 2: Append cross-reference paragraph to init spec §7**

Open `docs/superpowers/specs/2026-05-09-project-init-design.md`, locate the line ending `**At scaffold time:** only the TS interfaces and a `MemoryStore` test double exist. Real adapters are Phase 1 implementation work.` (around line 182), and append a new paragraph immediately after it:

```md

> **Phase 1 update (Slice 4):** the canonical home for these interfaces and their Memory + Postgres + Redis implementations is now [`packages/server-store`](../../../packages/server-store). The signatures evolved slightly (e.g. `create` returns `LinkMetadata`, `incrementOpens` returns `LinkMetadata | null`) — see [Slice 4 spec](2026-05-09-backend-storage-design.md) §5 for the canonical API.
```

- [ ] **Step 3: Verify lint + format**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server-store/README.md docs/superpowers/specs/2026-05-09-project-init-design.md
git commit -m "docs(server-store): full README + cross-reference from init spec §7"
```

---

## Task 14: Final verification — typecheck, lint, test (no DB), test (with DB), coverage

- [ ] **Step 1: Typecheck the entire workspace**

Run: `pnpm typecheck`
Expected: PASS across every package.

- [ ] **Step 2: Lint the entire workspace**

Run: `pnpm lint`
Expected: PASS — Biome reports no findings.

- [ ] **Step 3: Run all tests without env vars**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS — Memory suites green, Pg/Redis/migrate suites skipped cleanly. Vitest output should show several `↓` markers for skipped describes.

- [ ] **Step 4: Boot Postgres + Redis locally (if not already running)**

If you do not already have a local Postgres + Redis:

```bash
docker run --name ss-pg -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:16
docker run --name ss-redis -p 6379:6379 -d redis:7
```

Wait ~3 seconds for both to accept connections (`docker logs ss-pg` should end with `database system is ready to accept connections`).

- [ ] **Step 5: Run the full integration suite**

Run:
```bash
TEST_DATABASE_URL=postgres://postgres:secret@localhost:5432/postgres \
TEST_REDIS_URL=redis://localhost:6379 \
pnpm --filter @aesmsg/server-store test
```

Expected: PASS — Memory suites + migrate test (×2 idempotency) + Pg link-metadata suite + Pg ciphertext suite + concurrency test + Redis rate-limit suite + TTL boundary test all green.

- [ ] **Step 6: Run with coverage and verify ≥85%**

Run:
```bash
TEST_DATABASE_URL=postgres://postgres:secret@localhost:5432/postgres \
TEST_REDIS_URL=redis://localhost:6379 \
pnpm --filter @aesmsg/server-store test:coverage
```

Expected: PASS, coverage report shows lines ≥ 85% on `src/`. If coverage is below threshold, identify the uncovered branches (likely error paths in `pg/pool.ts` `closePool` or in `migrate.ts` ROLLBACK — add targeted tests until you cross 85%).

- [ ] **Step 7: Tear down local Docker (optional)**

```bash
docker rm -f ss-pg ss-redis
```

- [ ] **Step 8: Final repo-wide check**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS across the whole monorepo. (The repo-wide `pnpm test` runs without env vars, so the gated suites skip — that is intentional and matches the slice's success criterion.)

- [ ] **Step 9: Commit any coverage-fix changes (if any)**

If Step 6 required additional tests to hit 85%, commit them now:

```bash
git add packages/server-store
git commit -m "test(server-store): close coverage gaps to clear 85% threshold"
```

If no fixes were needed, this step is a no-op — proceed to the wrap-up.

---

## Wrap-up checklist (read after running Task 14)

After the final verification passes, the slice is complete when:

- [ ] `pnpm typecheck` passes across every workspace.
- [ ] `pnpm lint` is clean.
- [ ] `pnpm --filter @aesmsg/server-store test` passes **without** `TEST_DATABASE_URL` / `TEST_REDIS_URL` (gated suites skip).
- [ ] Setting both env vars makes the gated suites run and they pass against a real Postgres + Redis.
- [ ] `pnpm --filter @aesmsg/server-store test:coverage` (with env vars) reports ≥85% lines on `src/`.
- [ ] The migration runner is idempotent (verified by Task 8's second test case).
- [ ] `packages/server-store/README.md` documents interfaces, env vars, and the local Docker recipe.
- [ ] `docs/superpowers/specs/2026-05-09-project-init-design.md` §7 has the cross-reference paragraph.
- [ ] All commits in this slice use the `feat(server-store)` / `docs(server-store)` / `test(server-store)` conventional-commit style.

Slice 5 (sender flow: `/create` page + `POST /api/messages` + storage of ciphertext) is the next planned slice — separate brainstorm/spec/plan/exec cycle.
