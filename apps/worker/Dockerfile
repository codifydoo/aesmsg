# syntax=docker/dockerfile:1

# aesmsg worker (headless expiry sweeper). Runs TypeScript directly via tsx — there
# is no compile step; @aesmsg/server-store is consumed as raw TS (its package
# "exports" point at ./src). Built from the REPO ROOT (Sproobo:
# --dockerfile apps/worker/Dockerfile), the same as apps/api, so it shares the root
# .dockerignore. This service exposes NO ports and needs NO Redis; it periodically
# calls expirePastDue() to physically purge expired/revoked ciphertext. Immediate
# purge on last open now happens in the API path (BE-6); this sweep is the backstop.
FROM node:22-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Copy the whole workspace (see .dockerignore for what is pruned). The lockfile
# plus every package.json must be present so a --frozen-lockfile install can
# validate the workspace graph, even though we only install one project below.
COPY . .

# Install only @aesmsg/worker and its dependency graph (this pulls in
# @aesmsg/server-store with pg, and tsx for the runtime). api, web and mobile — and
# their heavy native toolchains (ioredis, expo, next) — are intentionally excluded.
RUN pnpm install --frozen-lockfile --filter @aesmsg/worker...

# Make the entrypoint executable (the source file carries no exec bit through the build context).
RUN chmod +x /app/apps/worker/docker-entrypoint.sh

ENV NODE_ENV=production

# BE-9: drop root. node:22-slim ships a non-root `node` user (uid 1000). The worker is stateless (it
# writes nothing to the image filesystem) and the copied workspace is world-readable, so it runs fine
# unprivileged. Set before the entrypoint so PID 1 runs as `node`.
USER node

# BE-9: no HEALTHCHECK by design. The worker exposes no port and has no natural liveness endpoint —
# it wakes on a timer to run expirePastDue(). There is no cheap, honest probe (a synthetic sweep
# would touch the DB and muddy metrics; a heartbeat file would need extra state). Liveness is instead
# the process staying up: index.ts exits non-zero on a fatal (missing DATABASE_URL / bad pool), and
# the orchestrator restarts a crashed/exited container. If a probe is wanted later, add a heartbeat
# file the scheduler touches each tick and stat its mtime here.

# BE-8: entrypoint script runs the migration then `exec`s Node, so Node inherits PID 1 and receives
# SIGTERM directly (no `sh -c`, no pnpm/tsx grandchild). See docker-entrypoint.sh.
ENTRYPOINT ["/app/apps/worker/docker-entrypoint.sh"]
