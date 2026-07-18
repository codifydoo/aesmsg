import type { LinkMetadataStore } from "@aesmsg/server-store";
import { describe, expect, it, vi } from "vitest";
import { createExpirySweepJob } from "../../src/jobs/expiry-sweep";

// Minimal fake store: only expirePastDue matters here; the rest throw if unexpectedly called.
function fakeLinks(purged: number): LinkMetadataStore {
  return {
    expirePastDue: vi.fn().mockResolvedValue(purged),
    create: vi.fn(),
    get: vi.fn(),
    incrementOpens: vi.fn(),
    revoke: vi.fn(),
  } as unknown as LinkMetadataStore;
}

describe("createExpirySweepJob", () => {
  it("builds a job named expiry-sweep carrying the configured interval and runOnStart", () => {
    const job = createExpirySweepJob({ links: fakeLinks(0), intervalMs: 60_000, runOnStart: true });
    expect(job.name).toBe("expiry-sweep");
    expect(job.intervalMs).toBe(60_000);
    expect(job.runOnStart).toBe(true);
  });

  it("run() invokes expirePastDue once and reports the purge count", async () => {
    const links = fakeLinks(3);
    const job = createExpirySweepJob({ links, intervalMs: 60_000 });

    const result = await job.run();

    expect(links.expirePastDue).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ detail: { purged: 3 } });
  });
});
