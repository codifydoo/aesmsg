#!/bin/sh
# Container entrypoint for the aesmsg API (BE-8 signal fix).
#
# The Phase-1 Dockerfile used `CMD ["sh", "-c", "migrate && start"]`, which leaves `sh` as PID 1.
# `sh -c` does NOT forward SIGTERM to its children, so every redeploy hard-killed in-flight
# uploads/opens and never closed pools. This script instead runs the (idempotent) migration as a
# normal child, then `exec`s Node — `exec` REPLACES this shell process, so Node inherits PID 1 and
# receives SIGTERM directly, letting index.ts run its graceful-shutdown handler (drain + close pools).
#
# Node is invoked as `node --import tsx` (a SINGLE process) rather than via the `tsx` CLI or `pnpm`,
# both of which spawn Node as a grandchild that would not be PID 1's signal target.
set -eu

# Resolve to this script's directory (=/app/apps/api) so `--import tsx` picks up apps/api's tsx and
# the relative server-store path matches the Phase-1 invocation.
cd "$(dirname "$0")"

# Apply pending DB migrations (idempotent, advisory-locked — safe under blue-green where two
# containers may start at once). Needs DATABASE_URL (injected by Sproobo).
node --import tsx ../../packages/server-store/src/migrate.ts

# Hand off to the API. `exec` => Node becomes PID 1 and is the direct target of SIGTERM.
exec node --import tsx src/index.ts
