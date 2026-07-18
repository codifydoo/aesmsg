<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What `apps/web` is

`apps/web` is a **static, presentational Next.js 16 site**. It has no API routes, no crypto, and no identity/key handling. It renders two things and nothing more:

- **Marketing landing at `/`** — `src/landing/LandingPage.tsx`, rendered by `app/page.tsx`. Static product page; promotes the native app and links to the app stores (`src/landing/app-store-links.ts`).
- **Deep-link bouncer at `/l/[id]`** — `src/bouncer/`, rendered by `app/l/[id]/page.tsx`. When someone opens a secure link in a browser, this page hands off to the installed native app via the `aesmsg://l/<id>` custom scheme and otherwise promotes the app + store downloads. It makes **no network calls**, never fetches ciphertext, and never decrypts anything.

The bouncer validates the id shape locally — `src/bouncer/deep-link.ts` keeps its own `LINK_ID_REGEX` (a 12-byte base64url id is exactly 16 chars of `[A-Za-z0-9_-]`) so a malformed id falls back to the generic "open in app" message instead of building a misleading deep link. `BouncerScreen` also best-effort assigns `window.location.href = aesmsg://…` on mount for a valid id; this only navigates the custom scheme, it does not touch the network.

## Where the rest of the product lives

- **The message API moved to `apps/api`** — a standalone Fastify service hosting `/api/messages/*` over `@aesmsg/server-store`. `apps/web` does not proxy or call it; the **native apps** are its clients.
- **All crypto, identity, and key handling live in the native apps and `@aesmsg/crypto`.** `apps/web` holds none of it. Do not reintroduce identity context, key stores, IndexedDB client stores, or API routes here — they were intentionally removed when the web app became presentational.

## Dynamic route segments

App Router dynamic segments use `[id]`-style folder names — e.g. `app/l/[id]/page.tsx`. In Next.js 16, the `params` prop is **`Promise<{ id: string }>`** (not the synchronous `{ id: string }` from older versions). Always `await params` in async page components; `app/l/[id]/page.tsx` already does this.

## Import extension convention

Static `import` statements in `apps/web/` use **no extension** for relative paths and `@/` aliases — write `from "./Foo"` and `from "@/src/bouncer/deep-link"`, not `from "./Foo.js"`. Turbopack's path-alias resolver does not map `.js` to `.ts` or `.tsx`, even with `moduleResolution: "Bundler"` and `transpilePackages` set. Vitest, `tsc`, and Biome all accept either form, but the dev-server bundler is the strict one. All such extensions were stripped in commit `66177bb` (2026-05-10).

`vi.mock()` and dynamic `await import()` paths in tests may keep `.js` (Vitest resolves both forms against the on-disk `.ts`/`.tsx`), but new code should prefer the no-extension form. Plan and spec documents authored before `66177bb` show `.js` on static imports — do not copy them verbatim.

The same convention applies to `packages/*/src/`. (See commit `8b8ff6f` for the original strip across workspace packages.)

## Tests

Tests run under Vitest **browser mode** (Chromium headless via Playwright) — see `vitest.config.ts`. `tests/setup.ts` wires `@testing-library/jest-dom` and runs `cleanup()` after each case. Current coverage is the bouncer: the pure `deep-link` helper (`tests/bouncer/deep-link.test.ts`) and a `BouncerScreen` render test (`tests/bouncer/BouncerScreen.test.tsx`).
