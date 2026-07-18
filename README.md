# aesmsg

Zero-knowledge encryption layer for the channels you already use.

aesmsg turns sensitive content into a shareable link to ciphertext that you paste into Slack, WhatsApp, email, or any other channel. The channel only ever transports an opaque link — only the intended recipient can decrypt the contents on their device. It is **end-to-end encrypted** with a **zero-knowledge backend**: **private keys stay on your device**, and the server stores only ciphertext + minimal metadata.

This repo contains the design artifacts in [`all_design_screens/`](all_design_screens/) and the implementation.

## Architecture

The product surface is the **native mobile app** (iOS + Android). All cryptography, identity, and key handling live there and in `@aesmsg/crypto` — nothing crypto- or key-related runs on the server or in the browser. The backend is a thin, zero-knowledge pointer store.

There are **three deployables**:

| Deployable | What it is | Backend deps |
|---|---|---|
| **`apps/api`** | Standalone **Fastify** service hosting the message API (`/api/messages/*`) over `@aesmsg/server-store`. The native apps are its only clients. | Postgres, Redis |
| **`apps/worker`** | Headless sweeper that periodically purges expired/revoked ciphertext. No network ports. | Postgres |
| **`apps/web`** | Static **Next.js 16** site: marketing landing at `/`, deep-link bouncer at `/l/[id]`, plus `/docs`, `/privacy`, `/terms`. **No crypto, no database, no API routes** — the bouncer makes zero backend calls. | none |

## Workspaces

| Workspace | Purpose |
|---|---|
| `apps/mobile` | React Native / Expo app — the real product surface: identity, compose/seal, links, contacts + fingerprint verification, secure reader, key export/rotate/wipe, aesmsg Pro. |
| `apps/api` | Fastify message API over `@aesmsg/server-store`. |
| `apps/worker` | Expiry-sweep service. |
| `apps/web` | Static marketing + deep-link bouncer. |
| `packages/crypto` | Trust-critical HPKE seal/open, Argon2id key-wrap, fingerprints, wire/payload formats. No DOM/network/storage. |
| `packages/server-store` | `LinkMetadataStore` / `CiphertextStore` / `RateLimitStore` interfaces with memory, Postgres, and Redis backends, plus the SQL migration runner. |
| `packages/design-tokens` | Single source for design tokens (Tailwind `@theme` CSS + TS exports). |
| `packages/ui` | Shared React component catalogue (consumed by the web app). |

## Working in this repo

- Node 22, pnpm 10. Run `corepack enable`, then the commands below.
- `pnpm install` from the repo root installs all workspaces.
- `pnpm dev` boots the static web app at `http://localhost:3000`.
- `pnpm dev:api` boots the Fastify API (on-memory stores by default) at `http://localhost:4000`.
- `pnpm worker:dev` runs the expiry sweeper.
- `pnpm typecheck` runs TS across all workspaces.
- `pnpm lint` runs Biome.
- `pnpm test` runs Vitest across all workspaces.

The mobile app has its own toolchain — see [`apps/mobile/README.md`](apps/mobile/README.md).

## Backend configuration

The web app needs **no** environment variables. The backend (`apps/api` + `apps/worker`) does — each workspace documents its own vars:

- **API:** `DATABASE_URL`, `REDIS_URL`, `RATE_LIMIT_IP_SALT` (≥ 32 bytes, required in prod), `AESMSG_PUBLIC_LINK_ORIGIN`, `AESMSG_TRUST_PROXY`. See [`apps/api/.env.example`](apps/api/.env.example).
- **Worker:** `DATABASE_URL`. See [`apps/worker/.env.example`](apps/worker/.env.example).

In production the API and worker **fail closed at boot** if their required vars are missing (rather than silently running on in-memory stores or logging raw IPs).

## Database

The `@aesmsg/server-store` package owns the schema. SQL files live in [`packages/server-store/migrations/`](packages/server-store/migrations/) and are applied — once per deploy, before the API and worker start — with:

```bash
DATABASE_URL=postgres://... pnpm migrate
```

Migrations are idempotent and protected by a Postgres advisory lock — re-running and concurrent runs are both safe.

### Local Postgres + Redis (dev)

By default the API runs on in-memory stores (no Docker needed). To exercise the real storage path locally, bring up Postgres + Redis and point the API at them:

```bash
pnpm db:up            # start postgres + redis (waits for healthy, non-default host ports)
pnpm test:integration # run the Pg/Redis store suites against the containers
pnpm api:prod         # migrate + start apps/api in production mode against them
pnpm worker:prod      # migrate + run the sweeper against them
pnpm db:down          # stop (keep data)   ·   pnpm db:reset   # stop + drop the pg volume
```

## Deploying

See [`docs/deploy.md`](docs/deploy.md) for production deploys of all three services via Sproobo, and [`docs/release-checklist.md`](docs/release-checklist.md) for the single ordered deploy-and-release checklist. **Never deploy to Vercel.**

## License

Apache 2.0 — see [LICENSE](LICENSE).
