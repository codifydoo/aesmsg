# Slice 9 — Identity-Aware Home + Authenticated Navigation Chrome

**Status:** Draft
**Date:** 2026-05-10
**Slice:** Phase 1 / Slice 9

## 1. Goal

Replace the Phase 0 placeholder at `/` with a real home that adapts to identity state, and roll the existing `<SideNav>` chrome out to every authenticated route so the app finally looks like its mockups.

## 2. Why

- `apps/web/app/page.tsx` is still the `feat(web): scaffold Next.js 16 Phase 0 placeholder` from May 9. Slices 1–8 wired up `/create`, `/links`, `/contacts`, `/keys`, `/l/[id]`, but never replaced `/`.
- The dashboard mockup (`all_design_screens/dashboard_aesmsg/`) and every other authenticated mockup (create, contacts, keys, settings, secure-link-created, security-alert) shows a left rail. `<SideNav>` exists in `@aesmsg/ui` but no route uses it. Each screen the user touches today looks "off-mockup".
- A returning user should land in the dashboard. A first-time visitor should land in a minimal landing that explains the value and points to identity setup. A locked user should be told to unlock.

## 3. Scope

**In scope:**
- Identity-aware `/` rendering Landing (no_identity / locked) or Dashboard (unlocked)
- Shared authenticated layout that wraps `/`, `/create`, `/links`, `/contacts`, `/keys` with `<SideNav>` when identity is unlocked, and a takeover (Landing variant) otherwise
- Full dashboard matching `dashboard_aesmsg` mockup: vault header + integrity badge, Create Message panel, Local Public Key card, Recent Secure Links (top 3), Verified Contacts (top 3)
- Minimal Landing (hero + 3 trust pillars + primary CTA), with copy variants for `no_identity` and `locked`
- Active nav-item highlighting via `usePathname()`

**Out of scope (deferred):**
- Full marketing landing sections (Zero-Knowledge Architecture demo, Trust Principles grid, "Ready to secure your comms?" CTA, footer). Pre-launch slice.
- `/settings` route — SideNav item omitted (not "coming soon", just absent) until the route exists
- Mobile / responsive nav (SideNav is `hidden md:flex` already; mobile chrome is its own slice)
- Removing the now-redundant per-page identity gating from `/create`, `/links`, `/contacts`, `/keys`. The new shared layout supersedes them, but we leave the existing gates in place as dead-but-safe code in this slice and clean them up in a follow-up — keeps this diff focused on chrome + home, not on gating logic in already-shipped pages
- Real "system integrity" check — the dashboard badge is a static visual derived from `state.status === "unlocked"`
- Switching `<SideNav>`'s `<a>` to Next.js `<Link>` (separate `@aesmsg/ui` change)

## 4. UX states

| Identity state | What renders at `/` and at every other auth route |
|---|---|
| `loading` | Centered skeleton ("Loading…"), full bleed |
| `no_identity` | Landing — "Welcome" headline, 3 pillars, primary CTA "Set up your identity" → `/keys` |
| `locked` | Landing — same hero + pillars, CTA changed to "Unlock your identity" → `/keys`; subtle "You already have an identity on this device" microcopy |
| `unlocked` at `/` | SideNav + Dashboard |
| `unlocked` at `/create`, `/links`, `/contacts`, `/keys` | SideNav + the existing page content |

The shared `(app)` layout owns the gate: when state is not `unlocked`, the layout renders the appropriate Landing/Loading takeover and ignores `children`. This means the per-page identity gating that today lives in `app/create/page.tsx`, `app/links/page.tsx`, `app/contacts/page.tsx`, and `app/keys/page.tsx` becomes unreachable in practice once those routes move into `(app)/`. We leave the per-page gates in place as defense-in-depth for this slice; removing them is a follow-up (see §3 / §13).

Landing in all states is full-bleed (no SideNav, no top bar). It owns the whole viewport.

## 5. Routing & file layout

Use a Next.js route group to share the chrome without changing URLs.

```
apps/web/app/
├── (app)/                       ← route group, URL-transparent
│   ├── layout.tsx               ← NEW: SideNav wrapper, client component
│   ├── page.tsx                 ← REPLACES old app/page.tsx; identity-aware
│   ├── create/                  ← MOVED from app/create
│   ├── links/                   ← MOVED from app/links
│   ├── contacts/                ← MOVED from app/contacts
│   └── keys/                    ← MOVED from app/keys
├── api/                         ← unchanged (no SideNav)
├── l/[id]/                      ← unchanged (public, no SideNav)
├── layout.tsx                   ← unchanged (root layout with IdentityProvider)
└── globals.css                  ← unchanged
```

`apps/web/app/page.tsx` is **deleted**; the route is now served by `(app)/page.tsx`.

The route group `(app)` does not affect URLs — `(app)/create/page.tsx` still serves `/create`.

## 6. Components

All new files live under `apps/web/src/home/` (parallel to `src/create/`, `src/links/`, `src/contacts/`, `src/reader/`).

```
apps/web/src/home/
├── HomeScreen.tsx               ← entry; switches Landing vs Dashboard on state
├── LandingScreen.tsx            ← no_identity + locked variants
└── DashboardScreen.tsx          ← unlocked dashboard
```

Plus one shell component:

```
apps/web/src/lib/
└── authenticated-shell.tsx      ← <AuthenticatedShell> client component used by (app)/layout.tsx
```

### `AuthenticatedShell`

Client component. Reads `useIdentity()`. Renders one of:
- `loading` → centered "Loading…"
- `no_identity` / `locked` → `<LandingScreen variant={state.status} />` (full bleed, ignores `children`)
- `unlocked` → `<SideNav items={NAV_ITEMS} activeId={...} /><main>{children}</main>`

Active nav id derived from `usePathname()` against a static map:
- `/` → `"dashboard"`
- `/create` → `"create"` (also matches subroutes if any)
- `/links` → `"links"`
- `/contacts` → `"contacts"`
- `/keys` → `"keys"`

`NAV_ITEMS` constant lives next to `AuthenticatedShell`. Material icon names match the existing `<MaterialIcon>` set: `dashboard`, `mail`, `link`, `group`, `key`.

### `HomeScreen`

Client component used by `(app)/page.tsx`. Reads `useIdentity()` and returns:
- `loading` → centered "Loading…" (matches existing pattern in `app/create/page.tsx`)
- `no_identity` / `locked` → `<LandingScreen variant={state.status} />`
- `unlocked` → `<DashboardScreen identity={state.identity} storedIdentity={state.storedIdentity} />`

This duplicates the layout's gating logic (because the layout already shows Landing for non-unlocked states), but keeps `HomeScreen` self-contained for future refactor and so it tests as a unit. The layout takeover wins visually because it renders at a higher level — `HomeScreen`'s non-unlocked branches are dead paths in production but remain test-targets for the component in isolation.

(Alternative considered: `HomeScreen` always renders `<DashboardScreen>` and trusts the layout to hide it when not unlocked. Rejected — couples `HomeScreen` to a parent's behavior, harder to test.)

### `LandingScreen`

```ts
type LandingVariant = "no_identity" | "locked";
interface LandingProps { variant: LandingVariant }
```

Full-bleed layout. Sections:

1. **Hero** — `<h1>` "Encrypted links for private messages and files" + 1-line subtitle. (Lifted from `landing_page_aesmsg` mockup.)
2. **Trust pillars** — three cards in a row at `md` and up, stacked at `sm`:
   - "Encrypt locally" — local-only encryption explanation
   - "Share anywhere" — channel-agnostic transport
   - "Recipient decrypts" — only the holder of the matching private key can read
3. **Primary CTA** — single button:
   - `variant="no_identity"` → "Set up your identity" → `/keys`
   - `variant="locked"` → "Unlock your identity" → `/keys`
4. **Microcopy under CTA** — only for `locked`: "You already have an identity on this device — enter your passphrase to continue."

Copy verbatim from the mockup where it exists; new sentences must respect the rules in CLAUDE.md (no "unbreakable", "military-grade"; favor "end-to-end encrypted", "zero-knowledge", "private keys stay on your device").

### `DashboardScreen`

```ts
interface DashboardScreenProps {
  identity: IdentityKeypair;
  storedIdentity: StoredIdentity;
}
```

Single file with internal sections (don't pre-extract sub-components — extract only if a section grows beyond ~80 lines):

1. **Vault header**: `<h1>` "Vault Dashboard" + small badge. Badge is green ("System Integrity / Private key available on this device") — pure visual, no real check; it's true by construction inside the `unlocked` branch.
2. **Create Message panel**: title + 1-sentence blurb + primary button "Initialize Message" linking to `/create` and a secondary "Advanced Options" button also linking to `/create` (mockup parity — there's no separate advanced page).
3. **Local Public Key card**: `<FingerprintDisplay>` (existing in `@aesmsg/ui`) showing the unlocked identity's fingerprint, plus copy-to-clipboard for the full base64 public key. Uses `exportPublicKey(identity.publicKey)` — already imported by the identity context. The fingerprint is computed client-side in this slice (call `fingerprint(publicKey)` from `@aesmsg/crypto`); cache the result in the identity-context state in a follow-up.
4. **Recent Secure Links** card: top 3 most recent rows from `refreshAndList()` (existing in `apps/web/src/links/refresh-and-list.ts`). Each row shows label + status pill + relative timestamp. Empty state: "No links sent yet — create your first one." Includes a "View all" link → `/links`. On error from the bulk fetch, render the local-only data with a small "Status unavailable" hint (mirrors `LinksScreen`'s graceful-degradation behavior).
5. **Verified Contacts** card: top 3 contacts from `listContacts()` filtered by `verified === true`, sorted by most-recently-added. Each row uses the existing `<ContactRow>` as-is. Empty state: "No verified contacts yet." Includes "View all" link → `/contacts`.

All data fetching in `DashboardScreen` is client-side, in a `useEffect` keyed off the identity. Loading state for each card is independent — no top-level spinner blocking the whole dashboard.

## 7. Data flow

```
identity-context (root)
    │
    ▼
(app)/layout.tsx ──► AuthenticatedShell
    │                    ├─ unlocked → SideNav + children
    │                    ├─ no_identity → LandingScreen variant="no_identity"
    │                    ├─ locked → LandingScreen variant="locked"
    │                    └─ loading → "Loading…"
    │
    ▼ (children when unlocked)
(app)/page.tsx ──► HomeScreen
    │                    ├─ unlocked → DashboardScreen
    │                    └─ (other branches: dead in production, alive in tests)
    │
    ▼
DashboardScreen
    ├─ static: vault header, create CTA, local public key
    └─ async: refreshAndList() → Recent Links
              listContacts() → Verified Contacts
```

## 8. Error handling

- `refreshAndList()` failure on dashboard → render the local rows with a "Status unavailable" hint, do not throw. Same as `LinksScreen`.
- `listContacts()` failure → render empty state with "Couldn't load contacts" hint and a retry button (per existing `ContactsScreen` pattern).
- `exportPublicKey` / `fingerprint` failure → render the card with a "Couldn't display public key" message; user is still functional (CTA, links work). Fingerprint computation should not fail in practice on a valid `IdentityKeypair`, but the card guards anyway.
- All thrown errors land in the existing app-router error boundary; no new error.tsx files in this slice.

## 9. Tests

Vitest browser mode (Chromium headless). Test file locations match the existing apps/web pattern (`apps/web/tests/<feature>/...`).

- `tests/home/HomeScreen.test.tsx`
  - Renders Loading state when identity is loading
  - Renders LandingScreen variant="no_identity" when state is no_identity
  - Renders LandingScreen variant="locked" when state is locked
  - Renders DashboardScreen when state is unlocked

- `tests/home/LandingScreen.test.tsx`
  - Renders hero + 3 pillars in both variants
  - "Set up your identity" CTA for no_identity, "Unlock your identity" for locked
  - Locked variant shows microcopy; no_identity does not
  - Both CTAs link to `/keys`

- `tests/home/DashboardScreen.test.tsx`
  - Renders header + Create CTA + public key fingerprint
  - Recent Links card renders top 3 rows from a mocked `refreshAndList`
  - Recent Links card renders empty state when local store is empty
  - Recent Links card renders local-only with "Status unavailable" hint when bulk fetch rejects
  - Verified Contacts card renders top 3 verified contacts
  - Verified Contacts card filters out unverified
  - Verified Contacts card renders empty state when no verified contacts

- `tests/lib/authenticated-shell.test.tsx`
  - Renders LandingScreen no_identity when identity is no_identity (children ignored)
  - Renders LandingScreen locked when identity is locked
  - Renders Loading when loading
  - Renders SideNav + children when unlocked
  - SideNav `activeId` matches current `usePathname()` for each route in `NAV_ITEMS`

No e2e changes — existing flow tests pass through the new chrome unaffected.

## 10. Migration of existing routes

Move four directories into `(app)/`:

```
git mv apps/web/app/create   apps/web/app/(app)/create
git mv apps/web/app/links    apps/web/app/(app)/links
git mv apps/web/app/contacts apps/web/app/(app)/contacts
git mv apps/web/app/keys     apps/web/app/(app)/keys
```

(In the implementation plan, this is one task. URLs unchanged because route groups don't affect URLs.)

`apps/web/app/page.tsx` is deleted (replaced by `(app)/page.tsx`).

`apps/web/app/layout.tsx` (root) is unchanged.

`apps/web/app/api/`, `apps/web/app/l/[id]/`, `apps/web/app/globals.css` are unchanged.

## 11. Dependencies

No new dependencies. Uses:
- `@aesmsg/ui` → `SideNav`, `FingerprintDisplay`, `Surface`, `GlassCard`, `Button`, `MaterialIcon` (all existing)
- `@aesmsg/crypto` → `exportPublicKey`, `fingerprint`, `truncateFingerprint` (all existing)
- `@aesmsg/key-store` → identity types via the context (no new direct imports)
- Local: `refresh-and-list.ts`, `contacts-store.ts`, `identity-context.tsx` (all existing)

## 12. Acceptance criteria

- `pnpm dev` → `http://localhost:3000/` shows the dashboard when identity is unlocked, the landing when not
- All four authenticated routes (`/create`, `/links`, `/contacts`, `/keys`) display the SideNav with the correct active item highlighted
- `/l/[id]` and API routes are unaffected (no SideNav, no identity gate)
- `pnpm typecheck` clean across all 6 workspaces
- `pnpm test` — 221 prior tests still pass; new tests for HomeScreen / LandingScreen / DashboardScreen / AuthenticatedShell pass
- `pnpm lint` exit 0; no new infos beyond the existing 3
- The visual diff vs. `dashboard_aesmsg/screen.png` and `landing_page_aesmsg/screen.png` (hero + pillars region only) is small enough that no further visual changes are needed for this slice

## 13. Risks & open questions

- **`<SideNav>` uses `<a href>` not `<Link>`.** Each click is a full reload. Acceptable for this slice; tracked as a follow-up against `@aesmsg/ui`.
- **`/settings` is in the dashboard mockup's SideNav but no route exists.** Spec choice: omit the item until the route ships. If you'd rather show it as disabled, swap to a non-anchor element with `aria-disabled="true"` — call this out at plan-review time.
- **Per-page identity gating remains in `/create`, `/links`, `/contacts`, `/keys`.** Now redundant once layout-level takeover lands, but removing it is a follow-up to keep this slice's diff focused.
- **No real "system integrity" check.** The dashboard badge is decorative. Acceptable for Phase 1.
