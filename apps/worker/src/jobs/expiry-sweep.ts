import type { LinkMetadataStore } from "@aesmsg/server-store";
import type { Job } from "../scheduler";

// Depends only on the LinkMetadataStore INTERFACE (not the Pg class) so it is testable with a fake
// and carries no knowledge of Postgres. The Pg wiring happens in index.ts.
export function createExpirySweepJob(opts: {
  links: LinkMetadataStore;
  intervalMs: number;
  runOnStart?: boolean;
}): Job {
  return {
    name: "expiry-sweep",
    intervalMs: opts.intervalMs,
    ...(opts.runOnStart !== undefined ? { runOnStart: opts.runOnStart } : {}),
    async run() {
      const purged = await opts.links.expirePastDue();
      return { detail: { purged } };
    },
  };
}
