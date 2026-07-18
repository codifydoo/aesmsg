import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { CiphertextStore, LinkMetadataStore } from "../src/interfaces.js";
import type { LinkId, LinkMetadata } from "../src/types.js";

// SHA-256 hex of a token — mirrors what the API handler stores/compares (only the hash reaches the
// store; the raw token never does).
function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * A store whose ciphertext write inside createWithCiphertext is rigged to FAIL, plus readers over the
 * same backend, so the suite can prove the create rolled BOTH rows back (BE-5 / R22). Backend
 * fault-injection lives in each concrete setup (memory: a throwing CiphertextStore; pg: a Pool whose
 * client throws on the ciphertext INSERT).
 */
export interface RollbackProbe {
  store: LinkMetadataStore;
  getLink(id: LinkId): Promise<LinkMetadata | null>;
  getCiphertext(id: LinkId): Promise<Uint8Array | null>;
}

export interface LinkMetadataSuiteContext {
  store: LinkMetadataStore;
  /**
   * The ciphertext store backing `store`, so the suite can seed blobs and assert that
   * expirePastDue() / revoke() physically purge them. Same backend as `store` (in-memory map
   * for the memory store, the same Pg pool for the Pg store).
   */
  ciphertexts: CiphertextStore;
  /** Builds a {@link RollbackProbe} for the atomic-create rollback test. */
  makeRollbackProbe: () => Promise<RollbackProbe> | RollbackProbe;
}

export function runLinkMetadataSuite(
  setup: () => Promise<LinkMetadataSuiteContext> | LinkMetadataSuiteContext,
): void {
  let ctx: LinkMetadataSuiteContext;

  beforeEach(async () => {
    ctx = await setup();
  });

  describe("create + get", () => {
    it("round-trips fields and seeds status='active', opensCount=0, createdAt=null (v2)", async () => {
      const id = "link-rt" as LinkId;
      const expiresAt = new Date(Date.now() + 60_000);
      const created = await ctx.store.create({
        id,
        expiresAt,
        maxOpens: 1,
      });
      expect(created.id).toBe(id);
      expect(created.status).toBe("active");
      expect(created.opensCount).toBe(0);
      expect(created.maxOpens).toBe(1);
      expect(created.expiresAt.getTime()).toBe(expiresAt.getTime());
      // v2 links never persist a creation timestamp.
      expect(created.createdAt).toBeNull();

      const fetched = await ctx.store.get(id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(id);
      expect(fetched?.status).toBe("active");
      expect(fetched?.createdAt).toBeNull();
    });

    it("get returns null for unknown id", async () => {
      const fetched = await ctx.store.get("does-not-exist" as LinkId);
      expect(fetched).toBeNull();
    });

    it("create with a duplicate id rejects", async () => {
      const id = "link-dup" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      await expect(
        ctx.store.create({
          id,
          expiresAt: new Date(Date.now() + 60_000),
          maxOpens: -1,
        }),
      ).rejects.toThrow();
    });
  });

  describe("createWithCiphertext — atomic create (BE-5 / R22)", () => {
    it("writes BOTH the link row and the ciphertext atomically", async () => {
      const id = "link-atomic-ok" as LinkId;
      const created = await ctx.store.createWithCiphertext(
        { id, expiresAt: new Date(Date.now() + 60_000), maxOpens: 1 },
        new Uint8Array([9, 8, 7]),
      );
      expect(created.status).toBe("active");
      expect(created.opensCount).toBe(0);

      expect((await ctx.store.get(id))?.status).toBe("active");
      expect(Array.from((await ctx.ciphertexts.get(id)) ?? [])).toEqual([9, 8, 7]);
    });

    it("rolls BOTH rows back when the ciphertext write fails — no orphan link, no burned id", async () => {
      const probe = await ctx.makeRollbackProbe();
      const id = "link-atomic-rollback" as LinkId;

      await expect(
        probe.store.createWithCiphertext(
          { id, expiresAt: new Date(Date.now() + 60_000), maxOpens: 1 },
          new Uint8Array([1, 2, 3]),
        ),
      ).rejects.toThrow();

      // The transaction rolled back: neither the metadata row nor the blob persists, so the id is not
      // burned (409 forever) and no live-but-empty link can consume an open.
      expect(await probe.getLink(id)).toBeNull();
      expect(await probe.getCiphertext(id)).toBeNull();
    });

    it("rejects a duplicate id and leaves the existing row untouched", async () => {
      const id = "link-atomic-dup" as LinkId;
      await ctx.store.createWithCiphertext(
        { id, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 },
        new Uint8Array([5, 5, 5]),
      );
      await expect(
        ctx.store.createWithCiphertext(
          { id, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 },
          new Uint8Array([6, 6, 6]),
        ),
      ).rejects.toThrow();
      // The original blob is intact — the failed duplicate did not overwrite it.
      expect(Array.from((await ctx.ciphertexts.get(id)) ?? [])).toEqual([5, 5, 5]);
    });
  });

  describe("revoke", () => {
    it("marks status='revoked'", async () => {
      const id = "link-rev" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      await ctx.store.revoke(id);
      const fetched = await ctx.store.get(id);
      expect(fetched?.status).toBe("revoked");
    });

    it("revoke on missing id is a no-op (no throw)", async () => {
      await expect(ctx.store.revoke("missing" as LinkId)).resolves.toBeUndefined();
    });

    it("legacy (un-tokened) row revokes without a token — createdAt-NULL rows keep working", async () => {
      // Rows created without a revocationTokenHash mirror pre-BE-1 legacy links; an un-tokened
      // revoke must still work for them so existing senders keep the ability to revoke.
      const id = "link-legacy-rev" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      await ctx.ciphertexts.put(id, new Uint8Array([9, 9, 9]));
      await ctx.store.revoke(id); // no token supplied
      expect((await ctx.store.get(id))?.status).toBe("revoked");
      expect(await ctx.ciphertexts.get(id)).toBeNull();
    });
  });

  describe("revoke — authenticated (BE-1 / R2)", () => {
    const TOKEN = "s3cret-revocation-token-abc123";

    it("revokes + purges a tokened row when the matching token hash is supplied", async () => {
      const id = "link-tok-match" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        revocationTokenHash: hashToken(TOKEN),
      });
      await ctx.ciphertexts.put(id, new Uint8Array([1, 2, 3]));

      await ctx.store.revoke(id, hashToken(TOKEN));

      expect((await ctx.store.get(id))?.status).toBe("revoked");
      expect(await ctx.ciphertexts.get(id)).toBeNull();
    });

    it("does NOT revoke a tokened row when the WRONG token hash is supplied (silent no-op)", async () => {
      const id = "link-tok-wrong" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        revocationTokenHash: hashToken(TOKEN),
      });
      await ctx.ciphertexts.put(id, new Uint8Array([4, 5, 6]));

      await ctx.store.revoke(id, hashToken("a-different-token"));

      // The link stays active and its ciphertext is intact — a third party cannot revoke.
      expect((await ctx.store.get(id))?.status).toBe("active");
      expect(Array.from((await ctx.ciphertexts.get(id)) ?? [])).toEqual([4, 5, 6]);
    });

    it("does NOT revoke a tokened row when NO token is supplied (silent no-op)", async () => {
      const id = "link-tok-missing" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        revocationTokenHash: hashToken(TOKEN),
      });
      await ctx.ciphertexts.put(id, new Uint8Array([7, 8, 9]));

      await ctx.store.revoke(id); // no token — un-tokened caller against a tokened row

      expect((await ctx.store.get(id))?.status).toBe("active");
      expect(Array.from((await ctx.ciphertexts.get(id)) ?? [])).toEqual([7, 8, 9]);
    });

    it("a supplied token is ignored on an already-revoked row (idempotent no-op)", async () => {
      const id = "link-tok-idem" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
        revocationTokenHash: hashToken(TOKEN),
      });
      await ctx.store.revoke(id, hashToken(TOKEN));
      // Second revoke with the correct token stays a no-op 200-equivalent (already terminal).
      await expect(ctx.store.revoke(id, hashToken(TOKEN))).resolves.toBeUndefined();
      expect((await ctx.store.get(id))?.status).toBe("revoked");
    });
  });

  describe("incrementOpens", () => {
    it("increments opensCount and flips to 'expired' when hitting maxOpens", async () => {
      const id = "link-cap" as LinkId;
      await ctx.store.create({
        id,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 2,
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
      });
      expect(await ctx.store.incrementOpens(id)).toBeNull();
    });

    describe("purge on last open (BE-6 / R17)", () => {
      it("purges the ciphertext the instant the LAST allowed open is consumed", async () => {
        const id = "link-open-purge-1" as LinkId;
        await ctx.store.create({
          id,
          expiresAt: new Date(Date.now() + 60_000),
          maxOpens: 1,
        });
        await ctx.ciphertexts.put(id, new Uint8Array([1, 2, 3]));

        const opened = await ctx.store.incrementOpens(id);
        expect(opened?.status).toBe("expired");
        expect(opened?.opensCount).toBe(1);
        // The single (final) open exhausted the link and purged its blob in the same transition —
        // no snapshot-recoverable window before the sweep.
        expect(await ctx.ciphertexts.get(id)).toBeNull();
      });

      it("leaves ciphertext intact on a non-final open and purges it only on the final one", async () => {
        const id = "link-open-purge-2" as LinkId;
        await ctx.store.create({
          id,
          expiresAt: new Date(Date.now() + 60_000),
          maxOpens: 2,
        });
        await ctx.ciphertexts.put(id, new Uint8Array([4, 5, 6]));

        const first = await ctx.store.incrementOpens(id);
        expect(first?.status).toBe("active");
        // A non-final open must NOT purge — the message is still openable.
        expect(Array.from((await ctx.ciphertexts.get(id)) ?? [])).toEqual([4, 5, 6]);

        const second = await ctx.store.incrementOpens(id);
        expect(second?.status).toBe("expired");
        // The final open exhausts the link and purges the blob.
        expect(await ctx.ciphertexts.get(id)).toBeNull();
      });

      it("never purges ciphertext for an unlimited-opens link (max_opens = -1)", async () => {
        const id = "link-open-purge-unlim" as LinkId;
        await ctx.store.create({
          id,
          expiresAt: new Date(Date.now() + 60_000),
          maxOpens: -1,
        });
        await ctx.ciphertexts.put(id, new Uint8Array([7, 8, 9]));

        for (let i = 1; i <= 4; i++) {
          const r = await ctx.store.incrementOpens(id);
          expect(r?.status).toBe("active");
        }
        // Unlimited links never flip to terminal on open, so their blob survives here; it is only
        // reclaimed by expiry or revoke.
        expect(Array.from((await ctx.ciphertexts.get(id)) ?? [])).toEqual([7, 8, 9]);
      });

      it("an exhausted link stays opaque: further opens return null and get still returns the expired row", async () => {
        const id = "link-open-purge-opaque" as LinkId;
        await ctx.store.create({
          id,
          expiresAt: new Date(Date.now() + 60_000),
          maxOpens: 1,
        });
        await ctx.ciphertexts.put(id, new Uint8Array([1, 1, 1]));

        await ctx.store.incrementOpens(id); // exhausts the link and purges the blob

        // A subsequent open is an opaque no-op (→ 410 at the API); get() still returns the row as
        // 'expired' (→ 404 at the API). Purging the blob changed neither.
        expect(await ctx.store.incrementOpens(id)).toBeNull();
        expect((await ctx.store.get(id))?.status).toBe("expired");
        expect(await ctx.ciphertexts.get(id)).toBeNull();
      });
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
      });
      await ctx.store.create({
        id: future,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      // No ciphertext was ever stored for these links, so nothing is purged (both backends count
      // only blobs that actually existed: Pg via DELETE rowCount, memory via a presence check).
      const purged = await ctx.store.expirePastDue();
      expect(purged).toBe(0);

      const pastRow = await ctx.store.get(past);
      expect(pastRow?.status).toBe("expired");
      const futureRow = await ctx.store.get(future);
      expect(futureRow?.status).toBe("active");
    });

    it("purges ciphertext for newly-expired rows and returns the count purged", async () => {
      const past = "link-exp-ct-past" as LinkId;
      const future = "link-exp-ct-future" as LinkId;
      await ctx.store.create({
        id: past,
        expiresAt: new Date(Date.now() - 1000),
        maxOpens: -1,
      });
      await ctx.store.create({
        id: future,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      await ctx.ciphertexts.put(past, new Uint8Array([1, 2, 3]));
      await ctx.ciphertexts.put(future, new Uint8Array([4, 5, 6]));

      // Exactly one link is past due, so exactly one ciphertext is purged.
      const purged = await ctx.store.expirePastDue();
      expect(purged).toBe(1);

      // The expired link's ciphertext is physically gone; the still-active link's blob is intact.
      expect(await ctx.ciphertexts.get(past)).toBeNull();
      expect(Array.from((await ctx.ciphertexts.get(future)) ?? [])).toEqual([4, 5, 6]);
    });

    it("a maxOpens-exhausted link is purged on the open itself, leaving the sweep only a backstop", async () => {
      // A link can reach a terminal state without ever being past its expiry: hitting maxOpens flips
      // it to 'expired' inside incrementOpens. Post BE-6 / R17 that consuming open ALSO purges the
      // blob in the same transition, so a DB snapshot taken before the next sweep can't recover the
      // exhausted secret. The sweep is now only a backstop and must no-op gracefully on the
      // already-purged terminal row (no double-count).
      const capped = "link-maxopens-orphan" as LinkId;
      await ctx.store.create({
        id: capped,
        // Expiry is in the FUTURE, so the time-based sweep never touches this row; it became
        // terminal purely by exhausting its single allowed open.
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 1,
      });
      await ctx.ciphertexts.put(capped, new Uint8Array([7, 8, 9]));

      const opened = await ctx.store.incrementOpens(capped);
      expect(opened?.status).toBe("expired");
      // The consuming open purged the blob immediately — no wait for the sweep.
      expect(await ctx.ciphertexts.get(capped)).toBeNull();

      // The sweep finds nothing left for this row (blob already gone), so it reclaims 0 and must not
      // re-count it — Pg's DELETE rowCount is 0; memory's presence check skips the missing blob.
      const purged = await ctx.store.expirePastDue();
      expect(purged).toBe(0);
      expect(await ctx.ciphertexts.get(capped)).toBeNull();
    });

    it("does not change rows already revoked or expired", async () => {
      const revoked = "link-rev3" as LinkId;
      await ctx.store.create({
        id: revoked,
        expiresAt: new Date(Date.now() - 1000),
        maxOpens: -1,
      });
      await ctx.ciphertexts.put(revoked, new Uint8Array([1, 2, 3]));
      // revoke() already purged this link's ciphertext, so the sweep finds nothing to delete for
      // it and must not re-count the row — matching Pg's DELETE rowCount, which only counts blobs
      // that actually existed.
      await ctx.store.revoke(revoked);
      const purged = await ctx.store.expirePastDue();
      expect(purged).toBe(0);
      const row = await ctx.store.get(revoked);
      expect(row?.status).toBe("revoked");
    });
  });

  describe("pruneTerminal — bounded terminal-row retention (BE-7 / R18)", () => {
    it("deletes terminal rows older than the cutoff, keeps recent terminal + live rows", async () => {
      const live = "link-prune-live" as LinkId;
      const revoked = "link-prune-revoked" as LinkId;
      await ctx.store.create({ id: live, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 });
      await ctx.store.create({
        id: revoked,
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: -1,
      });
      // `revoked` becomes terminal ~now; `live` stays active (terminal_at NULL).
      await ctx.store.revoke(revoked);

      // Cutoff in the PAST: the just-revoked row is NOT older than it, and the live row is not
      // terminal — so nothing is pruned.
      const prunedNone = await ctx.store.pruneTerminal(new Date(Date.now() - 60_000));
      expect(prunedNone).toBe(0);
      expect((await ctx.store.get(revoked))?.status).toBe("revoked");
      expect((await ctx.store.get(live))?.status).toBe("active");

      // Cutoff in the FUTURE: the terminal row is now older than it and is pruned; the live row is
      // never eligible (not terminal) and survives, and the id becomes free again (get → null).
      const prunedOne = await ctx.store.pruneTerminal(new Date(Date.now() + 60_000));
      expect(prunedOne).toBe(1);
      expect(await ctx.store.get(revoked)).toBeNull();
      expect((await ctx.store.get(live))?.status).toBe("active");
    });

    it("prunes an expired (time-terminal) row and cascades away any lingering ciphertext", async () => {
      const past = "link-prune-expired" as LinkId;
      await ctx.store.create({ id: past, expiresAt: new Date(Date.now() - 1000), maxOpens: -1 });
      await ctx.ciphertexts.put(past, new Uint8Array([1, 2, 3]));
      // Mark it terminal (stamps terminal_at) and purge its ciphertext.
      await ctx.store.expirePastDue();
      expect((await ctx.store.get(past))?.status).toBe("expired");

      const pruned = await ctx.store.pruneTerminal(new Date(Date.now() + 60_000));
      expect(pruned).toBe(1);
      expect(await ctx.store.get(past)).toBeNull();
      expect(await ctx.ciphertexts.get(past)).toBeNull();
    });

    it("leaves active rows alone no matter how far in the future the cutoff is", async () => {
      const live = "link-prune-active-only" as LinkId;
      await ctx.store.create({ id: live, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 });
      const pruned = await ctx.store.pruneTerminal(new Date(Date.now() + 10 * 365 * 24 * 3600_000));
      expect(pruned).toBe(0);
      expect((await ctx.store.get(live))?.status).toBe("active");
    });
  });

  describe("aggregateStats — ops metrics (PG-17 / PG-18 / R25)", () => {
    it("counts active links and sums ciphertext bytes; excludes terminal links from the count", async () => {
      const empty = await ctx.store.aggregateStats();
      expect(empty.activeLinks).toBe(0);
      expect(empty.ciphertextBytes).toBe(0);

      const a = "link-stats-a" as LinkId;
      const b = "link-stats-b" as LinkId;
      await ctx.store.createWithCiphertext(
        { id: a, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 },
        new Uint8Array(40),
      );
      await ctx.store.createWithCiphertext(
        { id: b, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 },
        new Uint8Array(60),
      );
      const both = await ctx.store.aggregateStats();
      expect(both.activeLinks).toBe(2);
      expect(both.ciphertextBytes).toBe(100);

      // Revoking `a` drops it from the active count AND purges its ciphertext bytes.
      await ctx.store.revoke(a);
      const afterRevoke = await ctx.store.aggregateStats();
      expect(afterRevoke.activeLinks).toBe(1);
      expect(afterRevoke.ciphertextBytes).toBe(60);
    });
  });

  describe("adminPurge — operator abuse purge (PG-17 / R25)", () => {
    it("purges an active link's ciphertext and marks it terminal (no token required)", async () => {
      const id = "link-admin-active" as LinkId;
      await ctx.store.createWithCiphertext(
        // A TOKENED row: the operator purge must work WITHOUT the token (unlike user revoke).
        {
          id,
          expiresAt: new Date(Date.now() + 60_000),
          maxOpens: -1,
          revocationTokenHash: hashToken("operator-cannot-know-this"),
        },
        new Uint8Array([1, 2, 3]),
      );

      const result = await ctx.store.adminPurge(id);
      expect(result).toEqual({ found: true, wasActive: true, ciphertextRemoved: true });

      // Row kept but terminal (so opens stay opaque → 410), ciphertext physically gone.
      expect((await ctx.store.get(id))?.status).toBe("revoked");
      expect(await ctx.ciphertexts.get(id)).toBeNull();
    });

    it("is idempotent: a second purge of the same id is a safe no-op", async () => {
      const id = "link-admin-idem" as LinkId;
      await ctx.store.createWithCiphertext(
        { id, expiresAt: new Date(Date.now() + 60_000), maxOpens: -1 },
        new Uint8Array([9, 9, 9]),
      );

      const first = await ctx.store.adminPurge(id);
      expect(first).toEqual({ found: true, wasActive: true, ciphertextRemoved: true });

      const second = await ctx.store.adminPurge(id);
      // Row still exists (terminal) but nothing left to flip or delete.
      expect(second).toEqual({ found: true, wasActive: false, ciphertextRemoved: false });
      expect((await ctx.store.get(id))?.status).toBe("revoked");
      expect(await ctx.ciphertexts.get(id)).toBeNull();
    });

    it("purges a lingering ciphertext on an already-terminal (expired) row", async () => {
      const id = "link-admin-terminal" as LinkId;
      await ctx.store.create({ id, expiresAt: new Date(Date.now() - 1000), maxOpens: -1 });
      // Seed a blob AFTER marking it terminal so the sweep didn't purge it — simulate a stray blob.
      await ctx.store.expirePastDue();
      await ctx.ciphertexts.put(id, new Uint8Array([5, 5]));

      const result = await ctx.store.adminPurge(id);
      expect(result.found).toBe(true);
      expect(result.wasActive).toBe(false);
      expect(result.ciphertextRemoved).toBe(true);
      expect(await ctx.ciphertexts.get(id)).toBeNull();
    });

    it("reports found=false for an unknown id (idempotent no-op)", async () => {
      const result = await ctx.store.adminPurge("link-admin-missing" as LinkId);
      expect(result).toEqual({ found: false, wasActive: false, ciphertextRemoved: false });
    });
  });
}
