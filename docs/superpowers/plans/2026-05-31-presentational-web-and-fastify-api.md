# Presentational Web + Standalone Fastify API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the message API out of the Next web app into a standalone Fastify service (`apps/api`), repoint mobile at it, and strip the web app down to a static landing page + a deep-link bouncer — so communication happens only in the native apps.

**Architecture:** Three coordinated phases, each leaving the repo green. (1) Stand up `apps/api` (Fastify) by relocating the existing Web-standard `Request`/`Response` handlers + stores over `@aesmsg/server-store`, adding a thin adapter. (2) Repoint mobile's API base URL. (3) Delete the web dashboard/reader/API and replace with a landing page + a static `/l/[id]` bouncer.

**Tech Stack:** pnpm 10 monorepo, Fastify 5, Vitest (node env), Biome 2, Next.js 16 (web), Expo (mobile), TypeScript strict ESM, `@aesmsg/server-store` (Postgres + Redis).

---

## ⚠️ PRECONDITION — read before starting

This plan **assumes the aesmsg rebrand has already merged** (spec `docs/superpowers/specs/2026-05-31-aesmsg-rebrand-design.md`). **Every name below is post-rebrand:** package scope `@aesmsg/*`, env prefix `AESMSG_*`, URL scheme `aesmsg://`, fingerprint prefix `AM-`, pubkey prefix `amk1:`, the stores global `globalThis.__aesmsg_stores`, **the web workspace package name is literally `web`** (NOT `@aesmsg/web` — the rebrand intentionally kept it bare; use `pnpm --filter web`), the importable package scope is still `@aesmsg/*`, the mobile config keys `AESMSG_HOST` / `AESMSG_API_BASE_URL` / `extra.aesmsgApiBaseUrl`, the landing mockup folder `all_design_screens/landing_page_aesmsg/`.

If `git grep -l "@securesend/"` still returns code/config files, **stop** — the rebrand has not landed and the import specifiers in this plan will not resolve.

Reference spec for this work: `docs/superpowers/specs/2026-05-31-presentational-web-and-fastify-api-design.md`.

---

## ⚠️ RECONCILIATION ADDENDUM (verified against the merged tree on 2026-05-31)

A 6-auditor reconciliation pass ran the plan against the actual post-rebrand tree. **These corrections OVERRIDE the task text below where they conflict.** Phase 1 (Tasks 1–8) verified accurate verbatim (import lines, `MessagesHandlerDeps`, the `new URL(request.url).origin` lines at `messages-handler.ts:137-138`, the test's lines 58/78-84/225) — implement as written. Phase 2/3 corrections:

- **A. Web filter target.** The `apps/web` workspace name is literally `web`. All `pnpm --filter` commands use `--filter web` (already fixed in the task text). The `@aesmsg/*` scope still applies to *imported* packages.
- **B. Baseline is not fully green.** `apps/web/tests/server/{messages-handler,hash-ip}.test.ts` already FAIL on main because the web Vitest runs in **browser mode** (chromium) and they import `node:crypto`. So during Phases 1–2, verify per-workspace (`pnpm --filter @aesmsg/api test`, etc.), NOT the aggregate `pnpm test`. Full `pnpm test` only goes green after Phase 3 deletes `tests/server/`.
- **C. Task 4 edit sequencing.** The literal `const handler = createMessagesHandler({ links, ciphertexts, rateLimit, now: () => FROZEN_NOW });` appears identically at **line 58** and **line 225**. Rewrite line 58 to the multi-line form FIRST (de-duplicates), then edit the remaining single-line occurrence at line 225 (add `publicLinkOrigin: "https://aesmsg.com"`). Declare `const PUBLIC_LINK_ORIGIN = "https://aesmsg.com";` next to `FROZEN_NOW` (line 16).
- **D. Task 9 is test-safe and already decoupled.** No mobile test asserts the config defaults (parse tests are host-agnostic). The plan's Task 9 correctly sets `AESMSG_API_BASE_URL` to a standalone `https://api.aesmsg.com` literal (NOT `https://${AESMSG_HOST}`) and `AESMSG_HOST` to the web/applink host `aesmsg.com` — keep `associatedDomains`/`intentFilters` pointed at `AESMSG_HOST` (the bouncer host), never the API host.
- **E. Task 10 deletion list is INCOMPLETE.** In addition to the 13 listed targets, also `git rm`: `apps/web/src/hooks/use-identity.ts` (then the empty `src/hooks/`), `apps/web/src/lib/authenticated-shell.tsx`, `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/attachment-limits.ts`, `apps/web/src/lib/nav-items.ts`. **Do NOT delete `apps/web/src/home/LandingScreen.tsx`** (Task 13 adapts it) — delete only `src/home/{DashboardScreen,HomeScreen}.tsx` from that dir.
- **F. Task 10 MUST edit (not delete) `apps/web/tests/setup.ts`.** It is the global Vitest `setupFiles` for every test and imports `__deleteContactsDbForTests` (`@/src/lib/contacts-store`), `__deleteSentLinksDbForTests` (`@/src/lib/sent-links-store`), and `__deleteDbForTests` (`@aesmsg/key-store`). Remove all three imports + their `afterEach` calls, leaving only `@testing-library/jest-dom/vitest` + `cleanup()`. If not edited, every surviving test fails to load.
- **G. Task 10 test deletion = 52 files, 2 survivors.** Broaden the grep to also match `hooks/use-identity|authenticated-shell|api-client|attachment-limits|nav-items|@aesmsg/(crypto|key-store)`. Delete whole dirs `tests/{contacts,create,home,links,reader,server,settings,integration}` + `tests/identity-context.test.tsx` + `tests/lib/{api-client,authenticated-shell,contacts-store,nav-items,sent-links-store}.test.*` + the 5 root `tests/*-flow.e2e.test.tsx`. **SURVIVORS:** `tests/lib/base64.test.ts`, `tests/lib/link-id.test.ts`, and `tests/setup.ts` (edited). The new `tests/bouncer/deep-link.test.ts` is added in Task 12.
- **H. Task 13 — ADAPT, don't build from the mockup.** A finished, token-correct, copy-compliant landing already exists at `apps/web/src/home/LandingScreen.tsx` (310 lines, uses `<Logo variant="lockup"/>` + `MaterialIcon` from `@aesmsg/ui`, numeric Tailwind spacing, and already replaced the forbidden "Military-Grade"/"Quantum Ready" copy). Task 13 becomes: `git mv` it to `apps/web/src/landing/LandingPage.tsx`, rename the component `LandingScreen`→`LandingPage`, **drop the `variant: "no_identity"|"locked"` prop** and its conditional CTA labels/locked-hint, **repoint the four `<Link href="/keys">` CTAs** to the get-the-app destinations from `app-store-links.ts`, and drop `"use client"` (it only uses `next/link`, `@aesmsg/ui`, `new Date()` — make it a server component). Do NOT re-port the raw mockup: its `px-lg/py-md/font-body-md` classes are no-ops in this repo's Tailwind v4 setup (named spacing is deliberately omitted for the `--container-*` collision), so a verbatim port ships zero spacing. Create `app/page.tsx` (NEW — there is none today) importing `<LandingPage/>`.
- **I. `app-store-links.ts` is created in Task 12** (its first consumer is `BouncerScreen`), at `apps/web/src/landing/app-store-links.ts`; Task 13 imports the same module.
- **J. Task 15 — KEEP all of `@aesmsg/ui`.** The landing uses `Logo`+`MaterialIcon`; mobile does not consume `@aesmsg/ui`; every component is self-tested. Make NO edits to `packages/ui/src/index.ts` and KEEP the `@aesmsg/ui` dep in `apps/web/package.json`. Task 15 reduces to: remove `@aesmsg/crypto`, `@aesmsg/key-store`, `@aesmsg/server-store` from `apps/web/package.json`; update `apps/web/next.config.ts` `transpilePackages` to `["@aesmsg/ui"]`; `pnpm install`. (The `tests/setup.ts` edit from F is a hard prerequisite for removing `@aesmsg/key-store`.) Keep `@aesmsg/design-tokens` (globals.css imports its theme).
- **K. Task 13 Step 3 / File-Structure verb fix.** `apps/web/app/page.tsx` does NOT exist today — it is **CREATE**, not modify.

---

## File Structure

**Phase 1 — create (`apps/api/`):**

| File | Responsibility |
|---|---|
| `apps/api/package.json` | `@aesmsg/api`; deps Fastify + `@aesmsg/server-store`; dev/typecheck/test scripts |
| `apps/api/tsconfig.json` | extends root base; `lib ES2022`, `types ["node"]` |
| `apps/api/vitest.config.ts` | node-env Vitest, `tests/**/*.test.ts` |
| `apps/api/.env.example` | documents `PORT`, `DATABASE_URL`, `REDIS_URL`, `AESMSG_PUBLIC_LINK_ORIGIN`, `RATE_LIMIT_IP_SALT` |
| `apps/api/src/lib/base64.ts` | relocated pure base64 helpers |
| `apps/api/src/lib/link-id.ts` | relocated `LINK_ID_REGEX` + `generateLinkId` |
| `apps/api/src/lib/hash-ip.ts` | relocated HMAC IP hasher (fail-closed in prod) |
| `apps/api/src/stores/store-backend.ts` | relocated `shouldUseDbStores()` |
| `apps/api/src/stores/stores.ts` | relocated `getStores()` store factory |
| `apps/api/src/handlers/messages-handler.ts` | relocated handler factories + the `publicLinkOrigin` change |
| `apps/api/src/fastify-adapter.ts` | Fastify request → web `Request`; web `Response` → reply |
| `apps/api/src/routes/messages.ts` | registers the 5 routes, wiring handlers via `getStores()` |
| `apps/api/src/server.ts` | `buildServer()` — Fastify instance + body parser + routes (exported for tests) |
| `apps/api/src/index.ts` | bootstrap: build server with logger, `listen()` |
| `apps/api/tests/messages-handler.test.ts` | relocated handler test suite (parity) |
| `apps/api/tests/api.smoke.test.ts` | boot `buildServer()`, exercise each route via `app.inject()` |

**Phase 1 — modify:** root `package.json` (add `dev:api` / `api:prod` scripts).

**Phase 2 — modify:** `apps/mobile/app.config.ts` (host + API base URL defaults + comment).

**Phase 3 — modify/create (`apps/web/`):**

| File | Action |
|---|---|
| `apps/web/app/layout.tsx` | modify — drop `IdentityProvider`, update `metadata` |
| `apps/web/app/page.tsx` | modify — render the new `<LandingPage/>` |
| `apps/web/src/landing/LandingPage.tsx` | create — ported landing (see Task 13) |
| `apps/web/src/landing/app-store-links.ts` | create — store/download URL constants |
| `apps/web/app/l/[id]/page.tsx` | modify — replace reader with the bouncer |
| `apps/web/src/bouncer/BouncerScreen.tsx` | create — "open in app / install" UI (no network) |
| `apps/web/src/bouncer/deep-link.ts` | create — pure `appDeepLink(id)` builder + id validation |
| `apps/web/tests/bouncer/deep-link.test.ts` | create — unit tests for `appDeepLink` |
| `apps/web/public/.well-known/apple-app-site-association` | create — iOS universal links |
| `apps/web/public/.well-known/assetlinks.json` | create — Android app links |

**Phase 3 — delete (`apps/web/`):** `app/(app)/**`, `app/api/**`, `src/server/**`, `src/home/**`, `src/create/**`, `src/links/**`, `src/contacts/**`, `src/keys/**`, `src/settings/**`, `src/reader/**`, `src/lib/identity-context.tsx`, `src/lib/sent-links-store.ts`, `src/lib/contacts-store.ts`, and their dedicated test suites. Trim `@aesmsg/web` deps (`@aesmsg/crypto`, `@aesmsg/key-store`, `@aesmsg/server-store`). Trim `@aesmsg/ui` dashboard-only components (Task 15).

---

# PHASE 1 — Stand up `apps/api` (Fastify)

`apps/web` stays fully functional throughout Phase 1; we **copy** logic into `apps/api` and only delete the web copies in Phase 3.

### Task 1: Scaffold the `apps/api` package

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "@aesmsg/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts"
  },
  "dependencies": {
    "@aesmsg/server-store": "workspace:*",
    "fastify": "^5.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`** (mirrors `packages/server-store/tsconfig.json` — `lib ES2022` + `types ["node"]`; this drops `DOM`, and `@types/node` provides the global `Request`/`Response`/`Headers`/`fetch`/`atob`/`btoa`/`crypto` types the handlers rely on)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Install dependencies (resolves the exact Fastify 5.x patch into the lockfile)**

Run: `pnpm install`
Expected: completes; `apps/api` appears as a workspace; `fastify` resolves to a `5.x` version.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(api): scaffold @aesmsg/api Fastify workspace"
```

---

### Task 2: Relocate the shared libs + stores into `apps/api`

These files are byte-identical to their `apps/web` counterparts except for import-specifier rewrites. **Copy** them (the web copies stay until Phase 3).

**Files:**
- Create: `apps/api/src/lib/base64.ts` (from `apps/web/src/lib/base64.ts`)
- Create: `apps/api/src/lib/link-id.ts` (from `apps/web/src/lib/link-id.ts`)
- Create: `apps/api/src/lib/hash-ip.ts` (from `apps/web/src/server/hash-ip.ts`)
- Create: `apps/api/src/stores/store-backend.ts` (from `apps/web/src/server/store-backend.ts`)
- Create: `apps/api/src/stores/stores.ts` (from `apps/web/src/server/stores.ts`)

- [ ] **Step 1: Copy the five files to the new paths**

```bash
mkdir -p apps/api/src/lib apps/api/src/stores
cp apps/web/src/lib/base64.ts            apps/api/src/lib/base64.ts
cp apps/web/src/lib/link-id.ts           apps/api/src/lib/link-id.ts
cp apps/web/src/server/hash-ip.ts        apps/api/src/lib/hash-ip.ts
cp apps/web/src/server/store-backend.ts  apps/api/src/stores/store-backend.ts
cp apps/web/src/server/stores.ts         apps/api/src/stores/stores.ts
```

- [ ] **Step 2: Verify the copies need no import edits**

`base64.ts`, `link-id.ts` (imports `./base64`), `hash-ip.ts` (imports `node:crypto`), and `store-backend.ts` (no imports) all use relative or node specifiers that are already correct at the new paths. `stores.ts` imports `@aesmsg/server-store` (a workspace package — path-independent) and `./store-backend` (same dir — correct). **No edits required.** Confirm by reading each copied file.

- [ ] **Step 3: Typecheck the package**

Run: `pnpm --filter @aesmsg/api exec tsc --noEmit`
Expected: PASS (no errors). If `Request`/`btoa`/`crypto` globals error, confirm `@types/node` installed and `types: ["node"]` is set in `tsconfig.json`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib apps/api/src/stores
git commit -m "feat(api): relocate base64/link-id/hash-ip + store factory into @aesmsg/api"
```

---

### Task 3: Relocate the message handlers + port their test suite (parity)

**Files:**
- Create: `apps/api/src/handlers/messages-handler.ts` (from `apps/web/src/server/messages-handler.ts`)
- Create: `apps/api/tests/messages-handler.test.ts` (from `apps/web/tests/server/messages-handler.test.ts`)

- [ ] **Step 1: Copy the handler + test**

```bash
mkdir -p apps/api/src/handlers apps/api/tests
cp apps/web/src/server/messages-handler.ts apps/api/src/handlers/messages-handler.ts
cp apps/web/tests/server/messages-handler.test.ts apps/api/tests/messages-handler.test.ts
```

- [ ] **Step 2: Rewrite import specifiers in `apps/api/src/handlers/messages-handler.ts`**

Apply exactly these four import changes (everything else stays identical):

```
- import type { … } from "@aesmsg/server-store/memory";   (unchanged — already correct)
- import { bytesToBase64 } from "@/src/lib/base64";        →  import { bytesToBase64 } from "../lib/base64";
- import { LINK_ID_REGEX } from "@/src/lib/link-id";       →  import { LINK_ID_REGEX } from "../lib/link-id";
- import { hashIp } from "./hash-ip";                      →  import { hashIp } from "../lib/hash-ip";
```

- [ ] **Step 3: Rewrite import specifiers in `apps/api/tests/messages-handler.test.ts`**

```
- import { … } from "@aesmsg/server-store/memory";         (unchanged — already correct)
- import { bytesToBase64 } from "@/src/lib/base64";        →  import { bytesToBase64 } from "../src/lib/base64";
- import { … } from "@/src/server/messages-handler";       →  import { … } from "../src/handlers/messages-handler";
```

- [ ] **Step 4: Run the ported tests — they must pass (parity check)**

Run: `pnpm --filter @aesmsg/api test`
Expected: PASS — all suites green. This proves the relocation changed no behavior. (The two URL-origin assertions still pass here because we have not yet made the Task 4 change.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/messages-handler.ts apps/api/tests/messages-handler.test.ts
git commit -m "feat(api): relocate message handlers + tests into @aesmsg/api (parity)"
```

---

### Task 4: Make the create handler use a configured link origin (TDD)

The create handler currently builds the link from `new URL(request.url).origin`. On a separate API host that origin is wrong (it would be `https://api.aesmsg.com`). Add a `publicLinkOrigin` dependency so links point at the web host.

**Files:**
- Modify: `apps/api/tests/messages-handler.test.ts`
- Modify: `apps/api/src/handlers/messages-handler.ts`

- [ ] **Step 1: Update the test to require the configured origin**

In `apps/api/tests/messages-handler.test.ts`, change `makeHandler()` and the two happy-path tests so the handler is constructed with `publicLinkOrigin` and the URL assertions expect it.

Replace the `makeHandler` factory:

```ts
const PUBLIC_LINK_ORIGIN = "https://aesmsg.com";

function makeHandler() {
  return createMessagesHandler({
    links: new MemoryLinkMetadataStore(),
    ciphertexts: new MemoryCiphertextStore(),
    rateLimit: new MemoryRateLimitStore(),
    now: () => FROZEN_NOW,
    publicLinkOrigin: PUBLIC_LINK_ORIGIN,
  });
}
```

Replace the first happy-path test's handler construction + URL assertion:

```ts
    const handler = createMessagesHandler({
      links,
      ciphertexts,
      rateLimit,
      now: () => FROZEN_NOW,
      publicLinkOrigin: "https://aesmsg.com",
    });

    const body = validBody();
    const res = await handler(makeReq(body, {}, "https://api.aesmsg.com/api/messages"));

    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; url: string };
    expect(json.id).toBe(body.id);
    expect(json.url).toBe(`https://aesmsg.com/l/${body.id}`);
```

Replace the second test (rename it) so it asserts the link origin is independent of the request URL:

```ts
  it("builds the link from the configured publicLinkOrigin, not the request URL", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq(validBody(), {}, "https://api.aesmsg.com/api/messages"));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { url: string };
    expect(json.url.startsWith("https://aesmsg.com/l/")).toBe(true);
  });
```

Also update the duplicate-id test's handler construction (line ~225) to include `publicLinkOrigin: "https://aesmsg.com"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @aesmsg/api test -- messages-handler`
Expected: FAIL — `createMessagesHandler` does not accept `publicLinkOrigin`, and `json.url` is still derived from the request origin.

- [ ] **Step 3: Implement the `publicLinkOrigin` dependency**

In `apps/api/src/handlers/messages-handler.ts`, add the field to `MessagesHandlerDeps`:

```ts
export interface MessagesHandlerDeps {
  links: LinkMetadataStore;
  ciphertexts: CiphertextStore;
  rateLimit: RateLimitStore;
  now: () => Date;
  publicLinkOrigin: string;
}
```

Then change the success return (currently the last two lines of `createMessagesHandler`'s `POST`):

```ts
    // was: const origin = new URL(request.url).origin;
    //      return jsonOk({ id: body.id, url: `${origin}/l/${body.id}` });
    return jsonOk({ id: body.id, url: `${deps.publicLinkOrigin}/l/${body.id}` });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @aesmsg/api test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/messages-handler.ts apps/api/tests/messages-handler.test.ts
git commit -m "feat(api): build links from configured publicLinkOrigin instead of request origin"
```

---

### Task 5: Fastify adapter, routes, and server builder

**Files:**
- Create: `apps/api/src/fastify-adapter.ts`
- Create: `apps/api/src/routes/messages.ts`
- Create: `apps/api/src/server.ts`

- [ ] **Step 1: Write the adapter `apps/api/src/fastify-adapter.ts`**

```ts
import type { FastifyReply, FastifyRequest } from "fastify";

// The relocated handlers are written against the Web-standard Request/Response. This adapter builds
// a Request from the incoming Fastify request (forwarding the proxy headers that hash-ip keys on),
// invokes the handler, and writes the Response back to the Fastify reply.
type WebHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

export async function runHandler(
  handler: WebHandler,
  request: FastifyRequest,
  reply: FastifyReply,
  params: { id?: string } = {},
): Promise<void> {
  const url = new URL(request.url, `${request.protocol}://${request.hostname}`).toString();

  // Skip runtime-managed / hop-by-hop headers — constructing a Request with them is fragile, and the
  // handlers only read x-forwarded-for / x-real-ip / content-type anyway.
  const SKIP = new Set(["host", "content-length", "connection", "transfer-encoding"]);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || SKIP.has(key.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.append(key, value);
    }
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const webRequest = new Request(url, {
    method,
    headers,
    ...(hasBody ? { body: (request.body as string | undefined) ?? "" } : {}),
  });

  const context = { params: Promise.resolve({ id: params.id ?? "" }) };
  const res = await handler(webRequest, context);

  reply.status(res.status);
  res.headers.forEach((headerValue, headerKey) => {
    reply.header(headerKey, headerValue);
  });
  reply.send(await res.text());
}
```

- [ ] **Step 2: Write the routes `apps/api/src/routes/messages.ts`**

```ts
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

export function registerMessageRoutes(app: FastifyInstance, publicLinkOrigin: string): void {
  const stores = getStores();
  const now = () => new Date();

  const create = createMessagesHandler({ ...stores, now, publicLinkOrigin });
  const get = createGetMessageHandler({ links: stores.links, rateLimit: stores.rateLimit, now });
  const open = createOpenMessageHandler(stores);
  const list = createListMessagesHandler({ links: stores.links, rateLimit: stores.rateLimit, now });
  const revoke = createRevokeMessageHandler({ links: stores.links, rateLimit: stores.rateLimit });

  app.post("/api/messages", (req, reply) => runHandler(create, req, reply));
  app.post("/api/messages/list", (req, reply) => runHandler(list, req, reply));
  app.get("/api/messages/:id", (req, reply) =>
    runHandler(get, req, reply, req.params as { id: string }),
  );
  app.post("/api/messages/:id/open", (req, reply) =>
    runHandler(open, req, reply, req.params as { id: string }),
  );
  app.post("/api/messages/:id/revoke", (req, reply) =>
    runHandler(revoke, req, reply, req.params as { id: string }),
  );
}
```

- [ ] **Step 3: Write the server builder `apps/api/src/server.ts`**

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { registerMessageRoutes } from "./routes/messages";

export interface BuildServerOptions {
  publicLinkOrigin?: string;
  logger?: boolean;
}

// Slightly above the create handler's own 20 MiB MAX_BODY_BYTES check, so an oversized upload is
// rejected by the handler with its 400 "bad_request" rather than by Fastify with a 413.
const MAX_BODY_BYTES = 21 * 1024 * 1024;

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const publicLinkOrigin =
    options.publicLinkOrigin ?? process.env.AESMSG_PUBLIC_LINK_ORIGIN ?? "https://aesmsg.com";

  const app = Fastify({
    bodyLimit: MAX_BODY_BYTES,
    trustProxy: true,
    logger: options.logger ?? false,
  });

  // Pass every request body through untouched as a raw string. The handlers do their own JSON
  // parsing, size limits, and base64 validation — we must not let Fastify pre-parse or reject.
  // NOTE (Phase 1 correction): removeAllContentTypeParsers() FIRST — Fastify's built-in
  // application/json parser otherwise takes precedence over the "*" wildcard, so the handlers
  // would receive a parsed object and request.text() would see "[object Object]" → 400.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  registerMessageRoutes(app, publicLinkOrigin);
  return app;
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @aesmsg/api exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/fastify-adapter.ts apps/api/src/routes/messages.ts apps/api/src/server.ts
git commit -m "feat(api): add Fastify adapter, message routes, and server builder"
```

---

### Task 6: Smoke test the running server (TDD)

**Files:**
- Create: `apps/api/tests/api.smoke.test.ts`

- [ ] **Step 1: Write the smoke test**

```ts
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

// Uses Fastify's in-process inject() — no socket, no Postgres/Redis (no DATABASE_URL/REDIS_URL set,
// so getStores() returns the in-memory stores). One end-to-end create → list → get → open → revoke.
describe("aesmsg API — smoke", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const id = "smoke01abcdef234"; // 16 chars, matches /^[A-Za-z0-9_-]{16}$/
  const ciphertext = Buffer.alloc(64, 7).toString("base64"); // >= 32-byte minimum

  it("POST /api/messages creates a link and returns the web-origin URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: {
        id,
        ciphertext,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        maxOpens: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id, url: `https://aesmsg.com/l/${id}` });
  });

  it("POST /api/messages/list returns the active row", async () => {
    const res = await app.inject({ method: "POST", url: "/api/messages/list", payload: { ids: [id] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0]).toMatchObject({ id, status: "active" });
  });

  it("GET /api/messages/:id returns safe metadata only", async () => {
    const res = await app.inject({ method: "GET", url: `/api/messages/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("active");
    expect(body).not.toHaveProperty("ciphertext");
  });

  it("POST /api/messages/:id/open returns the ciphertext", async () => {
    const res = await app.inject({ method: "POST", url: `/api/messages/${id}/open` });
    expect(res.statusCode).toBe(200);
    expect(res.json().ciphertext).toBe(ciphertext);
  });

  it("GET /api/messages/:id rejects a malformed id with 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/messages/too-short" });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/messages/:id/revoke is idempotent and returns 200", async () => {
    const res = await app.inject({ method: "POST", url: `/api/messages/${id}/revoke` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, status: "revoked" });
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run: `pnpm --filter @aesmsg/api test -- api.smoke`
Expected: PASS — all 6 cases green. If the create case returns 413, the `bodyLimit` in `server.ts` is too low; if it returns 400 on a valid payload, the content-type parser is not passing the raw body through.

- [ ] **Step 3: Run the full package test suite**

Run: `pnpm --filter @aesmsg/api test`
Expected: PASS — handler suite + smoke suite green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/api.smoke.test.ts
git commit -m "test(api): add Fastify inject() smoke test across all five routes"
```

---

### Task 7: Bootstrap entrypoint + root scripts + env example

**Files:**
- Create: `apps/api/src/index.ts`
- Create: `apps/api/.env.example`
- Modify: `package.json` (root)

- [ ] **Step 1: Write the bootstrap `apps/api/src/index.ts`**

```ts
import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 4000);
const app = buildServer({ logger: true });

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`aesmsg API listening on ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Write `apps/api/.env.example`**

```bash
# Fastify listen port (kept off 3000 so the web dev server can run alongside it).
PORT=4000

# When BOTH are set, the API uses Postgres + Redis; otherwise it falls back to in-memory stores.
# Local dev (see docker-compose.yml — non-default host ports):
# DATABASE_URL=postgres://aesmsg:aesmsg@localhost:55432/aesmsg
# REDIS_URL=redis://localhost:56379/0

# Origin used to build the /l/:id links returned by POST /api/messages (the WEB host, not the API).
AESMSG_PUBLIC_LINK_ORIGIN=https://aesmsg.com

# HMAC salt for rate-limit IP keys. REQUIRED (>= 32 bytes) when NODE_ENV=production — the process
# refuses to hash client IPs without it. Leave unset in dev/test.
# RATE_LIMIT_IP_SALT=
```

- [ ] **Step 3: Add root scripts** in `package.json` (root). Add these two entries to `"scripts"`:

```json
    "dev:api": "pnpm --filter @aesmsg/api dev",
    "api:prod": "DATABASE_URL=postgres://aesmsg:aesmsg@localhost:55432/aesmsg pnpm migrate && NODE_ENV=production DATABASE_URL=postgres://aesmsg:aesmsg@localhost:55432/aesmsg REDIS_URL=redis://localhost:56379/0 AESMSG_PUBLIC_LINK_ORIGIN=https://aesmsg.com RATE_LIMIT_IP_SALT=dev-only-salt-change-me-0000000000 pnpm --filter @aesmsg/api start",
```

(`api:prod` is a local production-shape smoke runner; the real salt/URLs come from the deploy environment.)

- [ ] **Step 4: Verify the dev server boots and serves**

Run: `pnpm dev:api` in one terminal, then in another: `curl -s -X POST localhost:4000/api/messages/list -H 'content-type: application/json' -d '{"ids":["abcdefghijkl0123"]}'`
Expected: dev server logs "aesmsg API listening on http://0.0.0.0:4000"; the curl returns `{"results":[{"id":"abcdefghijkl0123","status":"gone"}]}`. Stop the dev server (Ctrl-C) afterward.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/.env.example package.json
git commit -m "feat(api): add bootstrap entrypoint, .env.example, and root dev:api/api:prod scripts"
```

---

### Task 8: Phase 1 verification gate

- [ ] **Step 1: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: PASS across all workspaces (web still intact, api new).

- [ ] **Step 2: Lint the whole repo (Biome covers `apps/api` automatically)**

Run: `pnpm lint`
Expected: PASS. If it reports formatting/import-order issues in the new files, run `pnpm lint:fix`, re-run `pnpm lint`, and amend the relevant commit.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: PASS — existing suites + the new `@aesmsg/api` suites green.

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A && git commit -m "chore(api): apply Biome formatting" || echo "nothing to fix"
```

---

# PHASE 2 — Repoint mobile at the standalone API

### Task 9: Point mobile at `https://api.aesmsg.com`

`apps/mobile/src/api/client.ts` reads its base URL from `Constants.expoConfig?.extra?.aesmsgApiBaseUrl`, which `app.config.ts` derives. We only change the config defaults; `client.ts` is untouched.

**Files:**
- Modify: `apps/mobile/app.config.ts`

- [ ] **Step 1: Update the host + API base URL defaults + the stale comment**

In `apps/mobile/app.config.ts`, change the top constants. The universal-link host becomes the web host `aesmsg.com`; the API base URL points at the **`api.` subdomain** (no longer the same host); and the comment must reflect that an app-less recipient now hits the install bouncer, not a web reader:

```ts
// aesmsg host the universal/app links resolve to. The mobile app intercepts
// https://<host>/l/:id; if the app isn't installed the link opens the web install page.
const AESMSG_HOST = process.env.AESMSG_HOST ?? "aesmsg.com";

// The API base URL the app talks to (the standalone Fastify service on its own subdomain).
// Override with AESMSG_API_BASE_URL for a local dev build (e.g. http://localhost:4000).
const AESMSG_API_BASE_URL = process.env.AESMSG_API_BASE_URL ?? "https://api.aesmsg.com";
```

Leave the rest of the file (the `allowsLocalNetworking` derivation, `associatedDomains: [`applinks:${AESMSG_HOST}`]`, the Android `intentFilters` host, and `extra: { aesmsgApiBaseUrl: AESMSG_API_BASE_URL }`) unchanged.

- [ ] **Step 2: Typecheck mobile**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

- [ ] **Step 3: Verify the resolved config (no native rebuild needed for a JS/config change)**

Run: `pnpm --filter @aesmsg/mobile exec node -e "console.log(require('./app.config.ts'))"` is not valid for a TS config; instead confirm by reading the file that `AESMSG_API_BASE_URL` defaults to `https://api.aesmsg.com` and `AESMSG_HOST` to `aesmsg.com`.
Expected: both defaults correct.

- [ ] **Step 4: Run the mobile test suite (guards the deep-link parser + client logic)**

Run: `pnpm --filter @aesmsg/mobile test`
Expected: PASS — no test asserts the old host/base-URL defaults; if one does, update it to the new defaults.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.config.ts
git commit -m "feat(mobile): point API base URL at api.aesmsg.com; link host at aesmsg.com"
```

> **Manual end-to-end check (do once, not a code step):** point a dev build at a locally-running `apps/api` with `AESMSG_API_BASE_URL=http://localhost:4000`, then exercise create → open → revoke from the app. Document the result in the PR.

---

# PHASE 3 — Strip the web app to landing + bouncer

After this phase the web app has no crypto, no message API, and no authenticated dashboard.

### Task 10: Delete the dashboard, reader, API routes, server, and client stores

**Files (delete):** see list below.

- [ ] **Step 1: Delete the web messaging surface**

```bash
git rm -r \
  apps/web/app/\(app\) \
  apps/web/app/api \
  apps/web/src/server \
  apps/web/src/home \
  apps/web/src/create \
  apps/web/src/links \
  apps/web/src/contacts \
  apps/web/src/keys \
  apps/web/src/settings \
  apps/web/src/reader \
  apps/web/src/lib/identity-context.tsx \
  apps/web/src/lib/sent-links-store.ts \
  apps/web/src/lib/contacts-store.ts
```

(If any path does not exist under its post-rebrand name, list the directory first with `ls apps/web/src` and adjust — the responsibilities, not the exact filenames, are what matter.)

- [ ] **Step 2: Delete the now-orphaned test suites**

```bash
git rm -r apps/web/tests/server 2>/dev/null || true
```

Then find any remaining web tests that import the deleted modules and remove them:

Run: `git grep -lE "src/(server|home|create|links|contacts|keys|settings|reader)|identity-context|sent-links-store|contacts-store" -- apps/web/tests`
For each file returned, `git rm` it (these test the deleted flows). Keep tests that do not reference deleted modules.

- [ ] **Step 3: Do NOT build/typecheck yet** — `app/layout.tsx` and `app/page.tsx` still import deleted modules; Tasks 11–13 fix them. Commit the deletions as one step.

```bash
git commit -m "feat(web): remove messaging dashboard, web reader, API routes, and client stores"
```

---

### Task 11: Simplify the root layout

**Files:**
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Remove `IdentityProvider` and refresh metadata**

Rewrite `apps/web/app/layout.tsx` to drop the identity wrapper (deleted in Task 10) and update the brand metadata. Keep the font setup and the Material Symbols stylesheet:

```tsx
import type { Metadata } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-display", subsets: ["latin"] });
const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "aesmsg",
  description:
    "Zero-knowledge encryption layer for the channels you already use. Encrypt before you send.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat(web): drop IdentityProvider from layout; rebrand metadata to aesmsg"
```

---

### Task 12: Build the `/l/[id]` deep-link bouncer (TDD on the URL builder)

The bouncer must **never call the API** (preserves safe-preview + no-metadata-leak invariants). It validates the id locally and offers "open in app" + "install".

**Files:**
- Create: `apps/web/src/bouncer/deep-link.ts`
- Create: `apps/web/tests/bouncer/deep-link.test.ts`
- Create: `apps/web/src/bouncer/BouncerScreen.tsx`
- Modify: `apps/web/app/l/[id]/page.tsx`

- [ ] **Step 1: Write the failing test for the deep-link builder**

```ts
import { describe, expect, it } from "vitest";
import { appDeepLink, isValidLinkId } from "@/src/bouncer/deep-link";

describe("isValidLinkId", () => {
  it("accepts a canonical 16-char id", () => {
    expect(isValidLinkId("abcdefghijkl0123")).toBe(true);
    expect(isValidLinkId("AbCd-_90EfGhIjKl")).toBe(true);
  });
  it("rejects wrong length or illegal characters", () => {
    expect(isValidLinkId("too-short")).toBe(false);
    expect(isValidLinkId("waytoolongtobevalid12345")).toBe(false);
    expect(isValidLinkId("has spaces 12345")).toBe(false);
    expect(isValidLinkId("dots.dots.dots..")).toBe(false);
  });
});

describe("appDeepLink", () => {
  it("builds an aesmsg:// scheme link for a valid id", () => {
    expect(appDeepLink("abcdefghijkl0123")).toBe("aesmsg://l/abcdefghijkl0123");
  });
  it("returns null for an invalid id (so the bouncer shows the generic message)", () => {
    expect(appDeepLink("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- deep-link`
Expected: FAIL — `@/src/bouncer/deep-link` does not exist.

- [ ] **Step 3: Implement `apps/web/src/bouncer/deep-link.ts`**

```ts
// Local copy of the canonical link-id shape (the server's LINK_ID_REGEX lives in @aesmsg/api and is
// not a web dependency). A 12-byte base64url id is exactly 16 chars of [A-Za-z0-9_-].
const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;

export function isValidLinkId(id: string): boolean {
  return LINK_ID_REGEX.test(id);
}

// The native app registers the `aesmsg://` scheme and the https universal link. The bouncer only
// renders when the universal link did NOT open the app, so its button falls back to the scheme.
// Returns null for a malformed id so the caller shows the generic "not available" message and never
// constructs a misleading deep link.
export function appDeepLink(id: string): string | null {
  if (!isValidLinkId(id)) return null;
  return `aesmsg://l/${id}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web test -- deep-link`
Expected: PASS.

- [ ] **Step 5: Write the bouncer UI `apps/web/src/bouncer/BouncerScreen.tsx`**

A client component. Makes **no network calls**. Attempts the scheme on mount; always renders the install + open affordances. Use design-token utility classes consistent with the project (dark surface, primary accent) and the iOS/Android store URLs from `app-store-links.ts` (Task 13 creates that file; if Task 13 runs after, inline placeholders `#` and replace later).

```tsx
"use client";

import { useEffect } from "react";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/src/landing/app-store-links";
import { appDeepLink } from "./deep-link";

export function BouncerScreen({ id }: { id: string }) {
  const deepLink = appDeepLink(id);

  useEffect(() => {
    // Best-effort hand-off to the app if it is installed but the universal link did not intercept.
    // No network request is made — this only navigates to the custom scheme.
    if (deepLink) window.location.href = deepLink;
  }, [deepLink]);

  return (
    <main className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center px-6 text-center">
      <span className="material-symbols-outlined text-primary text-5xl mb-4">lock</span>
      <h1 className="font-display text-2xl mb-2">Open this secure link in aesmsg</h1>
      <p className="text-on-surface-variant max-w-md mb-8">
        Secure links can only be opened in the aesmsg app, where decryption happens on your device.
        Install the app, then tap the link again.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        {deepLink ? (
          <a
            href={deepLink}
            className="bg-primary text-on-primary font-bold px-6 py-3 rounded-xl"
          >
            Open in app
          </a>
        ) : null}
        <a href={APP_STORE_URL} className="border border-outline-variant px-6 py-3 rounded-xl">
          Download for iOS
        </a>
        <a href={PLAY_STORE_URL} className="border border-outline-variant px-6 py-3 rounded-xl">
          Download for Android
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Replace the route `apps/web/app/l/[id]/page.tsx`** (Next 16 — `params` is a Promise)

```tsx
import { BouncerScreen } from "@/src/bouncer/BouncerScreen";

export default async function LinkBouncerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BouncerScreen id={id} />;
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/bouncer apps/web/tests/bouncer apps/web/app/l/\[id\]/page.tsx
git commit -m "feat(web): replace web reader with a static deep-link bouncer at /l/[id]"
```

---

### Task 13: Migrate the landing page from the mockup

Port `all_design_screens/landing_page_aesmsg/code.html` into a React component. **Faithful port of the visual structure** (the mockup is the design source of truth — do not invent layout), with the deviations below required by the native-only model and the project copy rules in `CLAUDE.md`.

**Files:**
- Create: `apps/web/src/landing/app-store-links.ts`
- Create: `apps/web/src/landing/LandingPage.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Write `apps/web/src/landing/app-store-links.ts`**

```ts
// Public store URLs for the native apps. Replace the bundle/app-id query values once the App Store
// and Play Store listings exist; the hosts are stable.
export const APP_STORE_URL = "https://apps.apple.com/app/aesmsg/id000000000";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.aesmsg.app";
```

- [ ] **Step 2: Port the mockup into `apps/web/src/landing/LandingPage.tsx`**

Port each `<section>` from the mockup **in order**, converting `class` → `className` and self-closing void tags. Sections to reproduce: (1) top navigation header, (2) hero, (3) 3-step process, (4) product-preview bento grid, (5) trust principles grid, (6) CTA panel, (7) footer. Use the project's design-token utility classes (consult `secure_message_design_system/DESIGN.md` and `@aesmsg/design-tokens`); the mockup's inlined Tailwind-CDN token names map to the same token utilities the web app already exposes. **Do not redefine `--spacing-{xs|sm|md|lg|xl|2xl}`** (known Tailwind v4 collision that breaks `max-w-*`).

Apply these **required deviations** from the mockup text/CTAs:

| Mockup content | Replace with | Why |
|---|---|---|
| Wordmark/footer "SecureMsg" | "aesmsg" | rebrand |
| Badge "Military-Grade Privacy for Everyone" | "End-to-end encrypted. Zero-knowledge." | `CLAUDE.md` bans "military-grade" |
| Trust card "Quantum Ready / post-quantum cryptographic standards" | "On-Device Keys / Your private keys never leave your device." | the product uses HPKE X25519, not post-quantum — the claim is false |
| Hero buttons "Create Secure Link" / "How it Works" | "Get the app" (→ store links) / "How it works" (anchor to the 3-step section) | no web compose flow exists |
| CTA buttons "Create My First Link" / "View Enterprise Plan" | "Download for iOS" (→ `APP_STORE_URL`) / "Download for Android" (→ `PLAY_STORE_URL`) | native-only |
| Header nav "Dashboard" link + "Get Started" button | "Download" (→ store links); drop "Dashboard" | no web dashboard |
| Footer "Dashboard" / "Browser Ext" links | "iOS app" / "Android app" (store links) | native-only |
| Step copy "locked in your browser" | "locked on your device" | encryption is in the app, not the browser |
| Mobile bottom-nav (Encrypt/Links/Contacts/Settings) | remove entirely | it mimics the deleted dashboard |
| Footer "© 2024 SecureMsg" | "© 2026 aesmsg" | rebrand + year |

Make the component a server component (no `"use client"`) — it is static. Top-level shape:

```tsx
import { APP_STORE_URL, PLAY_STORE_URL } from "./app-store-links";

export function LandingPage() {
  return (
    <div className="bg-background text-on-background font-sans overflow-x-hidden">
      {/* header, hero, 3-step, bento, trust, CTA, footer ported from the mockup with the deviations above */}
    </div>
  );
}
```

- [ ] **Step 3: Render it from `apps/web/app/page.tsx`**

```tsx
import { LandingPage } from "@/src/landing/LandingPage";

export default function HomePage() {
  return <LandingPage />;
}
```

- [ ] **Step 4: Typecheck + lint the web app**

Run: `pnpm --filter web typecheck && pnpm lint`
Expected: PASS (after `pnpm lint:fix` if formatting differs).

- [ ] **Step 5: Visual verification with the preview tools**

Start the web dev server and verify the landing page renders and the bouncer behaves. Using the `preview_*` tools:
1. `preview_start` (web app), then `preview_screenshot` of `/` — confirm all 7 sections render with dark surface + violet primary, no broken token classes (no oversized full-width blocks from the `max-w-*` collision).
2. `preview_console_logs` — confirm no React/hydration errors.
3. Navigate to `/l/abcdefghijkl0123`, `preview_network` — confirm the bouncer issues **zero** `/api/*` requests, and `preview_screenshot` shows the "Open in app / Download" UI.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/landing apps/web/app/page.tsx
git commit -m "feat(web): migrate landing page from mockup with native-only CTAs"
```

---

### Task 14: Deep-link association files

So iOS/Android intercept `https://aesmsg.com/l/:id` and open the app.

**Files:**
- Create: `apps/web/public/.well-known/apple-app-site-association`
- Create: `apps/web/public/.well-known/assetlinks.json`

- [ ] **Step 1: Write `apps/web/public/.well-known/apple-app-site-association`** (no file extension; must be served as `application/json` with no redirect)

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID000.com.aesmsg.app",
        "paths": ["/l/*"]
      }
    ]
  }
}
```

- [ ] **Step 2: Write `apps/web/public/.well-known/assetlinks.json`**

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.aesmsg.app",
      "sha256_cert_fingerprints": ["REPLACE_WITH_RELEASE_SIGNING_SHA256"]
    }
  }
]
```

- [ ] **Step 3: Leave a deploy note**

These contain placeholders (`TEAMID000`, `REPLACE_WITH_RELEASE_SIGNING_SHA256`) that **must** be filled with the real Apple Team ID and the Android release signing-cert fingerprint before universal links work in production. Add a one-line TODO referencing this in the PR description (not in the JSON — these files must stay valid JSON).

- [ ] **Step 4: Commit**

```bash
git add apps/web/public/.well-known
git commit -m "feat(web): add apple-app-site-association + assetlinks for /l/ deep links"
```

---

### Task 15: Trim web dependencies and unused UI components

**Files:**
- Modify: `apps/web/package.json`
- Modify: `packages/ui/src/index.ts` (and remove dashboard-only component files)

- [ ] **Step 1: Find which `@aesmsg/*` packages the web app still imports**

Run: `git grep -hoE "@aesmsg/(crypto|key-store|server-store|ui|design-tokens)" -- apps/web/app apps/web/src | sort -u`
Expected: after Phase 3, only `@aesmsg/design-tokens` (and possibly `@aesmsg/ui`) remain. `@aesmsg/crypto`, `@aesmsg/key-store`, and `@aesmsg/server-store` should NOT appear.

- [ ] **Step 2: Remove the now-unused deps from `apps/web/package.json`**

Delete the `dependencies` lines for any package not in Step 1's output — at minimum `@aesmsg/crypto`, `@aesmsg/key-store`, `@aesmsg/server-store`. Keep `@aesmsg/design-tokens`, `next`, `react`, `react-dom`, and `@aesmsg/ui` only if Step 1 showed a `ui` import. Then run `pnpm install`.

- [ ] **Step 3: Identify dashboard-only `@aesmsg/ui` components with no remaining consumer**

For each named export in `packages/ui/src/index.ts`, check whether anything still references it:

Run (per export name): `git grep -l "<ExportName\|ExportName" -- apps packages`
If the only hits are the component's own file and its test, it has zero real consumers after Phase 3. Remove those component files (and their tests) and drop their re-exports from `packages/ui/src/index.ts`. Keep anything the landing page or bouncer imports.

> Conservative fallback: if establishing "zero consumers" for a component is uncertain, **leave it in place** — an unused export is harmless, and `@aesmsg/ui` is a shared package whose mobile/other consumers are out of scope here. Only remove what is clearly web-dashboard-specific and unreferenced.

- [ ] **Step 4: Typecheck + test the affected workspaces**

Run: `pnpm --filter web typecheck && pnpm --filter @aesmsg/ui test && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json packages/ui pnpm-lock.yaml
git commit -m "chore(web): drop crypto/key-store/server-store deps and unused dashboard UI"
```

---

### Task 16: Phase 3 verification gate + full sweep

- [ ] **Step 1: Whole-workspace typecheck**

Run: `pnpm typecheck`
Expected: PASS across `@aesmsg/api`, `web`, `@aesmsg/mobile`, and all packages.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS (run `pnpm lint:fix` and amend if needed).

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS — no suite references deleted web modules.

- [ ] **Step 4: Confirm the web app no longer ships crypto or an API**

Run: `git grep -nE "@aesmsg/(crypto|key-store|server-store)|/api/messages|hpke|decrypt" -- apps/web/app apps/web/src`
Expected: **no matches** (the bouncer copy may mention "decryption happens on your device" as prose — that is fine; there must be no `import`, no `/api/messages` fetch, and no crypto module usage).

- [ ] **Step 5: Build the web app**

Run: `pnpm --filter web build`
Expected: PASS — static landing + `/l/[id]` route compile.

- [ ] **Step 6: Final commit**

```bash
git add -A && git commit -m "chore: phase-3 verification fixes" || echo "clean"
```

---

## Post-plan deploy notes (not implementation steps)

- Deploy `apps/api` to `api.aesmsg.com` and the web app to `aesmsg.com` as two services (Sproobo). The API needs `DATABASE_URL`, `REDIS_URL`, `AESMSG_PUBLIC_LINK_ORIGIN=https://aesmsg.com`, and a real `RATE_LIMIT_IP_SALT` (≥32 bytes) with `NODE_ENV=production`.
- Ensure the nginx proxy forwards `x-forwarded-for` to the API (the IP rate-limit keying and the production fail-closed check depend on a real client IP).
- **SECURITY (deferred from Phase 1 ZK review — must resolve at this slice): rate-limit IP source.** `getClientIp` trusts the **leftmost** `X-Forwarded-For` value, which a client can spoof if the proxy *appends* XFF — rotating the rate-limit key per request and bypassing the per-IP limiter (create/open spam, enumeration attempts). Mitigate at deploy: configure nginx to **overwrite** XFF with the real client IP (`proxy_set_header X-Forwarded-For $remote_addr;`), OR scope Fastify `trustProxy` to the exact proxy hop count and switch `getClientIp` to Fastify's `request.ip`. Not fixed in code because the proxy topology is unknown until this slice. (No ZK break — ciphertext stays sealed regardless.)
- **Logging posture (shipped in Phase 1):** the API runs with `disableRequestLogging: true` so per-request logs never carry the raw client IP or the link-ID-bearing URL (which would reintroduce the IP↔event correlation `hash-ip` HMACs away in Redis). Any future request/audit logging added at deploy must stay IP-free (or HMAC the IP).
- **Production runtime:** `apps/api` runs via `tsx src/index.ts` (`start` script) and `tsx` is a runtime `dependency` (survives `pnpm install --prod`). If the deploy prefers a compiled artifact, add a `tsc`/`tsup` build → `node dist/index.js` step instead.
- Serve `/.well-known/apple-app-site-association` as `application/json` with **no redirect**; fill in the real Apple Team ID and Android signing SHA-256 (Task 14 placeholders).
- The `web:prod` root script still references Postgres for the web app — after this pivot the web app has no DB; update or drop that script during deploy plumbing (out of scope for this plan).

## Self-Review notes

- **Spec coverage:** API relocation (Tasks 2–5), `publicLinkOrigin` change (Task 4, spec §5.3), passthrough body parser + bodyLimit (Task 5, spec §5.2), deny-all CORS (no CORS plugin registered — Task 5, spec §5.5), env vars (Task 7, spec §5.4), mobile repoint (Task 9, spec §7), web strip + landing + static bouncer + well-known (Tasks 10–14, spec §6 + §3 invariants), UI/dep trim (Task 15, spec §6.2), phased green gates (Tasks 8, 16, spec §9). Testing per spec §8 (handler parity + smoke + manual). All spec sections map to a task.
- **No silent caps:** Task 15 explicitly documents the conservative "leave it in place if uncertain" fallback rather than silently deleting shared components.
