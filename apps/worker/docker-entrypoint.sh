#!/bin/sh
# Container entrypoint for the aesmsg worker (BE-8 signal fix).
#
# The Phase-1 Dockerfile used `CMD ["sh", "-c", "migrate && start"]`, leaving `sh` as PID 1, which
# does NOT forward SIGTERM — so a redeploy hard-killed the sweeper (possibly mid-purge) and never
# closed the pg pool. This script runs the (idempotent) migration as a child, then `exec`s Node so
# Node inherits PID 1 and receives SIGTERM directly, letting index.ts stop the scheduler (draining
# any in-flight sweep) and close the pool before exit.
#
# Node runs as `node --import tsx` (a SINGLE process), not via the `tsx` CLI or `pnpm`, so nothing
# spawns Node as a grandchild that would miss the signal.
set -eu

# Resolve to this script's directory (=/app/apps/worker) for tsx resolution + the relative
# server-store path, matching the Phase-1 invocation.
cd "$(dirname "$0")"

# Apply pending DB migrations (idempotent, advisory-locked — safe to run alongside the API's own
# migrate on boot). Needs DATABASE_URL (injected by Sproobo).
node --import tsx ../../packages/server-store/src/migrate.ts

# Hand off to the worker. `exec` => Node becomes PID 1 and is the direct target of SIGTERM.
exec node --import tsx src/index.ts
