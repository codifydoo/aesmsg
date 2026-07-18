# Slice 3 — Identity bootstrap UI (web)

**Date:** 2026-05-09
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** [Slice 1 crypto-core spec](2026-05-09-crypto-core-design.md), [Slice 2 key-store spec](2026-05-09-key-store-design.md), [project init spec](2026-05-09-project-init-design.md)

## 1. Context

Slices 1 and 2 shipped the cryptographic foundation: `@aesmsg/crypto` (HPKE seal/open + identity + fingerprint + Argon2id wrap/unwrap) and `@aesmsg/key-store` (IndexedDB-backed persistence of wrapped identities). Slice 3 puts the first user-facing surface on top: the **identity bootstrap UI** — first-visit "create your identity," returning-visit "unlock your identity," and the standalone `/keys` management page that displays the public key + fingerprint + QR.

This is the smallest end-to-end vertical that produces something a person can use: visit the app, set a passphrase, see your fingerprint, share your public key. It has zero backend dependencies (no API, no Postgres, no Redis) — Slice 4 lands the backend storage layer; Slices 5 and 6 build sender and recipient flows on top of both.

Slice 3 also lays down the first batch of typed React components in `packages/ui/`, migrated from the existing HTML mockups in `all_design_screens/`. Subsequent slices reuse these.

## 2. Goals

- Refactor `fingerprint()` in `@aesmsg/crypto` to produce the canonical `SM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` format mandated by the design system. Add a `truncateFingerprint(fp, groups)` helper for the condensed display used on the web "My Keys" mockup.
- Author three new HTML mockups in `all_design_screens/` for screens that were missing: `set_passphrase_aesmsg/`, `unlock_passphrase_aesmsg/`, `wipe_identity_confirm_aesmsg/`. Hand them to the user for review before any React work starts.
- Migrate `my_security_keys_aesmsg/` (the existing web "My Keys" mockup) and the three new mockups into typed, tested React components in `packages/ui/`.
- Build the `/keys` route in `apps/web` and a tab-scoped React identity context that orchestrates the bootstrap state machine: `loading → no_identity → locked → unlocked`.
- Wire the UI to `@aesmsg/crypto` + `@aesmsg/key-store` for real generate / wrap / save / load / unwrap / wipe operations.
- Test the full vertical in headless Chromium via Vitest browser mode.

## 3. Non-goals

- **No backend.** No API routes, no Sproobo Postgres, no Redis, no rate limiting. Slice 4.
- **No `/create`, `/dashboard`, `/links`, `/contacts`, `/m/:id` pages.** Slices 5+.
- **No mobile app changes.** `apps/mobile/` stays a `DECISION-DEFERRED.md` marker.
- **No persistent unlock across tab close.** The unwrapped key lives in tab memory only; closing the tab returns the user to the locked state on next visit. This is the security model, not an oversight.
- **No passphrase strength meter or entropy hints.** Out of scope. Slice 3 enforces a 12-char minimum at setup time and nothing more.
- **No Web Share API integration.** "Share Public Key" copies the `amk1:` string to the clipboard; share-sheet integration is a future enhancement.
- **No identity rotation, multi-device sync, or backup export.** Phase 2/3.
- **No "Forgot passphrase" recovery.** Intentional non-feature.
- **No internationalization beyond English.** UI strings are inline; an i18n framework arrives if we ever ship multi-language.

## 4. Fingerprint format change (`@aesmsg/crypto`)

### 4.1 Old format (Slices 1–2)

```
xxxx xxxx xxxx xxxx xxxx xxxx
```

24 lowercase base32 characters in 6 groups of 4, space-separated. 120 bits of fingerprint entropy from SHA-256 of the canonical pubkey bytes.

### 4.2 New format (Slice 3)

```
SM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
```

42 characters: literal `SM-` prefix (3 chars) + 32 uppercase hex characters in 8 groups of 4, dash-separated (32 + 7 inter-group dashes = 39 chars). 128 bits of entropy (first 16 bytes of `SHA-256(canonical pubkey bytes)`).

### 4.3 Implementation

```ts
const FINGERPRINT_BYTES = 16;          // up from 15
const FINGERPRINT_PREFIX = "SM-";
const HEX_GROUP_SIZE = 4;
const HEX_GROUP_COUNT = 8;

export async function fingerprint(pk: PublicKeyString): Promise<Fingerprint> {
  const { canonical } = decodePubkey(pk);
  const buf = new ArrayBuffer(canonical.byteLength);
  new Uint8Array(buf).set(canonical);
  const digestAb = await crypto.subtle.digest("SHA-256", buf);
  const digest = new Uint8Array(digestAb).slice(0, FINGERPRINT_BYTES);
  const hex = bytesToUpperHex(digest);                                   // 32 chars
  const groups: string[] = [];
  for (let i = 0; i < HEX_GROUP_COUNT; i++) {
    groups.push(hex.slice(i * HEX_GROUP_SIZE, (i + 1) * HEX_GROUP_SIZE));
  }
  return (FINGERPRINT_PREFIX + groups.join("-")) as Fingerprint;
}

export function truncateFingerprint(fp: Fingerprint, groups: number): string {
  // Strip "SM-", take first `groups * 4` hex chars, format with spaces.
  const body = (fp as string).slice(FINGERPRINT_PREFIX.length).replace(/-/g, "");
  const out: string[] = [];
  for (let i = 0; i < groups; i++) {
    out.push(body.slice(i * HEX_GROUP_SIZE, (i + 1) * HEX_GROUP_SIZE));
  }
  return out.join(" ");
}
```

`Fingerprint` brand stays the same. `compareFingerprint` stays the same (constant-time string compare; works over the new format unchanged because it only compares character-by-character). `bytesToUpperHex` is a small vendored helper next to the existing `base32EncodeLower` in `wire.ts`.

The base32 helper is **kept** in `wire.ts` because it is unused after Slice 3 only by the fingerprint code — but we keep it on the assumption Slice 4+ may want it. (If it's still unused after Slice 6, we delete it then.)

### 4.4 Test impact

`fingerprint.test.ts` — every existing case's expected format string updates:

- Format regex changes from `/^[a-z2-7]{4} ([a-z2-7]{4} ){4}[a-z2-7]{4}$/` to `/^SM-[0-9A-F]{4}(-[0-9A-F]{4}){7}$/`.
- Length assertion changes from `29` to `42`.
- Stability test still passes (deterministic hash → deterministic format).
- Distinguishability test still passes (50 random keypairs → 50 unique fingerprints; collision probability over 128 bits is irrelevant).
- `compareFingerprint` cases stay literal-string comparisons; only the test fixture values update.

New test file or new `describe` block: **`truncateFingerprint`**.

```ts
expect(truncateFingerprint("SM-A91C-22F0-78BB-19D2-..." as Fingerprint, 4)).toBe("A91C 22F0 78BB 19D2");
expect(truncateFingerprint("SM-A91C-22F0-78BB-19D2-..." as Fingerprint, 1)).toBe("A91C");
expect(truncateFingerprint(/* full 8-group fp */, 8)).toBe(/* 8 space-separated groups */);
```

Coverage stays ≥95% on `packages/crypto/src/`.

## 5. New mockups (`all_design_screens/`)

Three new folders, each containing a single `code.html` (no `screen.png` — visual review happens by opening the HTML). All three follow the existing convention: Tailwind via CDN, design tokens inlined into the `tailwind.config` block, Material Symbols Outlined for icons, Geist / Inter / JetBrains Mono fonts. Same dark-first palette, same glass-card visual language, same depth-via-luminance-not-shadow rule.

### 5.1 `set_passphrase_aesmsg/code.html`

Full-screen, centered, on `bg-background`. One `<main>` with a max-width-md `glass-card` block.

- `h1` (`font-display`, `text-display`) — "Create your identity"
- `p` (`text-on-surface-variant`, `font-body-md`) — "Choose a passphrase. Your private key is wrapped with it locally — we never see it."
- Two `<input type="password">` fields (passphrase, confirm passphrase). Inputs styled per design tokens: `bg-surface-container`, `border-outline-variant/30`, `rounded-lg`, `px-md py-sm`, focus ring uses `border-primary`.
- Inline error region beneath inputs (`text-error`, `font-label-sm`, hidden by default; reserved for "must be at least 12 characters" / "passphrases do not match").
- Primary button — full width, gradient, `text-on-primary-container`, `font-semibold`, `rounded-lg`, `h-12`. Label: "Create identity".
- Below the card, an info pill (the same pattern as `my_security_keys_aesmsg`'s "Your private key never leaves this device" assurance) explaining: "Argon2id memory-hard derivation. Forgotten passphrase = unrecoverable. No fallback by design."

### 5.2 `unlock_passphrase_aesmsg/code.html`

Same shell as set-passphrase. Differences:

- `h1` — "Unlock your identity"
- `p` — "Enter your passphrase to decrypt your private key for this session."
- One `<input type="password">` (passphrase only — no confirm).
- Inline error: "Wrong passphrase" (red `text-error` styling).
- Primary button: "Unlock".
- Below the card, a destructive-looking link styled `text-error` `text-label-sm hover:text-error/80`: "Wipe and start over →". (Routes to wipe-confirm.)

### 5.3 `wipe_identity_confirm_aesmsg/code.html`

Modal overlay. Backdrop: `bg-background/80 backdrop-blur-sm fixed inset-0`. Modal: a centered `glass-card` with `border-error/30` accent (per the existing Danger Zone red treatment in `my_security_keys_aesmsg`).

- `h2` (`text-error`, `font-h2`) — "Wipe Private Key"
- Body — "All encrypted messages addressed to this identity will become unreadable forever. This cannot be undone."
- Type-to-confirm: a small `<input type="text">` requiring the user to type `WIPE` exactly.
- Footer with two buttons: "Cancel" (secondary) and "Wipe Private Key" (`bg-error text-on-error`, disabled until the input value equals "WIPE").

### 5.4 Author + review flow

I write the three `code.html` files in this slice's first phase, commit them, and pause for the user to review the rendered HTML in a browser before any React work starts. If revisions are requested, they happen at the HTML level (cheap to iterate), not after React migration.

## 6. UI components (`packages/ui/`)

Each component lives in its own file under `packages/ui/src/`, exported from a barrel `index.ts`. All components consume tokens from `@aesmsg/design-tokens/theme.css` (already imported by `apps/web/app/globals.css`). No hardcoded colors or spacing.

### 6.1 Component inventory

| Component | File | Purpose |
|---|---|---|
| `Surface` | `src/Surface.tsx` | Background canvas: dark `bg-background`, sets `font-body-md text-on-surface`. Used as the page wrapper. |
| `GlassCard` | `src/GlassCard.tsx` | The glass-card pattern from the mockups. `className` extends. |
| `Button` | `src/Button.tsx` | Variants: `primary` (gradient), `secondary` (surface-container with border), `danger` (`bg-error`). `icon?` slot, `loading?` flag. Native `<button>` props. |
| `PasswordInput` | `src/PasswordInput.tsx` | Wraps `<input type="password">` with the input styling, label, error slot. |
| `TextInput` | `src/TextInput.tsx` | Same shape, `type="text"`. Used for the WIPE-confirmation input. |
| `MaterialIcon` | `src/MaterialIcon.tsx` | Wraps `<span class="material-symbols-outlined">` with a `name: string` prop and `filled?: boolean`. |
| `FingerprintDisplay` | `src/FingerprintDisplay.tsx` | Renders a `Fingerprint` in `JetBrains Mono` on a `bg-surface-container-lowest` block, with a copy button on the right. `truncate?: number` displays only the first N groups in `truncateFingerprint` form. |
| `QrCodePreview` | `src/QrCodePreview.tsx` | Renders a QR of the given string inside the white-card frame from the mockup. SVG only (no canvas). |
| `DangerZone` | `src/DangerZone.tsx` | The error-bordered block from `my_security_keys_aesmsg`. Props: `title`, `description`, `actionLabel`, `onAction`. |
| `TopAppBar` | `src/TopAppBar.tsx` | Header from the mockup. Renders the aesmsg wordmark + a slot for nav. |
| `SideNav` | `src/SideNav.tsx` | The sidebar from `my_security_keys_aesmsg`. `items: SideNavItem[]`, `activeId: string`. Hidden below `md` breakpoint. |
| `Modal` | `src/Modal.tsx` | The backdrop + centered card primitive used by `wipe_identity_confirm_aesmsg`. |

### 6.2 QR rendering

`@aesmsg/ui` adds `qrcode` (npm) as a runtime dependency. `<QrCodePreview value={amk1String} />` calls `QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M' })` and renders the resulting SVG via `dangerouslySetInnerHTML`.

QR module compatibility:
- The `qrcode` package works in Node and browser.
- Tests in browser mode call the same code path as runtime.
- Note: The QR encodes the entire `amk1:...` string. Total payload ≈ 51 chars, well under any QR module's capacity at error-correction level M.

### 6.3 Public API surface

`packages/ui/src/index.ts` re-exports every component as a named export. No default exports. No barrel-of-barrels — one flat list keeps imports unambiguous.

```ts
export { Surface } from "./Surface.js";
export { GlassCard } from "./GlassCard.js";
export { Button } from "./Button.js";
// … etc
```

### 6.4 Tests

One test file per component under `packages/ui/tests/<Component>.test.tsx`. Browser-mode only (Vitest browser + Playwright + headless Chromium — same setup as crypto/key-store). Each component test asserts the right Tailwind classes are applied for each variant and that callback props fire on user interaction.

`<FingerprintDisplay>`: assert canonical full form (`SM-XXXX-...`) renders, `truncate={4}` renders 4 space-separated groups with no `SM-` prefix, copy button writes the canonical form to `navigator.clipboard`.

`<QrCodePreview>`: assert an `<svg>` element is rendered and the `viewBox` attribute is present (smoke test that QR generation produced output).

Coverage gate: ≥85% lines on `packages/ui/src/`. Components have lots of branching JSX paths; 95% is overkill at this point.

## 7. `apps/web` integration

### 7.1 Route layout

Next.js 16 app router (`apps/web/app/`). New files:

```
apps/web/
├─ app/
│  ├─ layout.tsx                  (modified — wraps children in IdentityProvider)
│  ├─ page.tsx                    (untouched landing placeholder)
│  └─ keys/
│     └─ page.tsx                 (new — the /keys route)
├─ src/
│  ├─ lib/
│  │  └─ identity-context.tsx     (new — IdentityProvider + state machine)
│  └─ hooks/
│     └─ use-identity.ts          (new — re-exports the context hook)
```

### 7.2 Identity state machine

`apps/web/src/lib/identity-context.tsx`:

```ts
export type IdentityState =
  | { status: "loading" }
  | { status: "no_identity" }
  | { status: "locked"; storedIdentity: StoredIdentity }
  | { status: "unlocked"; storedIdentity: StoredIdentity; identity: IdentityKeypair };

export interface IdentityActions {
  unlock(passphrase: string): Promise<void>;             // throws BadPassphraseError
  setupNew(passphrase: string, label?: string): Promise<void>;
  lock(): void;
  wipe(): Promise<void>;
}
```

Transitions:

- Mount → state = `loading`. Read `hasIdentity('primary')` from key-store.
  - If false → `no_identity`.
  - If true → `loadIdentity('primary')` → `locked` with the stored record (public key + wrapped blob; private key not yet decrypted).
- `setupNew(passphrase, label)`:
  - state must be `no_identity`.
  - generate new `IdentityKeypair`, wrap with passphrase, save to store, set state = `unlocked`.
- `unlock(passphrase)`:
  - state must be `locked`.
  - call `unwrapPrivateKey(stored.wrapped, passphrase)`. On `BadPassphraseError`, re-throw to caller (UI shows inline error; state stays `locked`).
  - On success, set state = `unlocked`.
- `lock()`:
  - state must be `unlocked`. Drop the in-memory `identity`, transition to `locked`. (For Slice 3 there's no UI surface that calls this — it's reserved for the eventual auto-lock UI.)
- `wipe()`:
  - state may be `locked` or `unlocked`. Calls `deleteIdentity('primary')`, transitions to `no_identity`.

`IdentityProvider` is a Client Component (`"use client"` directive) since `@aesmsg/key-store` requires `IndexedDB` (browser-only). The root `app/layout.tsx` wraps `{children}` in it.

### 7.3 `/keys` page

`apps/web/app/keys/page.tsx` is a Client Component that consumes `useIdentity()` and renders by state:

- `loading` → `<Surface>` with a centered spinner.
- `no_identity` → `<SetPassphraseScreen onSubmit={setupNew} />`.
- `locked` → `<UnlockScreen onUnlock={unlock} onWipe={openWipeModal} />`.
- `unlocked` → `<MyKeysScreen identity={state.storedIdentity} onWipe={openWipeModal} />`.

Where:

- `<SetPassphraseScreen>` renders the migrated `set_passphrase_aesmsg` mockup. Local state for the two passphrase fields. On submit: validate (≥12 chars, fields match), call `setupNew`. The button shows a `loading` indicator while Argon2id is running (~300–800 ms).
- `<UnlockScreen>` renders the migrated `unlock_passphrase_aesmsg` mockup. On submit: call `unlock`. On `BadPassphraseError`, set local error state to "Wrong passphrase". Wipe link opens the wipe modal.
- `<MyKeysScreen>` renders the migrated `my_security_keys_aesmsg` mockup using the StoredIdentity's `publicKeyString`. The `<FingerprintDisplay>` is rendered with `truncate={4}` per the design.
- `<WipeConfirmModal>` renders the migrated `wipe_identity_confirm_aesmsg` mockup. Active when `wipeOpen === true`. On confirm: call `wipe()`, close modal.

These screen-level components live in `apps/web/app/keys/` (per Next.js convention for route-local components — they're not reusable enough to live in `packages/ui/`). They orchestrate `packages/ui/` primitives with state and side effects.

### 7.4 Share Public Key behaviour

The "Share Public Key" button on `<MyKeysScreen>` calls `navigator.clipboard.writeText(storedIdentity.publicKeyString)` and surfaces a transient confirmation ("Copied to clipboard"). Web Share API integration is deliberately deferred.

### 7.5 First-visit detection scope

For Slice 3, only `/keys` invokes the bootstrap flow. The landing page `/` stays public and unaware. Subsequent slices add a route-level guard (likely a layout-level wrapper) that redirects authenticated routes to `/keys` when there is no identity.

## 8. Tests for `apps/web`

Browser mode via Vitest + Playwright (set up in Slice 1 for `@aesmsg/crypto`; `apps/web` reuses the same toolchain).

### 8.1 `useIdentity` state-machine tests

`apps/web/tests/use-identity.test.tsx`:

- Mounts `IdentityProvider` with a fresh IndexedDB → state transitions `loading → no_identity`.
- After `setupNew('twelve chars+')` → `unlocked`, `exportPublicKey(state.identity)` matches the stored record's `publicKeyString`.
- Re-mount with the same IndexedDB but a fresh provider → `loading → locked`.
- `unlock` with wrong passphrase → still `locked`, re-throws `BadPassphraseError`.
- `unlock` with right passphrase → `unlocked`.
- `lock` from `unlocked` → `locked`, no IndexedDB writes.
- `wipe` from any → `no_identity`, IndexedDB record gone.

### 8.2 End-to-end happy-path test

`apps/web/tests/keys-page.e2e.test.tsx`:

1. Render `<IdentityProvider><KeysPage /></IdentityProvider>` in a fresh browser context.
2. Wait for set-passphrase form. Fill in passphrase + confirm.
3. Click "Create identity". Wait for the unlocked view.
4. Assert `<FingerprintDisplay>` renders something matching `/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/` (the truncated 4-group form).
5. Reload the IdentityProvider in the same IndexedDB context. Assert "Unlock" form appears.
6. Submit wrong passphrase → inline error. Submit right passphrase → unlocked view returns with the same fingerprint.
7. Click "Wipe Private Key" → modal opens. Type "WIPE", click confirm. Assert the set-passphrase form is back.

### 8.3 Component-level snapshot tests in `packages/ui/`

One per component. See §6.4.

### 8.4 Coverage gates

- `@aesmsg/crypto`: ≥95% lines (unchanged).
- `@aesmsg/key-store`: ≥95% lines (unchanged).
- `@aesmsg/ui`: ≥85% lines.
- `apps/web/src/`: ≥80% lines. Setup-and-teardown JSX in route components is hard to cover comprehensively; tightening can wait.

## 9. Definition of done

- `pnpm typecheck` clean across all workspaces.
- `pnpm lint` clean.
- `pnpm test` runs Node + browser-mode tests for every workspace, all green.
- `@aesmsg/crypto` fingerprint format is the new `SM-XXXX-...` form; all related tests updated.
- Three new mockups exist in `all_design_screens/` and have been reviewed by the user.
- Twelve new components exist in `packages/ui/` with passing tests.
- `pnpm dev` boots `apps/web`. Visiting `http://localhost:3000/keys` shows the bootstrap flow on a fresh browser; entering a passphrase creates an identity; reloading the tab shows the unlock flow; entering the same passphrase restores the unlocked view; wiping restores the bootstrap flow.
- README updates: `packages/ui/README.md` documents the component catalogue. `packages/crypto/README.md` updates the fingerprint section to the new format.
- A short note in `apps/web/CLAUDE.md` (or a new `apps/web/AGENTS.md` section) explaining the identity context, how routes hook into it, and the "passphrase every fresh tab" security model.

## 10. Risks and mitigations

- **Mockup drift between mobile (`my_identity_aesmsg`) and web (`my_security_keys_aesmsg`).** The mobile shows full 8-group fingerprint with `SM-` prefix; the web shows 4 groups with no prefix. Mitigation: both views render from the same canonical fingerprint via `truncateFingerprint`. Web's `<FingerprintDisplay truncate={4}>` matches the mockup; mobile (when built later) uses the full form.
- **Argon2id wasm cost on bootstrap.** First identity creation runs Argon2id at m=64 MiB, t=3, p=1, which can take 300–800 ms. UI shows a loading state on the button. Mitigation built into `<Button loading>`.
- **IndexedDB quota / private browsing.** The key-store throws `IndexedDBUnavailableError` in private modes. Mitigation: `<KeysPage>` catches it and renders a "this app needs IndexedDB; private browsing may be blocking it" error surface. (We only render this when state is `loading` and the load promise rejected with `IndexedDBUnavailableError`.)
- **`navigator.clipboard.writeText` requires HTTPS or localhost.** Standard. Local dev runs on `http://localhost:3000` which is fine. Production runs on Sproobo over HTTPS. No mitigation needed.
- **QR code module variability.** The `qrcode` package is mature; SVG output is stable across versions. Pin the major in `packages/ui/package.json`.
- **State-machine race conditions.** `setupNew` and `unlock` are async and the user might submit twice. Mitigation: the form's submit handler checks a local `submitting` flag and short-circuits re-submits.
- **Component test coverage on QR/Material Symbols.** Material Symbols are a font; Vitest browser tests don't necessarily render them. Mitigation: assert the wrapping `<span class="material-symbols-outlined">` exists with the right inner text; do not assert visual rendering of the glyph.

## 11. Out of scope for this spec

Anything backend, anything mobile, anything multi-identity, anything related to `/create`, `/m/:id`, contacts, dashboard, sender or recipient flows, key rotation, multi-device sync, or recovery.
