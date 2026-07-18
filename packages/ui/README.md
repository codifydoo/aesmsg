# @aesmsg/ui

Shared React (DOM) component catalogue for `apps/web`.

> **Web-only.** These are React DOM components. The native app has its own
> React Native kit under `apps/mobile/src/components` and imports nothing from
> here.

## Status

Trimmed to the components `apps/web` actually consumes. The larger dashboard
catalogue (migrated from the web MVP's mockups) was removed when the web app
became a static marketing / deep-link bouncer; git history preserves it.

## Components

| Component | Purpose |
|---|---|
| `Logo` | aesmsg mark / lockup, tone + size props. |
| `MaterialIcon` | Wraps `<span class="material-symbols-outlined">`. |

## Tests

Browser-mode (Vitest browser + Playwright + headless Chromium + React
Testing Library). Run `pnpm --filter @aesmsg/ui test`.

Coverage gate: ≥85% lines on `src/`.

## What does NOT belong here

- App-specific routing logic (lives in `apps/web/app/`).
- Crypto operations (live in `@aesmsg/crypto`, invoked by the native apps — not the web app).
- Network calls (the message API is `apps/api`, called by the native apps; the web app makes no backend calls).
- Storage / key handling (owned by the native apps).
