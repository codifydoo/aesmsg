# Slice 11 — Security Settings screen (`/settings`)

**Date:** 2026-05-11
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** Slices 1–10

## 1. Context

The web identity surface is complete except for one screen on the proposed list: **Security Settings**. The Wipe Identity Confirm modal already ships (`apps/web/src/keys/WipeConfirmModal.tsx`), reachable from both `<UnlockScreen>` and `<MyKeysScreen>`. The full mockup for Settings — sidebar-flavored desktop variant — lives at [`all_design_screens/security_settings_aesmsg_2/`](../../../all_design_screens/security_settings_aesmsg_2/screen.png). Variant 1 is mobile-styled and belongs to Phase 2.

Slice 11 adds the `/settings` route, the SideNav item that targets it, and the screen contents. The page is the natural home for Phase 2 toggles that haven't been built yet (biometric, key rotation, encrypted backup, server-side account deletion); Slice 11 renders honest **"Coming soon"** placeholders for those rows so the page matches the design 1:1 and future slices flip rows live without rebuilding the layout. The one genuinely new behavioral feature in Slice 11 is the **App Lock Timeout** — an idle-driven auto-lock of `IdentityContext`.

This slice is **client-side and UI-only**. No `@aesmsg/crypto`, `@aesmsg/key-store`, `@aesmsg/server-store`, or API-route changes. No new package.

## 2. Goals

- Add a new route at `apps/web/app/(app)/settings/page.tsx` rendering `<SettingsScreen>`, inheriting `AuthenticatedShell` + `SideNav` chrome.
- Add a 6th `SideNav` item — `{ id: "settings", label: "Settings", href: "/settings", icon: "settings" }` — appended after `Keys`. Update `getActiveNavId` if it needs a tweak (likely not — current prefix matching covers `/settings`).
- Add `<SettingsScreen>` at `apps/web/src/settings/SettingsScreen.tsx`, assembling four sections per [§4 UX](#4-ux).
- Add `useAppLockTimeout` hook at `apps/web/src/settings/use-app-lock-timeout.ts` — owns the `localStorage`-backed setting, the idle detector, and the auto-lock trigger. Mounted once inside `AuthenticatedShell` so it is active across every authenticated route.
- Extend `IdentityContext`'s `unlocked` state variant with `unlockedAt: Date` so the user-session-header can display "Active for Xh Ym". Set in `setupNew` and `unlock` actions on successful unlock; not persisted (in-memory only, matches the keypair lifecycle).
- Treat Biometric, Rotate, Export Backup, and Delete Account as **"Coming soon"** display rows — no interactive controls, no `disabled` attributes, just a neutral inline tag.
- Wire the **Wipe Private Key** action in Danger Zone to the existing `<WipeConfirmModal>` — no modal duplication; this is the same modal `<MyKeysScreen>` already uses.
- Wire **Copy** on Public Key Fingerprint via `navigator.clipboard.writeText()` with a 2-second inline "Copied" pill.

## 3. Non-goals

- **No biometric authentication.** Phase 2 (native mobile) and future WebAuthn. Row renders as "Coming soon".
- **No key rotation.** The `@aesmsg/crypto` and `@aesmsg/key-store` APIs do not support rotation yet, and ciphertext re-encryption for in-flight legacy links is its own non-trivial design problem. Row renders as "Coming soon".
- **No backup export OR restore.** Shipping export without import produces a dead file (no `<SetPassphraseScreen>` import path exists). Backup is a coherent feature only when paired with restore; both ship together in a later slice. Row renders as "Coming soon".
- **No "Delete Account".** Phase 1 has no server-side account concept — the only durable identity material is the wrapped private key in IndexedDB, which `Wipe Private Key` already addresses. Row renders as "Coming soon".
- **No avatar upload / personalization.** The user-session-header renders a `<MaterialIcon>person</MaterialIcon>` placeholder. The mockup's photo is illustrative.
- **No "Verified Session" semantics beyond presence.** The pill renders whenever `IdentityContext.state.status === "unlocked"`. There is no verification ceremony — the pill exists to mirror the design.
- **No per-identity timeout.** The App Lock Timeout is a per-browser preference in `localStorage`; wiping or rotating an identity does NOT reset it. (Rotation will land later.)
- **No telemetry, no notifications, no toast on auto-lock.** When the idle timer fires, `IdentityContext.lock()` runs silently. The state-machine transition surfaces `<UnlockScreen>` on the next identity-gated route navigation. Locking is the message.
- **No keyboard-shortcut polish for opening Settings.** Slice 11 ships only the SideNav click. Cmd/Ctrl-comma is a follow-up.

## 4. UX

### 4.1 Identity gate

`/settings` is identity-gated like `/create`, `/contacts`, `/keys` (when an identity exists), `/links`. The `AuthenticatedShell` gate decides routing per identity state:

- `loading` → loading shell (existing behavior)
- `no_identity` → redirect to `/keys` (existing — the SetPassphraseScreen lives there)
- `locked` → redirect to `/keys` (existing — the UnlockScreen lives there)
- `unlocked` → render the page

`PATHS_WITH_OWN_IDENTITY_GATE` in `apps/web/src/auth/authenticated-shell.tsx` exempts `/keys` and `/create` from the shell's identity gate so they can render their own gate UI. **Do NOT add `/settings` to that list.** Settings has no in-page identity-state UI; it relies entirely on the shell's gate. If `AuthenticatedShell`'s default behavior is "any path not in the exempt list is gated," no constant change is required for Slice 11.

### 4.2 Page header

Inline at the top of the content column (not a `<TopAppBar>`):

```
Settings & Security
Configure institutional-grade protection for your encrypted vault.
```

Typography: `font-h1 text-h1 font-semibold` for the title, `font-body-md text-on-surface-variant` for the subtitle, matching `/links` and `/contacts` page headers.

### 4.3 User session header

Single `<GlassCard>` (or `<Surface>` — pick whichever matches `<MyKeysScreen>`'s identity card) with:

- Avatar slot: `<MaterialIcon name="person">` inside a `rounded-full border border-primary/20 bg-surface-container` circle.
- Label: `aesmsg` (the product brand, matching the mockup's placeholder name).
- Status pill: `text-emerald-500 border border-emerald-500/30` rounded-full uppercase pill reading `VERIFIED SESSION`.
- Activity duration: `Active for Xh Ym`, computed from `unlockedAt` and re-rendered every 60 seconds.

The duration string is computed inline; no separate utility unless reusable elsewhere. Re-render is driven by a 60-second `setInterval` inside the header component that bumps a state counter — the simplest mechanism and unaffected by render parents.

### 4.4 Device Security

Section heading: `<MaterialIcon name="shield_lock">` + `DEVICE SECURITY` (font-label-sm, uppercase, tracking-widest, text-on-surface-variant).

**Row 1 — Biometric Authentication** (Coming soon)

| Left | Right |
|---|---|
| `<p>Biometric Authentication</p>` `<p>Require FaceID or TouchID before accessing messages.</p>` | `<span class="font-label-sm text-on-surface-variant">Coming soon</span>` |

**Row 2 — App Lock Timeout** (live)

| Left | Right |
|---|---|
| `<p>App Lock Timeout</p>` `<p>Lock the vault after this much inactivity.</p>` | native `<select>` |

`<select>` options (value → label):

| value | label |
|---|---|
| `"never"` | `Never` |
| `"1m"` | `1 minute` |
| `"5m"` | `5 minutes` |
| `"15m"` | `15 minutes` |
| `"1h"` | `1 hour` |

Default: `"never"`. Styled to match `<TextInput>` (rounded, surface-container-low background, outline-variant border, on-surface text).

### 4.5 Key Management

Section heading: `<MaterialIcon name="vpn_key">` + `KEY MANAGEMENT`.

**Row 1 — Rotate Encryption Key** (Coming soon)
Description: `Generate a new primary keypair and replace your active identity.`

**Row 2 — Export Encrypted Backup** (Coming soon)
Description: `Download your wrapped private key as a password-protected JSON file.`

**Row 3 — Public Key Fingerprint** (live)
Reuses `<FingerprintDisplay>` for the fingerprint value. Trailing button uses `<MaterialIcon name="content_copy">` and calls `navigator.clipboard.writeText(fingerprint)`. On success: button content swaps to `<MaterialIcon name="check"> Copied` for 2 seconds, then reverts. No toast.

### 4.6 Danger Zone

Section heading: `<MaterialIcon name="warning">` + `DANGER ZONE` (text-error). Container: `border border-error/20 rounded-xl overflow-hidden`. Internal rows separated by `border-b border-error/10`.

**Row 1 — Wipe Private Key** (live)

| Left | Right |
|---|---|
| `<p class="text-error">Wipe Private Key</p>` `<p class="text-error/60">Irreversible. All encrypted messages addressed to this identity will become unreadable.</p>` | `<MaterialIcon name="delete_forever">` (acts as button; the entire row is clickable) |

Clicking the row opens `<WipeConfirmModal>` (existing component). On confirm, the modal calls `useIdentity().actions.wipe()`. The state machine handles the rest — `AuthenticatedShell` redirects to `/keys` for the post-wipe `<SetPassphraseScreen>`.

**Row 2 — Delete Account** (Coming soon)

| Left | Right |
|---|---|
| `<p class="text-error">Delete Account</p>` `<p class="text-error/60">Permanently erase server-side metadata.</p>` | `<span class="font-label-sm text-error/60">Coming soon</span>` |

### 4.7 SideNav

Existing `NAV_ITEMS` adds:

```ts
{ id: "settings", label: "Settings", href: "/settings", icon: "settings" }
```

Position: **last** (after Keys). The icon string maps to Material Symbols Outlined `settings`. `getActiveNavId` returns `"settings"` for any path starting with `/settings`.

## 5. App Lock Timeout — `useAppLockTimeout`

### 5.1 Setting persistence

Storage key: `aesmsg.app-lock-timeout`
Storage backend: `localStorage` (synchronous read, non-secret config, survives across tabs and reloads)
Value type: `"never" | "1m" | "5m" | "15m" | "1h"`
Default (unset or unparseable): `"never"`

The hook exposes:

```ts
function useAppLockTimeout(): {
  value: AppLockTimeout;
  setValue: (v: AppLockTimeout) => void;
}
```

`setValue` writes through to `localStorage` synchronously and updates React state. Other tabs are NOT actively synced via the `storage` event — Phase 1 simplification. A second tab will pick up the new value on its next mount or full reload.

### 5.2 Idle detection

Watched events on `window`: `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`. All five reset the idle timer. Listeners are attached only when `value !== "never"`.

Plus `visibilitychange` on `document`:

- On `hidden`: record `Date.now()` as `hiddenAt`. Do NOT fire `lock()` while hidden — the user may be on a different tab, not idle.
- On `visible`: compute `elapsed = Date.now() - hiddenAt`. If `elapsed >= timeoutMs` AND the timer would have fired during the hidden window, fire `lock()` immediately. Otherwise restart the timer with the remaining duration.

The timeout duration map:

| value | ms |
|---|---|
| `"never"` | n/a — no timer |
| `"1m"` | `60_000` |
| `"5m"` | `300_000` |
| `"15m"` | `900_000` |
| `"1h"` | `3_600_000` |

### 5.3 Lock trigger

When the idle timer fires: `useIdentity().actions.lock()`. Side effects from the `IdentityContext` provider:

- In-memory `unlocked` keypair is dropped.
- `state.status` transitions `unlocked` → `locked`.
- `AuthenticatedShell`'s existing redirect logic surfaces `<UnlockScreen>` on the next render of an identity-gated route.

No banner, no toast, no notification. The lock IS the message.

### 5.4 Mounting

Mount point: inside `AuthenticatedShell` (around the same level as `<IdentityProvider>` consumers — likely a sibling-of-children effect). One mount, present across all authenticated routes. The hook returns early (no listeners, no timer) when `state.status !== "unlocked"`.

### 5.5 Test plan for the hook

`apps/web/src/settings/use-app-lock-timeout.test.ts` (Vitest browser mode):

- "never" — no listeners attached, no timer scheduled, no `lock()` calls after any wait.
- "1m" + simulated keydown — timer resets; `lock()` not called within initial 60s after activity.
- "1m" + no activity for 60s — `lock()` called exactly once.
- "5m" + tab hidden for 2 minutes + visible again — timer does NOT fire while hidden, resumes with ~3 minutes remaining.
- "5m" + tab hidden for 6 minutes + visible again — `lock()` called on visibility return.
- value change `"5m"` → `"never"` — timer cancelled, listeners removed.
- value change `"never"` → `"5m"` — listeners attached, timer starts fresh.

Vitest fake timers (`vi.useFakeTimers()`) drive duration assertions. Visibility is simulated by dispatching `visibilitychange` events with `Object.defineProperty(document, "visibilityState", ...)`.

## 6. Components and files

### 6.1 New files

```
apps/web/app/(app)/settings/
└── page.tsx                                     (re-exports <SettingsScreen />)

apps/web/src/settings/
├── SettingsScreen.tsx                           (page-level component)
├── SettingsScreen.test.tsx                      (Vitest browser-mode)
├── DeviceSecuritySection.tsx                    (Biometric "Coming soon" + App Lock Timeout select)
├── KeyManagementSection.tsx                     (Rotate + Export "Coming soon" + Fingerprint+Copy)
├── DangerZoneSection.tsx                        (Wipe live row + Delete "Coming soon")
├── UserSessionHeader.tsx                        (Avatar + Verified Session pill + "Active for Xh Ym")
├── ComingSoonRow.tsx                            (shared row layout with right-aligned "Coming soon" tag)
├── use-app-lock-timeout.ts                      (the hook)
└── use-app-lock-timeout.test.ts                 (Vitest browser-mode)
```

### 6.2 Modified files

```
apps/web/src/lib/nav.ts                          (NAV_ITEMS append { id: "settings", ... })
apps/web/src/identity/IdentityContext.tsx        (add unlockedAt: Date to unlocked variant)
apps/web/src/auth/authenticated-shell.tsx        (mount useAppLockTimeout once at shell level)
```

(Exact filenames for `IdentityContext` and `authenticated-shell` may differ — match the repo's actual paths during implementation.)

### 6.3 Reused components

- `<GlassCard>` / `<Surface>` — section containers (whichever matches `<MyKeysScreen>` conventions)
- `<MaterialIcon>` — all icons
- `<FingerprintDisplay>` — public key fingerprint value
- `<Button variant="danger">` — Wipe row trigger (or the row itself is clickable; pick during implementation)
- `<WipeConfirmModal>` — existing, no changes
- Native `<select>` — App Lock Timeout (styled in Tailwind to match `<TextInput>`)

No changes to `@aesmsg/ui` are required for Slice 11. If `<DangerZone>`'s single-action shape feels too narrow, **inline** the Danger Zone container in `DangerZoneSection.tsx` rather than extending the shared component — extension is a separate refactor concern.

## 7. Testing

### 7.1 Unit / component tests

- `use-app-lock-timeout.test.ts` — listed in §5.5.
- `SettingsScreen.test.tsx`:
  - Renders all four sections with correct headings.
  - Biometric, Rotate, Export Backup, Delete Account rows render `Coming soon`.
  - App Lock Timeout `<select>` shows 5 options with `"never"` selected by default.
  - Changing the select calls `setValue` and persists to `localStorage`.
  - Public Key Fingerprint copy button calls `navigator.clipboard.writeText()` (mocked) and surfaces "Copied" for ≥1 render tick.
  - Wipe row click opens `<WipeConfirmModal>` (assert via the modal's `aria-label`).

### 7.2 Regression tests

- `MyKeysScreen.test.tsx` — still opens the wipe modal correctly. No behavioral change expected; this is a presence check.
- `AuthenticatedShell.test.tsx` (or equivalent) — confirms `useAppLockTimeout` does NOT crash on initial render in any identity state, and does NOT fire `lock()` while loading/no-identity/locked.

### 7.3 E2E (Playwright via Vitest browser mode)

- Setup a fresh identity → land on `/`, navigate to `/settings` via SideNav → assert sidebar `Settings` item is active and page title "Settings & Security" is visible.
- Change App Lock Timeout to `1 minute` → wait 65 seconds (use fake timer or actual wait — prefer fake) → navigate to any identity-gated route → confirm `<UnlockScreen>` is rendered.
- Click Wipe Private Key row → modal opens → type `WIPE` → confirm → identity wiped → redirected to `<SetPassphraseScreen>`.

### 7.4 Manual verification

- `pnpm dev`, log in, change App Lock Timeout to `1 minute`, switch to another tab for 90 seconds, come back, navigate — locked screen appears. Reset to "Never". Reload — value still "Never" (persistence).
- Verify accessibility: Tab order through Device Security → Key Management → Danger Zone is sensible; `<select>` has an associated label; "Coming soon" rows don't take focus (no interactive control).
- Verify visual fidelity against [`security_settings_aesmsg_2/screen.png`](../../../all_design_screens/security_settings_aesmsg_2/screen.png).

## 8. Security considerations

- **Auto-lock is best-effort, not a guarantee.** A page can be paused (e.g. inspector breakpoint) or the JS event loop starved; the timer is only reliable within normal-execution constraints. This is acceptable for an idle-lock convenience feature; it is not, and should never be presented as, a defense against an attacker with code-execution on the page.
- **Locking zeroes the in-memory keypair via `actions.lock()`.** The existing `IdentityContext` behavior. No new key-material handling in this slice.
- **The timeout preference is non-secret** and lives in `localStorage`. Reading or writing it requires same-origin JS, which is the same trust boundary as the rest of the app's client state.
- **Copy-to-clipboard** uses `navigator.clipboard.writeText`. The public key fingerprint is, by definition, public — no clipboard-clear policy is required for it. (The 30s clipboard-clear pattern applies to decrypted plaintext, not public keys.)
- **"Coming soon" rows** must not imply that the absent features are silently active. The copy must read as a clearly-future state, never as an enabled-but-empty toggle.

## 9. Migration & rollout

- No database migration. No `key-store` schema change. No API change.
- `IdentityContext`'s `unlockedAt` field is additive on an in-memory state variant; no persistence concerns.
- The new `localStorage` key is created on first opt-in; absence is treated as `"never"`, so existing users see no behavioral change after deploy.
- Rollout = ship the PR. No feature flag.

## 10. Open questions / follow-ups

- Once `<DangerZone>` is touched by a multi-row use case (e.g. when the real Delete Account ships), consider extending the shared component to accept a list of actions. Not required for Slice 11.
- The user-session-header "Active for Xh Ym" might want a "last activity" timestamp instead of "unlocked at" if we discover that "active" reads as "recently active" in user testing. Re-evaluate in a hardening pass.
- A future slice will introduce real `import` for backups; that slice should design the "identity already exists in this browser" branch carefully (silently overwrite? prompt to wipe first? merge?). Out of scope here.
