import type { FastifyInstance } from "fastify";

// Liveness smoke route for the deploy platform / load balancer. Deliberately store-free: it proves
// the process is up without touching Postgres/Redis, consuming opens, or emitting any metadata.
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/api/health", (_req, reply) => {
    reply.send({ status: "ok" });
  });
}
