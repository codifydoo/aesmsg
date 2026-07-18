# Mobile: connect real data, wire dead Home actions, clean the Home header

**Date:** 2026-06-01
**Status:** Approved (design)
**Area:** `apps/mobile`

## Problem

The mobile app shell is mature — Links, Contacts, and Settings already read from real
encrypted on-device stores reconciled with the server. But three rough edges remain from the
design-first build-out:

1. **Mocked data is still user-visible.** The Home hub's "Recent links" are hardcoded
   fixtures; the Settings / My-Public-Key / Rotate-Key screens show a fake display name
   ("You" / "YK") and, on the Settings card, even a **mock fingerprint**.
2. **Several Home quick-actions are dead.** `onSeeAllLinks`, `onScan`, `onMyKey`,
   `onAddContact`, `onImportBackup`, `onSettings` are all `() => {}` no-ops — tapping them
   does nothing.
3. **The Home header is redundant.** The `aesmsg` title + settings gear duplicate the
   bottom-nav Settings tab.

## Goals

- Home "Recent links" reads the real sent-links store (same source as the Links tab).
- Every Home quick-action either navigates somewhere real or is removed.
- The fake display name/initials are replaced with a **key-derived** identity presentation,
  and every user-reachable screen that shows a fingerprint shows the **real** one.
- The Home header (title + gear) is removed.

## Non-goals (explicitly out of scope)

- **Billing / Account tab** (Free/Pro plan state) — no StoreKit/Play backend yet. Untouched.
- **Activity inbox** (`SAMPLE_ACTIVITY`) — no real activity-feed source yet. Untouched.
- **Real device-id source** — `ADVANCED_MOCK.deviceId` in the Advanced screen stays a
  documented follow-up; generating a real device id was deferred with the billing/backends
  scope. The Device ID row is buried in the technical Advanced screen.
- **In-app "import backup over an existing identity"** flow — replacing a live identity is a
  guarded operation that does not exist yet (the only real import path is onboarding restore).
- The Home status card copy ("Private key secured / Biometric unlock enabled") stays as-is;
  making "Biometric unlock enabled" conditional on a setting is a separate concern.
- Static content (FAQ, About/legal, pricing/feature lists, version string) — legitimately
  hardcoded, left alone.

## Design

### 1. Remove the Home header

`HomeScreen.tsx`: delete the header `View` (title + settings gear,
[`HomeScreen.tsx:73-87`](../../../apps/mobile/src/home/HomeScreen.tsx)) and its `header` /
`title` / `gear` styles. Remove the `onSettings` prop from `HomeScreenProps` and the
`onSettings` wiring in `HomeFlow.tsx`. The green status card becomes the top element.

### 2. Cross-tab navigation for Home quick-actions

Tab state lives in `App.tsx` (`const [tab, setTab] = useState<Tab>(...)`). We add a one-shot
**Contacts intent** so the two contact actions can open a specific sub-screen.

**`App.tsx` changes:**
- Add `const [contactsIntent, setContactsIntent] = useState<"scan" | "add" | null>(null)`.
- Add `function navigate(next: Tab, intent: "scan" | "add" | null = null)` →
  `setContactsIntent(next === "contacts" ? intent : null); setTab(next);`
- The `TabBar`'s `onChange` is wrapped so a manual tab switch clears the intent:
  `onChange={(t) => navigate(t)}`. (Passing through `navigate` with no intent clears it.)
- `HomeFlow` receives `onNavigate={navigate}`.
- `ContactsFlow` receives `initialIntent={contactsIntent}`.

Because each tab's body is conditionally rendered (`{tab === "contacts" && <ContactsFlow/>}`),
switching tabs unmounts/remounts the flow, so the intent is consumed exactly once as the
flow's initial route. Manual `TabBar` navigation clears it first, so the tab bar always opens
the tab's root.

**`HomeFlow.tsx` / `HomeScreen.tsx` wiring:**

| Action | Behavior |
|---|---|
| See all links | `onNavigate("links")` |
| Scan QR | `onNavigate("contacts", "scan")` |
| My public key | `onNavigate("keys")` |
| Add contact | `onNavigate("contacts", "add")` |
| Import backup | **relabel → "Export backup"**, `onNavigate("keys")` (Export Backup is reachable from the Keys / My-Public-Key screen) |
| Recent-link row tap + "See all" | `onNavigate("links")` |

- **My public key**: drop the tap-time auto-copy (the Keys screen has its own Share/Copy +
  QR). Keep long-press-to-copy on the tile as a shortcut, using the `publicKeyString` already
  in `HomeScreen`. The "Copied" label state can be removed if it's only driven by the tap path
  (keep it if long-press still surfaces it).
- **Import → Export backup**: the 4th grid tile is relabeled `Export backup` with icon
  `cloud_download` (or keep `cloud_upload`→`backup`); routes to the Keys tab, whose
  My-Public-Key screen links to Export Encrypted Backup. This keeps the 2×2 grid intact and
  lands on a real screen (the "Import backup" semantics had no real destination for an
  already-unlocked user).

**`ContactsFlow.tsx`:** add `initialIntent?: "scan" | "add"` to `ContactsFlowProps`; seed the
initial route from it:
`useState<Route>(initialIntent === "scan" ? { name: "scan" } : initialIntent === "add" ? { name: "add" } : { name: "list" })`.
The existing empty-store guard already exempts `add`/`scan`, so a contactless user who taps
"Scan QR" lands on the scanner, not the empty state.

### 3. Home "Recent links" → real sent-links

`HomeFlow` calls the existing `useSentLinks()` hook (same as `LinksFlow`) and passes the
mapped recent rows down to `HomeScreen` as a prop, keeping `HomeScreen` presentational.

`recent-links.ts` is converted from a mock fixture into a **pure mapper**:

- Remove `RECENT_LINKS` and the local `chipForStatus` / `CHIP_BY_STATUS`.
- Add `toRecentLinks(links: Link[], limit = 3): RecentLinkView[]` — takes the first `limit`
  links. `listSentLinks()` already returns newest-first by `createdAt`
  (`sent-links-store.ts:44-47`) and reconciliation preserves that order, so the mapper just
  preserves input order. Each row: `{ id, title: link.to, sub: link.time, status: link.status }`.
- Chip presentation reuses the Links tab's `statusDescriptor(status)` from `link-status.ts`
  (covers all 5 statuses: available / opened / expiring / revoked / expired) instead of the
  Home-local 2-status map. `fill` rule preserved from the design: `fill = status === "available"`.

`HomeScreen` renders:
- **Empty** (`recentLinks.length === 0`): a single muted `ListRow` "No secure links yet"
  (no "See all" affordance when empty).
- **Non-empty**: the rows + a "See all" that calls `onNavigate("links")`; each row is tappable
  → `onNavigate("links")`.

`tests/recent-links.test.ts` is rewritten to cover `toRecentLinks` (limit, ordering, empty,
status→chip mapping incl. `fill`).

### 4. Key-derived identity label (replace "You" / "YK")

A zero-knowledge keypair identity has no real name. New shared module
`apps/mobile/src/identity/identity-display.ts`:

- `export const IDENTITY_LABEL = "This device";` — the honest primary label (matches the
  existing "Your device" subtitle), replacing "You".
- `export function keyDerivedInitials(shortFingerprint: string): string` — the first two
  alphanumeric characters of the formatted short fingerprint, uppercased; `"?"` fallback for
  empty input. Purely key-derived (e.g. `"E82F 4D11"` → `"E8"`). **Pure, node-tested.**
- `export function useShortFingerprint(publicKeyString, groups = 4): string` — a thin React
  hook wrapping the existing `computeFingerprint` + `truncateFingerprint`/`formatFingerprintGroups`
  + `useEffect`/`useState` pattern already duplicated in `MyPublicKeyScreen` and
  `AdvancedScreen`. Returns `""` until resolved. Exercised on-device, not by the renderer
  (per the repo's no-React-renderer test convention).

Apply it:
- **`MyPublicKeyScreen.tsx`**: avatar `initials={keyDerivedInitials(shortFp)}`, name
  `IDENTITY_LABEL`, keep subtitle "Your device". Drop the `MY_IDENTITY` import. (It already
  computes the fingerprint; optionally adopt `useShortFingerprint`.)
- **`SettingsRootScreen.tsx`** + **`SettingsFlow.tsx`**: thread `publicKeyString` (already in
  `SettingsFlow` from `App`) into `SettingsRootScreen`; compute the short fingerprint with
  `useShortFingerprint`; avatar `keyDerivedInitials(...)`, name `IDENTITY_LABEL`, fingerprint
  row = the **real** short fingerprint. Drop the `PROFILE_MOCK` import. The violet "Free" plan
  chip stays a static label (only a free tier exists today).
- **`RotateKeyScreen.tsx`**: `KeysFlow` passes the real `publicKeyString` (or a computed
  fingerprint); the screen shows the real current-key fingerprint instead of
  `CURRENT_KEY_FINGERPRINT`. Keep a prop override for tests.
- **`WipeIdentityScreen.tsx`**: not rendered in any flow (export-only). Just decouple it from
  the mock — change the `fingerprint` prop default from `CURRENT_KEY_FINGERPRINT` to `""`
  (or make it required) so deleting the mock module doesn't break the import. No real
  fingerprint wiring needed since it's not user-visible.

**Mock cleanup:**
- Delete `apps/mobile/src/keys/mock-data.ts` (both `MY_IDENTITY` and `CURRENT_KEY_FINGERPRINT`
  consumers updated above).
- In `apps/mobile/src/settings/settings-mock.ts`: remove `PROFILE_MOCK`; keep `ADVANCED_MOCK`
  (`deviceId` is the documented follow-up; `encryptionFormat` is legitimately static).

## Components / boundaries touched

| Unit | Change | Tested by |
|---|---|---|
| `home/recent-links.ts` | mock → pure `toRecentLinks` mapper reusing `statusDescriptor` | `tests/recent-links.test.ts` (rewritten) |
| `identity/identity-display.ts` (new) | `IDENTITY_LABEL`, pure `keyDerivedInitials`, thin `useShortFingerprint` hook | new unit test for `keyDerivedInitials` |
| `home/HomeScreen.tsx` | remove header; recent links from prop; relabel 4th tile; wire actions; long-press copy only | presentational |
| `home/HomeFlow.tsx` | `useSentLinks` → `toRecentLinks`; route actions via `onNavigate` | presentational |
| `App.tsx` | `navigate(tab, intent)`; `contactsIntent` state; pass to Home/Contacts; TabBar clears intent | on-device |
| `contacts/ContactsFlow.tsx` | `initialIntent` seeds initial route | on-device |
| `settings/SettingsFlow.tsx` + `SettingsRootScreen.tsx` | thread `publicKeyString`; real fingerprint; key-derived avatar/label | on-device / presentational |
| `keys/MyPublicKeyScreen.tsx`, `keys/RotateKeyScreen.tsx`, `keys/WipeIdentityScreen.tsx` | key-derived label / real fingerprint / mock decouple | on-device |
| `keys/mock-data.ts` (deleted), `settings/settings-mock.ts` (`PROFILE_MOCK` removed) | mock cleanup | — |

## Testing

- **Unit (node-env, per repo convention):** rewrite `recent-links.test.ts` for `toRecentLinks`;
  add a test for `keyDerivedInitials` (two-token, single, empty/non-alnum → `"?"`).
- **Gates:** `pnpm --filter @aesmsg/mobile typecheck`, `lint`, `test` all green.
- **On-device sanity (manual, simulator):** Home shows real recent links (or the empty row);
  each quick-action lands on the right tab/sub-screen; Scan/Add open the scanner/add screen;
  the header is gone; Settings & My-Public-Key show the real fingerprint + key-derived avatar.

## Risks

- **Intent leak across tab switches** — mitigated by clearing the intent on every manual
  `TabBar` change and relying on conditional-render remount for one-shot consumption.
- **Removing the tap auto-copy on "My public key"** changes existing behavior; preserved via
  long-press + the destination screen's own Copy button.
- **Removing `RECENT_LINKS`** may have other importers — implementation must grep for
  `RECENT_LINKS` / `chipForStatus` and update every consumer (only `HomeScreen` is known).
