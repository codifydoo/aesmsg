# syntax=docker/dockerfile:1

# aesmsg web client (app.aesmsg.com). Static Next.js export served by nginx —
# no Node runtime, no env, no database in the shipped image (docs/deploy.md).
# Built from the REPO ROOT (Sproobo: --dockerfile apps/webapp/Dockerfile).
FROM node:22-slim AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Copy the whole workspace (see .dockerignore for what is pruned). The lockfile
# plus every package.json must be present so a --frozen-lockfile install can
# validate the workspace graph, even though we only install one project below.
COPY . .

RUN pnpm install --frozen-lockfile --filter @aesmsg/webapp...

# NEXT_PUBLIC_AESMSG_API_ORIGIN defaults to https://api.aesmsg.com and is baked
# into the CSP connect-src at build time (set it before build only for non-prod).
RUN pnpm --filter @aesmsg/webapp build

FROM nginx:1.27-alpine
COPY apps/webapp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/webapp/out /usr/share/nginx/html
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1 || exit 1
