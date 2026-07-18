# syntax=docker/dockerfile:1

# aesmsg API (Fastify). Runs TypeScript directly via tsx — there is no compile
# step; @aesmsg/server-store is consumed as raw TS (its package "exports" point
# at ./src). Built from the REPO ROOT (Sproobo: --dockerfile apps/api/Dockerfile).
FROM node:22-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Copy the whole workspace (see .dockerignore for what is pruned). The lockfile
# plus every package.json must be present so a --frozen-lockfile install can
# validate the workspace graph, even though we only install one project below.
COPY . .

# Install only @aesmsg/api and its dependency graph (this pulls in
# @aesmsg/server-store with pg + ioredis, and tsx for the runtime). web, mobile
# and worker — and their heavy native toolchains — are intentionally excluded.
RUN pnpm install --frozen-lockfile --filter @aesmsg/api...

# Make the entrypoint executable (the source file carries no exec bit through the build context).
RUN chmod +x /app/apps/api/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# BE-9: drop root. node:22-slim ships a non-root `node` user (uid 1000). The API is stateless (it
# never writes to the image filesystem) and the workspace copied above is world-readable, so it runs
# fine unprivileged. Set before the entrypoint so PID 1 (and the healthcheck) run as `node`.
USER node

# BE-9: liveness probe. Hits the store-free GET /api/health route (registerHealthRoutes) using Node's
# built-in fetch — no curl/wget needed. A non-2xx or a connection error fails the check. start-period
# gives the migration + boot time before failures count.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# BE-8: entrypoint script runs the migration then `exec`s Node, so Node inherits PID 1 and receives
# SIGTERM directly (no `sh -c`, no pnpm/tsx grandchild swallowing the signal). See docker-entrypoint.sh.
ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
