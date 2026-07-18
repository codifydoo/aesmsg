import type { FastifyInstance } from "fastify";
import { runHandler } from "../fastify-adapter";
import {
  createGetMessageHandler,
  createListMessagesHandler,
  createMessagesHandler,
  createOpenMessageHandler,
  createRevokeMessageHandler,
} from "../handlers/messages-handler";
import { getStores } from "../stores/stores";

// /open and /revoke carry NO request body (BE-2 / R3). A small per-route bodyLimit makes Fastify
// reject an oversized payload at the edge — before buffering up to the global 38 MiB — as
// defense-in-depth behind each handler's own empty-body check. Comfortably above any legitimate
// (empty) body; the revocation token (BE-1) rides a request HEADER, not the body, so this stays valid.
const NO_BODY_ROUTE_BYTES = 1024;

export function registerMessageRoutes(
  app: FastifyInstance,
  publicLinkOrigin: string,
  maxRetentionMs: number,
): void {
  const stores = getStores();
  const now = () => new Date();

  const create = createMessagesHandler({ ...stores, now, publicLinkOrigin, maxRetentionMs });
  const get = createGetMessageHandler({ links: stores.links, rateLimit: stores.rateLimit, now });
  const open = createOpenMessageHandler(stores);
  const list = createListMessagesHandler({ links: stores.links, rateLimit: stores.rateLimit, now });
  const revoke = createRevokeMessageHandler({ links: stores.links, rateLimit: stores.rateLimit });

  app.post("/api/messages", (req, reply) => runHandler(create, req, reply));
  app.post("/api/messages/list", (req, reply) => runHandler(list, req, reply));
  app.get("/api/messages/:id", (req, reply) =>
    runHandler(get, req, reply, req.params as { id: string }),
  );
  app.post("/api/messages/:id/open", { bodyLimit: NO_BODY_ROUTE_BYTES }, (req, reply) =>
    runHandler(open, req, reply, req.params as { id: string }),
  );
  app.post("/api/messages/:id/revoke", { bodyLimit: NO_BODY_ROUTE_BYTES }, (req, reply) =>
    runHandler(revoke, req, reply, req.params as { id: string }),
  );
}
