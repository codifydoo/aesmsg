import type { CiphertextStore, LinkMetadataStore, RateLimitStore } from "@aesmsg/server-store";
import {
  MemoryCiphertextStore,
  MemoryLinkMetadataStore,
  MemoryRateLimitStore,
  PgCiphertextStore,
  PgLinkMetadataStore,
  RedisRateLimitStore,
} from "@aesmsg/server-store";
import { metrics } from "../metrics/registry";
import { shouldUseDbStores } from "./store-backend";

export interface Stores {
  links: LinkMetadataStore;
  ciphertexts: CiphertextStore;
  rateLimit: RateLimitStore;
}

declare global {
  // eslint-disable-next-line no-var
  var __aesmsg_stores: Stores | undefined;
}

function buildStores(): Stores {
  if (shouldUseDbStores(process.env)) {
    // On Postgres+Redis: the memory-fallback alert signal is 0 (R1 not tripped).
    metrics.set("aesmsg_store_memory_fallback", 0);
    return {
      links: new PgLinkMetadataStore(),
      ciphertexts: new PgCiphertextStore(),
      rateLimit: new RedisRateLimitStore(),
    };
  }

  // R1 OBSERVABILITY (feeds the store-fallback alert): we are about to run every store in process
  // memory — fine in dev, but in production this loses every link on restart and split-brains across
  // replicas. Boot fails closed in prod (assertProductionConfig), but if it is EVER reached, this
  // gauge is the runtime signal the operator alerts on (`aesmsg_store_memory_fallback == 1`).
  metrics.set("aesmsg_store_memory_fallback", 1);

  // Share the ciphertext store with the metadata store so revoke() can purge the blob immediately
  // (the Pg path does this within one transaction; in memory the metadata store needs the
  // reference). Without this wiring, revoke would flip status but leave the ciphertext at rest.
  const ciphertexts = new MemoryCiphertextStore();
  return {
    links: new MemoryLinkMetadataStore(ciphertexts),
    ciphertexts,
    rateLimit: new MemoryRateLimitStore(),
  };
}

export function getStores(): Stores {
  if (!globalThis.__aesmsg_stores) {
    globalThis.__aesmsg_stores = buildStores();
  }
  return globalThis.__aesmsg_stores;
}
