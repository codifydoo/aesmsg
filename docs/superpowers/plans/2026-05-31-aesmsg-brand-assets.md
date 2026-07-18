# aesmsg Brand Assets Implementation Plan

> **For agentic workers:** executed via superpowers:subagent-driven-development. Builds on the aesmsg rebrand branch `claude/hardcore-aryabhata-97a508` (PR #47, unmerged). Steps use checkbox syntax.

**Goal:** Implement the three delivered brand deliverables — logo, app icon, and launch/splash — into the web and mobile apps using the design tarball's finished assets.

**Architecture:** Assets are already vendored (commit `84886a9`): design source in `all_design_screens/brand_assets/` (+ `exports/` SVG/PNG source-of-truth), web icons in `apps/web/app/`, mobile PNGs in `apps/mobile/assets/`. Remaining work is code wiring. No SVG rasterizer is available locally and the project convention avoids `react-native-svg`, so: web renders the mark as inline-SVG React; mobile renders the brand mark (a stroked ring + vertical bar) with plain Views, and uses the pre-rendered PNGs for the app icon + native splash image.

**Tech Stack:** packages/ui (React DOM 19), apps/web (Next.js 16 app-router file-based icons), apps/mobile (Expo SDK 56, expo-splash-screen, RN Views/Animated).

## Design facts (from the deliverable)
- **Brand mark** (icon/logo/favicon): `fill=none; stroke; stroke-width=8` on viewBox `12 16 68 68` — `<circle cx=46 cy=50 r=26/>` + `<line x1=72 y1=24 x2=72 y2=76/>`. Colors: violet `#cfbcff`, ink `#e9e6f0`, dark `#2a2533`, or `currentColor`.
- **Lockup**: mark + `aesmsg` in **Inter 500, letter-spacing ≈ -0.035em**, color ink `#e9e6f0` (on dark) / `#2a2533` (on light) / violet (mono). viewBox `0 0 576 168`.
- **favicon.svg**: `<rect width=64 height=64 rx=14 fill=#141218/>` + the violet mark `translate(6.7 4.5) scale(0.55)`.
- **Splash** (`aesmsg-splash.html`, mobile): bg `#141218`; centered mark (≈23vmin) + wordmark `aesmsg` (Geist/Inter 500, font-size 8.6vmin, letter-spacing -0.035em, color `#e6e0e9`) lifted to 45% vertical; soft radial violet glow (`#6750a4`); 4 faint concentric rings (violet at 0.07/0.05/0.035/0.022 alpha, sizes 50/72/98/128 vmin); bottom: tagline `end-to-end encrypted` (muted `#948e9c`, letter-spacing 0.32em) + slim animated loader bar (violet sweep, 1.7s). Note: the splash HTML's hero glyph is an alternate filled "keyhole-aperture a"; we render the **canonical brand mark (ring+bar)** instead for icon/splash consistency and to avoid react-native-svg — documented deviation.

---

## Task 1: Web — Logo component + favicon wiring

**Files:**
- Create: `packages/ui/src/Logo.tsx`, `packages/ui/tests/Logo.test.tsx`
- Modify: `packages/ui/src/index.ts` (export Logo), `packages/ui/src/TopAppBar.tsx` (use Logo)
- Already placed: `apps/web/app/icon.svg`, `apps/web/app/apple-icon.png` (Next auto-links these).

- [ ] **Step 1: Write `Logo.tsx`** — a React component with props `{ variant?: "mark" | "lockup"; tone?: "violet" | "ink" | "dark" | "currentColor"; size?: number; className?: string; title?: string }`. Default `variant="lockup"`, `tone="currentColor"`. Render inline `<svg>` exactly matching the design: mark = `<g fill="none" stroke={color} stroke-width="8" stroke-linecap="butt"><circle cx="46" cy="50" r="26"/><line x1="72" y1="24" x2="72" y2="76"/></g>` on `viewBox="12 16 68 68"`. For `lockup`, render the mark + the text `aesmsg` (Inter 500, letter-spacing -0.035em) — either as a flex row of the mark SVG + a styled `<span>`, or the single combined `viewBox="0 0 576 168"` SVG with `<text>`. Tone→color map: violet `#cfbcff`, ink `#e9e6f0`, dark `#2a2533`, currentColor `currentColor`. Accessible: `role="img"` + `aria-label={title ?? "aesmsg"}`.
- [ ] **Step 2: Test** — render `<Logo/>` (browser vitest, like other ui tests) asserting: the svg renders, `aria-label="aesmsg"` present, mark variant renders the circle, lockup renders the `aesmsg` text. Run `pnpm --filter @aesmsg/ui test`.
- [ ] **Step 3: Export** from `packages/ui/src/index.ts`.
- [ ] **Step 4: Wire `TopAppBar.tsx`** — replace the plain `<div>aesmsg</div>` wordmark with `<Logo variant="lockup" tone="currentColor" />` (or mark + text), preserving the existing classes/layout. Keep it visually equivalent to the design lockup.
- [ ] **Step 5: typecheck + lint + ui test** green. Commit `feat(web): aesmsg Logo component + favicon, wired into TopAppBar`.

## Task 2: Mobile — app icon + native splash config

**Files:**
- Modify: `apps/mobile/app.config.ts`, `apps/mobile/package.json` (add `expo-splash-screen`)
- Already placed: `apps/mobile/assets/{icon.png,adaptive-icon.png,splash-mark.png,favicon.png}`.

- [ ] **Step 1: Add icon + splash to `app.config.ts`** (ExpoConfig): top-level `icon: "./assets/icon.png"`; `ios.icon` (or rely on top-level); `android.adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#141218" }`; `web.favicon: "./assets/favicon.png"`. Add the `expo-splash-screen` plugin to the `plugins` array with `{ image: "./assets/splash-mark.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#141218" }`.
- [ ] **Step 2: Add dep** `expo-splash-screen` (SDK-56-compatible version) to `apps/mobile/package.json`; `pnpm install`.
- [ ] **Step 3: typecheck** (`pnpm --filter @aesmsg/mobile typecheck`) green. Commit `feat(mobile): app icon + native splash config`.

## Task 3: Mobile — upgrade existing `SplashBrand` to the real mark + animated launch design

**Context:** `apps/mobile/src/system/SplashBrand.tsx` ALREADY EXISTS and is ALREADY wired into `App.tsx:72` (rendered at `state.status === "loading"` during the keystore probe, with a `slowProbe` prop revealing a "Checking your keys" label). Today it shows a Material `lock` glyph + `aesmsg` wordmark. This task replaces the lock glyph with the real brand mark and enriches the composition to match `aesmsg-splash.html` — WITHOUT changing its public API (`SplashBrandProps { slowProbe?: boolean }`) so `App.tsx` needs no change. Mobile theme tokens to use: `colors.primary` `#cfbcff` (mark), `colors.primaryContainer` `#6750a4` (glow), `colors.onSurface` `#e6e0e9` (wordmark), `colors.outline` `#948e9c` (tagline), `colors.background` `#141218`. No `react-native-svg` (project convention) — build the mark from Views.

**Files:**
- Create: `apps/mobile/src/system/BrandMark.tsx` (the ring+bar mark via Views) + `apps/mobile/src/system/brand-mark-geometry.ts` (pure proportion math) + its test `apps/mobile/tests/brand-mark-geometry.test.ts` (node-env, per the mobile test convention).
- Modify: `apps/mobile/src/system/SplashBrand.tsx` (compose mark + glow + rings + wordmark + tagline + loader), `apps/mobile/src/system/index.ts` (export BrandMark if useful elsewhere e.g. Keys/Onboarding).

- [ ] **Step 1: `brand-mark-geometry.ts` (pure, testable)** — given a target `size`, return the View dimensions for the mark faithful to `viewBox 12 16 68 68` (content box 68×68 starting at 12,16). Export e.g. `markGeometry(size) → { ring: {d, borderWidth, left, top}, bar: {w, h, left, top, radius} }`. Stroke width scales as `8/68 * size`; ring diameter `52/68 * size` (r=26 → d=52) centered at content (cx=46,cy=50 → relative to viewBox origin 12,16); bar at x=72 (width 8 → but it's a `<line>` of stroke-width 8, so bar width = strokeWidth, height = 76-24 = 52, centered y=50). Compute left/top offsets so ring + bar sit in a `size`×`size` box matching the SVG. Keep it pure (no RN import) so it unit-tests in node.
- [ ] **Step 2: Test `brand-mark-geometry.ts`** — assert stroke width = `size*8/68`, ring diameter = `size*52/68`, bar height = `size*52/68`, and the bar sits to the right of the ring (bar.left > ring.left + ring.d). Run `pnpm --filter @aesmsg/mobile test brand-mark-geometry`.
- [ ] **Step 3: `BrandMark.tsx`** — props `{ size?: number; color?: string }` (default `size=68`, `color=colors.primary`). Use `markGeometry(size)` to render a ring View (square, `borderRadius=half`, `borderWidth`, `borderColor=color`, transparent fill) + a vertical bar View (`backgroundColor=color`, rounded) in a `size`×`size` container. `accessibilityRole="image"`, `accessibilityLabel="aesmsg"`.
- [ ] **Step 4: Enrich `SplashBrand.tsx`** — keep `SplashBrandProps { slowProbe?: boolean }` and the root `#141218`. Replace the `<Icon name="lock">` with `<BrandMark size={64} color={colors.primary} />`. Add (all via Views, no new deps): a soft glow (a large `colors.primaryContainer` circle View at low opacity ~0.18 behind center, blurred-look via large size + low alpha — documented approximation of the radial gradient); 3–4 concentric ring Views (borderColor `colors.primary` at alpha ~0.07/0.05/0.035/0.022, sizes scaled off screen `Dimensions`); the `aesmsg` wordmark (`type.h1`/display, `colors.onSurface`); and a bottom block with the tagline `end-to-end encrypted` (`colors.outline`, letter-spacing wide, NOT uppercased) + a slim **Animated** loader bar (violet sweep, ~1.7s `Animated.loop`, translateX). Keep the optical lift (~45% / marginTop). Preserve `slowProbe` → still shows "Checking your keys" (can coexist with or replace the loader; keep both behaviors sane). Respect reduce-motion if trivially available (`AccessibilityInfo`), else the loader animation is acceptable as the design's intended motion.
- [ ] **Step 5: typecheck + mobile test** green (`pnpm --filter @aesmsg/mobile typecheck` + `test`). `App.tsx` unchanged (same `<SplashBrand />` call site). Commit `feat(mobile): upgrade launch splash to aesmsg brand mark + animated design`.

## Task 4: Verify + finish
- [ ] `pnpm typecheck && pnpm lint && pnpm test` — all green except the known pre-existing 2 web `node:crypto` suites.
- [ ] Web preview: screenshot the app showing the Logo in the TopAppBar + favicon in the tab.
- [ ] Update `all_design_screens/aesmsg_proposed_screen_list.md` to mention `brand_assets/`.
- [ ] Push to `claude/hardcore-aryabhata-97a508` (flows into PR #47).

## Manual follow-ups (dev-only)
- Mobile needs a **clean native rebuild** (expo-splash-screen is a native module + new icon assets) — use the iOS build recipe in memory.
