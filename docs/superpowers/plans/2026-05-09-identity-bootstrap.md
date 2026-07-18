# Slice 3 — Identity bootstrap UI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `@aesmsg/crypto`'s fingerprint format to match the design system, author three missing mockups in `all_design_screens/`, populate `packages/ui/` with the first batch of typed React components migrated from those mockups, and wire `apps/web` to an identity bootstrap state machine that lets a fresh user create, unlock, and wipe their identity at `/keys` against IndexedDB-backed `@aesmsg/key-store`.

**Architecture:** Three concentric layers. Innermost: a small `@aesmsg/crypto` change (fingerprint encoding swap + helper). Middle: `packages/ui/` gains 12 components (`Surface`, `GlassCard`, `Button`, `TextInput`, `PasswordInput`, `MaterialIcon`, `FingerprintDisplay`, `QrCodePreview`, `DangerZone`, `Modal`, `TopAppBar`, `SideNav`) — pure-presentation, browser-tested. Outermost: `apps/web` wraps a tab-scoped `IdentityProvider` around the app, the `/keys` route renders the bootstrap state machine (`loading → no_identity → locked → unlocked`), and the four route screens (`SetPassphraseScreen`, `UnlockScreen`, `MyKeysScreen`, `WipeConfirmModal`) compose `packages/ui/` primitives with state and side effects.

**Tech Stack:** Existing — Next.js 16 (app router, RSC + Client Components), React 19, Tailwind 4 + `@aesmsg/design-tokens`, Biome, Vitest (Node + browser modes via `@vitest/browser` + Playwright). New for this slice — `qrcode` (npm, runtime dep of `packages/ui/`), `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` (devDeps for component and route tests).

**Spec:** [docs/superpowers/specs/2026-05-09-identity-bootstrap-design.md](../specs/2026-05-09-identity-bootstrap-design.md)

---

## File structure target

After this plan completes:

```
all_design_screens/                            (3 new mockup folders)
├─ set_passphrase_aesmsg/code.html          (new)
├─ unlock_passphrase_aesmsg/code.html       (new)
└─ wipe_identity_confirm_aesmsg/code.html   (new)

packages/crypto/
├─ src/
│  ├─ fingerprint.ts                           (modified — SM-XXXX-... format + truncateFingerprint)
│  ├─ wire.ts                                  (modified — add bytesToUpperHex helper)
│  └─ index.ts                                 (modified — export truncateFingerprint)
├─ tests/
│  └─ fingerprint.test.ts                      (modified — new format expectations + truncateFingerprint cases)
└─ README.md                                   (modified — fingerprint section)

packages/ui/
├─ package.json                                (modified — add qrcode, RTL deps; add browser test scripts)
├─ tsconfig.json                               (modified — DOM lib + jsx)
├─ vitest.config.ts                            (new — browser-mode config matching key-store)
├─ src/
│  ├─ index.ts                                 (modified — barrel exports for all components)
│  ├─ Surface.tsx                              (new)
│  ├─ GlassCard.tsx                            (new)
│  ├─ Button.tsx                               (new)
│  ├─ TextInput.tsx                            (new)
│  ├─ PasswordInput.tsx                        (new)
│  ├─ MaterialIcon.tsx                         (new)
│  ├─ FingerprintDisplay.tsx                   (new)
│  ├─ QrCodePreview.tsx                        (new)
│  ├─ DangerZone.tsx                           (new)
│  ├─ Modal.tsx                                (new)
│  ├─ TopAppBar.tsx                            (new)
│  └─ SideNav.tsx                              (new)
├─ tests/
│  ├─ setup.ts                                 (new — RTL configuration)
│  ├─ Surface.test.tsx
│  ├─ GlassCard.test.tsx
│  ├─ Button.test.tsx
│  ├─ TextInput.test.tsx
│  ├─ PasswordInput.test.tsx
│  ├─ MaterialIcon.test.tsx
│  ├─ FingerprintDisplay.test.tsx
│  ├─ QrCodePreview.test.tsx
│  ├─ DangerZone.test.tsx
│  ├─ Modal.test.tsx
│  ├─ TopAppBar.test.tsx
│  └─ SideNav.test.tsx
└─ README.md                                   (modified)

apps/web/
├─ package.json                                (modified — add deps for tests; real test scripts)
├─ vitest.config.ts                            (new — browser-mode for tests)
├─ app/
│  ├─ layout.tsx                               (modified — wraps in IdentityProvider)
│  └─ keys/
│     └─ page.tsx                              (new — composes /keys screens)
├─ src/
│  ├─ lib/
│  │  └─ identity-context.tsx                  (new — IdentityProvider + state machine)
│  ├─ hooks/
│  │  └─ use-identity.ts                       (new — re-export hook from context)
│  └─ keys/
│     ├─ SetPassphraseScreen.tsx               (new)
│     ├─ UnlockScreen.tsx                      (new)
│     ├─ MyKeysScreen.tsx                      (new)
│     └─ WipeConfirmModal.tsx                  (new)
├─ tests/
│  ├─ setup.ts                                 (new — RTL config + indexedDB cleanup helper)
│  ├─ identity-context.test.tsx                (new — state machine tests)
│  └─ keys-page.e2e.test.tsx                   (new — happy-path E2E)
└─ AGENTS.md                                   (modified — add identity context note)
```

---

## Task 1: Refactor crypto fingerprint format

The Slice 1 fingerprint format (`6 groups × 4 lowercase base32 chars`, 120 bits) is replaced with the design-system canonical form (`SM-` + `8 groups × 4 uppercase hex`, 128 bits). A new `truncateFingerprint(fp, groups)` helper supports the truncated web display.

**Files:**
- Modify: `packages/crypto/src/wire.ts` (add `bytesToUpperHex`)
- Modify: `packages/crypto/src/fingerprint.ts` (new format + `truncateFingerprint`)
- Modify: `packages/crypto/src/index.ts` (export `truncateFingerprint`)
- Modify: `packages/crypto/tests/fingerprint.test.ts` (update expectations + new tests)

- [ ] **Step 1: Add `bytesToUpperHex` to `packages/crypto/src/wire.ts`**

Append to the file:

```ts
const HEX_CHARS = "0123456789ABCDEF";

export function bytesToUpperHex(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    result += HEX_CHARS[(b >> 4) & 0xf];
    result += HEX_CHARS[b & 0xf];
  }
  return result;
}
```

- [ ] **Step 2: Replace `packages/crypto/src/fingerprint.ts`**

Overwrite the file with:

```ts
import type { Fingerprint, PublicKeyString } from "./types.js";
import { bytesToUpperHex, decodePubkey } from "./wire.js";

const FINGERPRINT_BYTES = 16;
const FINGERPRINT_PREFIX = "SM-";
const HEX_GROUP_SIZE = 4;
const HEX_GROUP_COUNT = 8;

export async function fingerprint(pk: PublicKeyString): Promise<Fingerprint> {
  const { canonical } = decodePubkey(pk);
  const buf = new ArrayBuffer(canonical.byteLength);
  new Uint8Array(buf).set(canonical);
  const digestAb = await crypto.subtle.digest("SHA-256", buf);
  const digest = new Uint8Array(digestAb).slice(0, FINGERPRINT_BYTES);
  const hex = bytesToUpperHex(digest);
  const groups: string[] = [];
  for (let i = 0; i < HEX_GROUP_COUNT; i++) {
    groups.push(hex.slice(i * HEX_GROUP_SIZE, (i + 1) * HEX_GROUP_SIZE));
  }
  return (FINGERPRINT_PREFIX + groups.join("-")) as Fingerprint;
}

export function truncateFingerprint(fp: Fingerprint, groups: number): string {
  if (groups < 1 || groups > HEX_GROUP_COUNT) {
    throw new Error(`truncateFingerprint: groups must be 1..${HEX_GROUP_COUNT}, got ${groups}`);
  }
  const body = (fp as string).slice(FINGERPRINT_PREFIX.length).replace(/-/g, "");
  const out: string[] = [];
  for (let i = 0; i < groups; i++) {
    out.push(body.slice(i * HEX_GROUP_SIZE, (i + 1) * HEX_GROUP_SIZE));
  }
  return out.join(" ");
}

export function compareFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  const aStr = a as string;
  const bStr = b as string;
  if (aStr.length !== bStr.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aStr.length; i++) {
    diff |= aStr.charCodeAt(i) ^ bStr.charCodeAt(i);
  }
  return diff === 0;
}
```

- [ ] **Step 3: Update `packages/crypto/src/index.ts`**

Find the existing line:

```ts
export { compareFingerprint, fingerprint } from "./fingerprint.js";
```

Replace with:

```ts
export { compareFingerprint, fingerprint, truncateFingerprint } from "./fingerprint.js";
```

- [ ] **Step 4: Replace `packages/crypto/tests/fingerprint.test.ts`**

Overwrite with:

```ts
import { describe, expect, it } from "vitest";
import { compareFingerprint, fingerprint, truncateFingerprint } from "../src/fingerprint.js";
import { exportPublicKey, generateIdentity } from "../src/identity.js";
import type { Fingerprint, PublicKeyString } from "../src/types.js";

describe("fingerprint", () => {
  it("returns SM- + 8 groups of 4 uppercase hex chars dash-separated", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const fp = await fingerprint(pk);
    expect(fp).toMatch(/^SM-[0-9A-F]{4}(-[0-9A-F]{4}){7}$/);
    expect(fp).toHaveLength(42);
  });

  it("is deterministic — same pubkey produces same fingerprint", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const a = await fingerprint(pk);
    const b = await fingerprint(pk);
    expect(a).toBe(b);
  });

  it("distinguishes different public keys", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = await generateIdentity();
      const pk = exportPublicKey(id);
      const fp = await fingerprint(pk);
      seen.add(fp);
    }
    expect(seen.size).toBe(50);
  });

  it("rejects strings that are not valid amk1: pubkeys", async () => {
    await expect(fingerprint("garbage" as unknown as PublicKeyString)).rejects.toBeTruthy();
  });
});

describe("truncateFingerprint", () => {
  const fullFp = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;

  it("returns 4 space-separated groups for groups=4", () => {
    expect(truncateFingerprint(fullFp, 4)).toBe("A91C 22F0 78BB 19D2");
  });

  it("returns 1 group for groups=1", () => {
    expect(truncateFingerprint(fullFp, 1)).toBe("A91C");
  });

  it("returns all 8 groups for groups=8", () => {
    expect(truncateFingerprint(fullFp, 8)).toBe("A91C 22F0 78BB 19D2 AAAA BBBB CCCC DDDD");
  });

  it("throws for groups < 1", () => {
    expect(() => truncateFingerprint(fullFp, 0)).toThrow();
  });

  it("throws for groups > 8", () => {
    expect(() => truncateFingerprint(fullFp, 9)).toThrow();
  });
});

describe("compareFingerprint", () => {
  it("returns true for identical fingerprints", () => {
    const a = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const b = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(true);
  });

  it("returns false for fingerprints differing in the first hex group", () => {
    const a = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const b = "SM-Z91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("returns false for fingerprints differing in the last hex char", () => {
    const a = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const b = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDE" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("returns false for different-length inputs", () => {
    const a = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const b = "SM-A91C-22F0" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("touches every character regardless of where the mismatch is (no early return)", () => {
    const a = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const earlyMismatch = "SM-Z91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;
    const lateMismatch = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDE" as Fingerprint;
    for (let i = 0; i < 100; i++) {
      expect(compareFingerprint(a, earlyMismatch)).toBe(false);
      expect(compareFingerprint(a, lateMismatch)).toBe(false);
    }
  });
});
```

- [ ] **Step 5: Run typecheck + tests + lint**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Run: `pnpm --filter @aesmsg/crypto test:node`
Run: `pnpm lint`

Expected:
- Typecheck clean.
- Tests pass: 5 fingerprint cases (was 4 — replaced by 4 new + 5 truncate + 5 compare = 14 total in this file).
- Lint clean (apply `pnpm lint:fix` if format complaints).

Coverage stays at ≥95% on `src/`.

- [ ] **Step 6: Commit**

```bash
git add packages/crypto/src/fingerprint.ts packages/crypto/src/wire.ts packages/crypto/src/index.ts packages/crypto/tests/fingerprint.test.ts
git commit -m "refactor(crypto): fingerprint format -> SM-XXXX-... per design system + truncateFingerprint"
```

---

## Task 2: Author three missing mockups

Three new HTML mockups under `all_design_screens/`. They follow the convention of every existing mockup: Tailwind via CDN, design-system tokens inlined into `tailwind.config`, Material Symbols Outlined for icons, Geist / Inter / JetBrains Mono fonts. No `screen.png` yet — visual review happens by opening the HTML.

**Files:**
- Create: `all_design_screens/set_passphrase_aesmsg/code.html`
- Create: `all_design_screens/unlock_passphrase_aesmsg/code.html`
- Create: `all_design_screens/wipe_identity_confirm_aesmsg/code.html`
- Modify: `all_design_screens/aesmsg_proposed_screen_list.md` (append the three to the Web Screens list)

For all three, copy the `<head>` block — fonts, Tailwind CDN, the `tailwind.config` JSON, the helper `<style>` for `material-symbols-outlined` font-variation-settings — verbatim from `all_design_screens/my_security_keys_aesmsg/code.html`. The bodies differ as below.

- [ ] **Step 1: Create `all_design_screens/set_passphrase_aesmsg/code.html`**

Body (replace everything between `<body class="...">` and `</body>` of the copied template):

```html
<body class="font-body-md text-body-md bg-background text-on-surface min-h-screen flex items-center justify-center p-md">
  <main class="w-full max-w-md flex flex-col gap-lg">
    <div class="text-center space-y-sm">
      <h1 class="font-display text-display font-semibold text-on-surface tracking-tight">Create your identity</h1>
      <p class="font-body-md text-on-surface-variant">
        Choose a passphrase. Your private key is wrapped with it locally — we never see it.
      </p>
    </div>

    <div class="rounded-xl bg-surface-container border border-outline-variant/30 p-lg space-y-md">
      <label class="block space-y-xs">
        <span class="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">Passphrase</span>
        <input type="password" class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm text-on-surface focus:outline-none focus:border-primary placeholder:text-on-surface-variant/50" placeholder="At least 12 characters" />
      </label>
      <label class="block space-y-xs">
        <span class="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">Confirm passphrase</span>
        <input type="password" class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm text-on-surface focus:outline-none focus:border-primary" />
      </label>
      <p class="font-label-sm text-label-sm text-error hidden">Passphrases must match and be at least 12 characters.</p>
      <button class="w-full h-12 mt-md flex items-center justify-center gap-sm bg-gradient-to-r from-primary to-primary-container text-on-primary-container font-semibold rounded-lg active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(207,188,255,0.2)]">
        <span class="material-symbols-outlined">vpn_key</span>
        Create identity
      </button>
    </div>

    <div class="rounded-xl bg-surface-container-low border border-outline-variant/20 p-md flex gap-md items-start">
      <div class="p-sm bg-primary/10 rounded-lg shrink-0">
        <span class="material-symbols-outlined text-primary">info</span>
      </div>
      <div class="space-y-xs">
        <h4 class="font-label-sm text-label-sm font-bold text-on-surface">Argon2id memory-hard derivation</h4>
        <p class="text-label-sm text-on-surface-variant">Forgotten passphrase = unrecoverable. No fallback by design.</p>
      </div>
    </div>
  </main>
</body>
```

- [ ] **Step 2: Create `all_design_screens/unlock_passphrase_aesmsg/code.html`**

Body:

```html
<body class="font-body-md text-body-md bg-background text-on-surface min-h-screen flex items-center justify-center p-md">
  <main class="w-full max-w-md flex flex-col gap-lg">
    <div class="text-center space-y-sm">
      <h1 class="font-display text-display font-semibold text-on-surface tracking-tight">Unlock your identity</h1>
      <p class="font-body-md text-on-surface-variant">
        Enter your passphrase to decrypt your private key for this session.
      </p>
    </div>

    <div class="rounded-xl bg-surface-container border border-outline-variant/30 p-lg space-y-md">
      <label class="block space-y-xs">
        <span class="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">Passphrase</span>
        <input type="password" class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm text-on-surface focus:outline-none focus:border-primary" />
      </label>
      <p class="font-label-sm text-label-sm text-error hidden">Wrong passphrase</p>
      <button class="w-full h-12 mt-md flex items-center justify-center gap-sm bg-gradient-to-r from-primary to-primary-container text-on-primary-container font-semibold rounded-lg active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(207,188,255,0.2)]">
        <span class="material-symbols-outlined">lock_open</span>
        Unlock
      </button>
    </div>

    <a href="#wipe" class="text-center font-label-sm text-label-sm text-error hover:text-error/80 transition-colors">
      Wipe and start over &rarr;
    </a>
  </main>
</body>
```

- [ ] **Step 3: Create `all_design_screens/wipe_identity_confirm_aesmsg/code.html`**

Body:

```html
<body class="font-body-md text-body-md bg-background text-on-surface min-h-screen">
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md">
    <div class="w-full max-w-md rounded-xl bg-surface-container border border-error/30 shadow-2xl p-lg space-y-lg">
      <div class="space-y-sm">
        <h2 class="font-h2 text-h2 font-semibold text-error">Wipe Private Key</h2>
        <p class="font-body-md text-on-surface-variant">
          All encrypted messages addressed to this identity will become unreadable forever.
          This cannot be undone.
        </p>
      </div>

      <div class="space-y-xs">
        <span class="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">Type WIPE to confirm</span>
        <input type="text" class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm text-on-surface focus:outline-none focus:border-error font-mono-code" placeholder="WIPE" />
      </div>

      <div class="grid grid-cols-2 gap-md">
        <button class="h-12 flex items-center justify-center bg-surface-container-high border border-outline-variant/30 text-on-surface font-medium rounded-lg active:scale-[0.98] hover:bg-surface-container-highest transition-all">
          Cancel
        </button>
        <button class="h-12 flex items-center justify-center bg-error text-on-error font-bold rounded-lg active:scale-[0.98] hover:bg-error/90 transition-colors disabled:opacity-50 disabled:pointer-events-none" disabled>
          Wipe Private Key
        </button>
      </div>
    </div>
  </div>
</body>
```

- [ ] **Step 4: Update `all_design_screens/aesmsg_proposed_screen_list.md`**

Append to the Web Screens list:

```markdown
7. **Set Passphrase**: First-visit identity creation. Two-input passphrase form with confirmation, info card about Argon2id and no-recovery.
8. **Unlock Passphrase**: Returning-visit identity decrypt. Single-input passphrase form, wrong-passphrase error state, "Wipe and start over" destructive route.
9. **Wipe Identity Confirm**: Modal overlay before key wipe. Type-to-confirm "WIPE" input, two-button (cancel + wipe) footer.
```

- [ ] **Step 5: Verify the mockups render**

Run: `open all_design_screens/set_passphrase_aesmsg/code.html` (or open in any browser).
Run: `open all_design_screens/unlock_passphrase_aesmsg/code.html`
Run: `open all_design_screens/wipe_identity_confirm_aesmsg/code.html`

Expected: each opens cleanly, fonts load (Geist / Inter / JetBrains Mono), Tailwind styles apply, layout is centered on the dark surface, no console errors.

- [ ] **Step 6: Commit**

```bash
git add all_design_screens/set_passphrase_aesmsg all_design_screens/unlock_passphrase_aesmsg all_design_screens/wipe_identity_confirm_aesmsg all_design_screens/aesmsg_proposed_screen_list.md
git commit -m "design: add set-passphrase, unlock, wipe-confirm mockups for Slice 3"
```

---

## Task 3: Scaffold `packages/ui` for browser-mode tests

`packages/ui` already has `package.json`, `tsconfig.json`, and an empty barrel. Slice 3 turns it into a real component package: adds `qrcode` as a runtime dep, the React Testing Library deps for component tests, browser-mode Vitest config matching `key-store`'s setup, and a test-setup file that loads `@testing-library/jest-dom` matchers.

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/tsconfig.json`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/tests/setup.ts`

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @aesmsg/ui add qrcode
pnpm --filter @aesmsg/ui add -D \
  "@vitest/browser@^3.2.0" \
  "@vitest/coverage-v8@^3.2.0" \
  "playwright@^1.59.0" \
  "vitest@^3.0.0" \
  "@testing-library/react@^16.0.0" \
  "@testing-library/dom@^10.0.0" \
  "@testing-library/jest-dom@^6.0.0" \
  "@testing-library/user-event@^14.0.0" \
  "@types/qrcode" \
  "@types/react@^19.0.0"
```

Expected: deps added; lockfile updated. `qrcode` lands in `dependencies`; the rest in `devDependencies`. The `react` peer dep was already declared in Phase 0.

- [ ] **Step 2: Update `packages/ui/package.json` scripts**

Replace the `scripts` block with:

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "vitest run --config vitest.config.ts",
  "test:watch": "vitest --config vitest.config.ts",
  "test:coverage": "vitest run --config vitest.config.ts --coverage"
}
```

- [ ] **Step 3: Update `packages/ui/tsconfig.json`**

Replace its content with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["@testing-library/jest-dom"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create `packages/ui/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.tsx", "src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 85,
      },
    },
  },
});
```

- [ ] **Step 5: Create `packages/ui/tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Install Chromium for Playwright (already cached for crypto and key-store, just verify)**

```bash
pnpm --filter @aesmsg/ui exec playwright --version
```

Expected: prints a version. If the binary is missing, run `pnpm --filter @aesmsg/ui exec playwright install chromium`.

- [ ] **Step 7: Run typecheck**

```bash
pnpm install
pnpm --filter @aesmsg/ui typecheck
```

Expected: clean.

- [ ] **Step 8: Verify the empty test config runs**

```bash
pnpm --filter @aesmsg/ui test
```

Expected: "No test files found" or zero tests passing. Vitest should bootstrap browser mode without errors.

- [ ] **Step 9: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "chore(ui): scaffold packages/ui for browser-mode component tests (RTL + Playwright + qrcode)"
```

---

## Task 4: Implement `Surface`, `GlassCard`, `MaterialIcon`

Three trivial wrappers that establish the visual foundation. Each is one file, each has one test.

**Files:**
- Create: `packages/ui/src/Surface.tsx`
- Create: `packages/ui/src/GlassCard.tsx`
- Create: `packages/ui/src/MaterialIcon.tsx`
- Create: `packages/ui/tests/Surface.test.tsx`
- Create: `packages/ui/tests/GlassCard.test.tsx`
- Create: `packages/ui/tests/MaterialIcon.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/Surface.tsx`**

```tsx
import type { ReactNode } from "react";

export interface SurfaceProps {
  children?: ReactNode;
  className?: string;
}

export function Surface({ children, className = "" }: SurfaceProps) {
  return (
    <div
      className={`min-h-screen bg-background text-on-surface font-body-md text-body-md ${className}`.trim()}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/ui/src/GlassCard.tsx`**

```tsx
import type { ReactNode } from "react";

export interface GlassCardProps {
  children?: ReactNode;
  className?: string;
}

export function GlassCard({ children, className = "" }: GlassCardProps) {
  return (
    <div
      className={`rounded-xl bg-surface-container border border-outline-variant/30 ${className}`.trim()}
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)",
        backdropFilter: "blur(12px)",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create `packages/ui/src/MaterialIcon.tsx`**

```tsx
export interface MaterialIconProps {
  name: string;
  filled?: boolean;
  className?: string;
}

export function MaterialIcon({ name, filled = false, className = "" }: MaterialIconProps) {
  const style = filled
    ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
    : { fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" };
  return (
    <span className={`material-symbols-outlined ${className}`.trim()} style={style}>
      {name}
    </span>
  );
}
```

- [ ] **Step 4: Create `packages/ui/tests/Surface.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Surface } from "../src/Surface.js";

describe("Surface", () => {
  it("renders children inside the dark surface", () => {
    render(
      <Surface>
        <span data-testid="child">hi</span>
      </Surface>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies the design-token surface classes", () => {
    const { container } = render(<Surface />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("bg-background");
    expect(root.className).toContain("text-on-surface");
    expect(root.className).toContain("font-body-md");
    expect(root.className).toContain("min-h-screen");
  });

  it("appends the optional className", () => {
    const { container } = render(<Surface className="extra-class" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("extra-class");
  });
});
```

- [ ] **Step 5: Create `packages/ui/tests/GlassCard.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlassCard } from "../src/GlassCard.js";

describe("GlassCard", () => {
  it("renders children", () => {
    render(
      <GlassCard>
        <span data-testid="child">hi</span>
      </GlassCard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies the rounded surface-container classes", () => {
    const { container } = render(<GlassCard />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("rounded-xl");
    expect(root.className).toContain("bg-surface-container");
    expect(root.className).toContain("border");
    expect(root.className).toContain("border-outline-variant/30");
  });

  it("appends the optional className", () => {
    const { container } = render(<GlassCard className="p-lg" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("p-lg");
  });
});
```

- [ ] **Step 6: Create `packages/ui/tests/MaterialIcon.test.tsx`**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaterialIcon } from "../src/MaterialIcon.js";

describe("MaterialIcon", () => {
  it("renders the icon name as text inside material-symbols-outlined span", () => {
    const { container } = render(<MaterialIcon name="vpn_key" />);
    const span = container.firstChild as HTMLElement;
    expect(span.tagName).toBe("SPAN");
    expect(span.className).toContain("material-symbols-outlined");
    expect(span.textContent).toBe("vpn_key");
  });

  it("uses unfilled font-variation-settings by default", () => {
    const { container } = render(<MaterialIcon name="vpn_key" />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.fontVariationSettings).toContain("'FILL' 0");
  });

  it("uses filled font-variation-settings when filled=true", () => {
    const { container } = render(<MaterialIcon name="vpn_key" filled />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.fontVariationSettings).toContain("'FILL' 1");
  });

  it("appends the optional className", () => {
    const { container } = render(<MaterialIcon name="vpn_key" className="text-primary" />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain("text-primary");
  });
});
```

- [ ] **Step 7: Update `packages/ui/src/index.ts`**

Replace its content with:

```ts
export { Surface } from "./Surface.js";
export type { SurfaceProps } from "./Surface.js";
export { GlassCard } from "./GlassCard.js";
export type { GlassCardProps } from "./GlassCard.js";
export { MaterialIcon } from "./MaterialIcon.js";
export type { MaterialIconProps } from "./MaterialIcon.js";
```

- [ ] **Step 8: Run tests + typecheck + lint**

```bash
pnpm --filter @aesmsg/ui test
pnpm --filter @aesmsg/ui typecheck
pnpm lint
```

Expected: 10 cases pass (3 + 3 + 4). Typecheck clean. Lint clean (run `pnpm lint:fix` if format complaints).

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src packages/ui/tests
git commit -m "feat(ui): add Surface, GlassCard, MaterialIcon primitives"
```

---

## Task 5: Implement `Button`

Three variants — `primary` (gradient), `secondary` (surface-container with border), `danger` (`bg-error`). All accept native `<button>` props plus `icon?: string` (Material icon name) and `loading?: boolean`. The `loading` flag swaps the icon for a spinning version and disables the button.

**Files:**
- Create: `packages/ui/src/Button.tsx`
- Create: `packages/ui/tests/Button.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { MaterialIcon } from "./MaterialIcon.js";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
  loading?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-primary to-primary-container text-on-primary-container font-semibold shadow-[0_0_15px_rgba(207,188,255,0.2)]",
  secondary:
    "bg-surface-container-high border border-outline-variant/30 text-on-surface font-medium hover:bg-surface-container-highest",
  danger: "bg-error text-on-error font-bold hover:bg-error/90",
};

export function Button({
  variant = "primary",
  icon,
  loading = false,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const variantClasses = VARIANT_CLASSES[variant];
  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`h-12 flex items-center justify-center gap-sm rounded-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none ${variantClasses} ${className}`.trim()}
      {...rest}
    >
      {loading ? (
        <MaterialIcon name="progress_activity" className="animate-spin" />
      ) : icon ? (
        <MaterialIcon name={icon} />
      ) : null}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create `packages/ui/tests/Button.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../src/Button.js";

describe("Button", () => {
  it("renders children and a primary gradient by default", () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn.className).toContain("from-primary");
    expect(btn.className).toContain("text-on-primary-container");
  });

  it("renders the secondary variant with surface-container styling", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole("button", { name: "Cancel" });
    expect(btn.className).toContain("bg-surface-container-high");
    expect(btn.className).toContain("border-outline-variant/30");
  });

  it("renders the danger variant with error background", () => {
    render(<Button variant="danger">Wipe</Button>);
    const btn = screen.getByRole("button", { name: "Wipe" });
    expect(btn.className).toContain("bg-error");
    expect(btn.className).toContain("text-on-error");
  });

  it("renders an icon when icon prop is provided", () => {
    render(<Button icon="vpn_key">Create identity</Button>);
    const icon = screen.getByText("vpn_key");
    expect(icon.className).toContain("material-symbols-outlined");
  });

  it("swaps the icon for a spinner and disables the button when loading", () => {
    render(<Button icon="vpn_key" loading>Submitting</Button>);
    const btn = screen.getByRole("button", { name: /Submitting/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("progress_activity")).toBeInTheDocument();
    expect(screen.queryByText("vpn_key")).not.toBeInTheDocument();
  });

  it("respects an explicit disabled prop", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
  });

  it("invokes onClick when pressed", async () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Press</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Press" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onClick when disabled", async () => {
    const handler = vi.fn();
    render(<Button disabled onClick={handler}>Press</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Press" }));
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Update `packages/ui/src/index.ts`**

Append:

```ts
export { Button } from "./Button.js";
export type { ButtonProps, ButtonVariant } from "./Button.js";
```

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
pnpm --filter @aesmsg/ui test Button
pnpm --filter @aesmsg/ui typecheck
pnpm lint
```

Expected: 8 Button cases pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/Button.tsx packages/ui/tests/Button.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add Button with primary/secondary/danger variants and loading state"
```

---

## Task 6: Implement `TextInput` and `PasswordInput`

Two near-identical inputs — `TextInput` for the WIPE confirmation, `PasswordInput` for the bootstrap forms. Each renders a label slot, the input, and an error slot. Both forward native input props.

**Files:**
- Create: `packages/ui/src/TextInput.tsx`
- Create: `packages/ui/src/PasswordInput.tsx`
- Create: `packages/ui/tests/TextInput.test.tsx`
- Create: `packages/ui/tests/PasswordInput.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/TextInput.tsx`**

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string | null;
  monospace?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, error, monospace = false, className = "", id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name ?? undefined;
  const monoClass = monospace ? "font-mono-code text-mono-code" : "";
  const borderClass = error ? "border-error" : "border-outline-variant/30 focus:border-primary";
  return (
    <div className="space-y-xs">
      {label && (
        <label
          htmlFor={inputId}
          className="block font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        type="text"
        className={`w-full bg-surface-container-low border ${borderClass} rounded-lg px-md py-sm text-on-surface focus:outline-none ${monoClass} ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error && <p className="font-label-sm text-label-sm text-error">{error}</p>}
    </div>
  );
});
```

- [ ] **Step 2: Create `packages/ui/src/PasswordInput.tsx`**

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string | null;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, error, className = "", id, ...rest }, ref) {
    const inputId = id ?? rest.name ?? undefined;
    const borderClass = error ? "border-error" : "border-outline-variant/30 focus:border-primary";
    return (
      <div className="space-y-xs">
        {label && (
          <label
            htmlFor={inputId}
            className="block font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type="password"
          className={`w-full bg-surface-container-low border ${borderClass} rounded-lg px-md py-sm text-on-surface focus:outline-none ${className}`.trim()}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {error && <p className="font-label-sm text-label-sm text-error">{error}</p>}
      </div>
    );
  },
);
```

- [ ] **Step 3: Create `packages/ui/tests/TextInput.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextInput } from "../src/TextInput.js";

describe("TextInput", () => {
  it("renders label and input", () => {
    render(<TextInput label="Type WIPE" name="confirm" />);
    expect(screen.getByLabelText("Type WIPE")).toBeInTheDocument();
  });

  it("forwards native input props", async () => {
    const onChange = vi.fn();
    render(<TextInput label="Confirm" name="x" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Confirm"), "WIPE");
    expect(onChange).toHaveBeenCalled();
    expect((screen.getByLabelText("Confirm") as HTMLInputElement).value).toBe("WIPE");
  });

  it("renders an error message and applies border-error when error is set", () => {
    render(<TextInput label="Confirm" name="x" error="must be WIPE" />);
    expect(screen.getByText("must be WIPE")).toBeInTheDocument();
    const input = screen.getByLabelText("Confirm");
    expect(input.className).toContain("border-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("applies monospace styling when monospace=true", () => {
    render(<TextInput label="Confirm" name="x" monospace />);
    const input = screen.getByLabelText("Confirm");
    expect(input.className).toContain("font-mono-code");
  });
});
```

- [ ] **Step 4: Create `packages/ui/tests/PasswordInput.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput } from "../src/PasswordInput.js";

describe("PasswordInput", () => {
  it("renders a type=password input with the given label", () => {
    render(<PasswordInput label="Passphrase" name="pw" />);
    const input = screen.getByLabelText("Passphrase") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("forwards onChange and accepts typing", async () => {
    const onChange = vi.fn();
    render(<PasswordInput label="Passphrase" name="pw" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Passphrase"), "secret");
    expect(onChange).toHaveBeenCalled();
  });

  it("renders an error and applies error styling", () => {
    render(<PasswordInput label="Passphrase" name="pw" error="too short" />);
    expect(screen.getByText("too short")).toBeInTheDocument();
    expect(screen.getByLabelText("Passphrase")).toHaveAttribute("aria-invalid", "true");
  });
});
```

- [ ] **Step 5: Update `packages/ui/src/index.ts`**

Append:

```ts
export { TextInput } from "./TextInput.js";
export type { TextInputProps } from "./TextInput.js";
export { PasswordInput } from "./PasswordInput.js";
export type { PasswordInputProps } from "./PasswordInput.js";
```

- [ ] **Step 6: Run tests + typecheck + lint**

```bash
pnpm --filter @aesmsg/ui test
pnpm --filter @aesmsg/ui typecheck
pnpm lint
```

Expected: 4 + 3 = 7 new cases pass.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/TextInput.tsx packages/ui/src/PasswordInput.tsx packages/ui/tests/TextInput.test.tsx packages/ui/tests/PasswordInput.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add TextInput and PasswordInput with label/error slots"
```

---

## Task 7: Implement `FingerprintDisplay`

Renders a `Fingerprint` (the `SM-XXXX-...` brand from `@aesmsg/crypto`) on a `bg-surface-container-lowest` block in JetBrains Mono, with a copy button on the right. Optional `truncate` prop renders only the first N groups (using `truncateFingerprint` from crypto).

**Files:**
- Create: `packages/ui/src/FingerprintDisplay.tsx`
- Create: `packages/ui/tests/FingerprintDisplay.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/FingerprintDisplay.tsx`**

```tsx
import { type Fingerprint, truncateFingerprint } from "@aesmsg/crypto";
import { useState } from "react";
import { MaterialIcon } from "./MaterialIcon.js";

export interface FingerprintDisplayProps {
  fingerprint: Fingerprint;
  truncate?: number;
  className?: string;
}

export function FingerprintDisplay({
  fingerprint,
  truncate,
  className = "",
}: FingerprintDisplayProps) {
  const [copied, setCopied] = useState(false);
  const displayed =
    typeof truncate === "number" ? truncateFingerprint(fingerprint, truncate) : (fingerprint as string);

  const onCopy = async () => {
    await navigator.clipboard.writeText(fingerprint as string);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-md flex items-center justify-between gap-md ${className}`.trim()}
    >
      <span className="font-mono-code text-mono-code text-on-surface tracking-wider break-all">
        {displayed}
      </span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Fingerprint copied" : "Copy fingerprint"}
        className="shrink-0 flex items-center gap-xs text-primary hover:bg-primary/10 px-sm py-xs rounded transition-colors active:scale-95 font-label-sm"
      >
        <MaterialIcon name={copied ? "check" : "content_copy"} />
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/ui/tests/FingerprintDisplay.test.tsx`**

```tsx
import type { Fingerprint } from "@aesmsg/crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FingerprintDisplay } from "../src/FingerprintDisplay.js";

const SAMPLE = "SM-A91C-22F0-78BB-19D2-AAAA-BBBB-CCCC-DDDD" as Fingerprint;

describe("FingerprintDisplay", () => {
  it("renders the canonical full form when truncate is omitted", () => {
    render(<FingerprintDisplay fingerprint={SAMPLE} />);
    expect(screen.getByText(SAMPLE)).toBeInTheDocument();
  });

  it("renders the truncated form when truncate=4", () => {
    render(<FingerprintDisplay fingerprint={SAMPLE} truncate={4} />);
    expect(screen.getByText("A91C 22F0 78BB 19D2")).toBeInTheDocument();
  });

  it("uses font-mono-code styling for the fingerprint text", () => {
    render(<FingerprintDisplay fingerprint={SAMPLE} />);
    const span = screen.getByText(SAMPLE);
    expect(span.className).toContain("font-mono-code");
  });

  it("writes the canonical full form to the clipboard when Copy is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<FingerprintDisplay fingerprint={SAMPLE} truncate={4} />);
    await userEvent.click(screen.getByRole("button", { name: /Copy fingerprint/ }));
    expect(writeText).toHaveBeenCalledWith(SAMPLE);
  });
});
```

- [ ] **Step 3: Update `packages/ui/src/index.ts`**

Append:

```ts
export { FingerprintDisplay } from "./FingerprintDisplay.js";
export type { FingerprintDisplayProps } from "./FingerprintDisplay.js";
```

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
pnpm --filter @aesmsg/ui test FingerprintDisplay
pnpm --filter @aesmsg/ui typecheck
pnpm lint
```

Expected: 4 cases pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/FingerprintDisplay.tsx packages/ui/tests/FingerprintDisplay.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add FingerprintDisplay with truncate prop and clipboard copy"
```

---

## Task 8: Implement `QrCodePreview`

Renders an SVG QR code of the given string inside the framed white-card visual from the mockup. Uses the `qrcode` package added in Task 3.

**Files:**
- Create: `packages/ui/src/QrCodePreview.tsx`
- Create: `packages/ui/tests/QrCodePreview.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/QrCodePreview.tsx`**

```tsx
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export interface QrCodePreviewProps {
  value: string;
  size?: number;
  className?: string;
}

export function QrCodePreview({ value, size = 240, className = "" }: QrCodePreviewProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 0 })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "QR generation failed");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      className={`relative bg-white p-lg rounded-xl shadow-2xl ${className}`.trim()}
      style={{ width: size + 32, height: size + 32 }}
    >
      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-primary/40 rounded-tl-sm" />
      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-primary/40 rounded-tr-sm" />
      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-primary/40 rounded-bl-sm" />
      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-primary/40 rounded-br-sm" />
      {svg ? (
        <div
          aria-label="Public-key QR code"
          role="img"
          style={{ width: size, height: size }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: QR SVG is generated locally from a public-key string we control
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : error ? (
        <div className="flex items-center justify-center text-red-600" style={{ width: size, height: size }}>
          QR generation failed
        </div>
      ) : (
        <div className="flex items-center justify-center text-gray-400" style={{ width: size, height: size }}>
          Generating QR…
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/ui/tests/QrCodePreview.test.tsx`**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QrCodePreview } from "../src/QrCodePreview.js";

describe("QrCodePreview", () => {
  it("renders an SVG element after generation completes", async () => {
    render(<QrCodePreview value="amk1:fixture-pubkey-string" />);
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Public-key QR code" })).toBeInTheDocument();
    });
    const wrapper = screen.getByRole("img", { name: "Public-key QR code" });
    const svg = wrapper.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).not.toBeNull();
  });

  it("renders the framed corner markers", () => {
    const { container } = render(<QrCodePreview value="amk1:test" />);
    const corners = container.querySelectorAll(".rounded-tl-sm, .rounded-tr-sm, .rounded-bl-sm, .rounded-br-sm");
    expect(corners.length).toBe(4);
  });

  it("respects the size prop", async () => {
    render(<QrCodePreview value="amk1:test" size={120} />);
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Public-key QR code" })).toBeInTheDocument();
    });
    const wrapper = screen.getByRole("img", { name: "Public-key QR code" });
    expect(wrapper.style.width).toBe("120px");
    expect(wrapper.style.height).toBe("120px");
  });
});
```

- [ ] **Step 3: Update `packages/ui/src/index.ts`**

Append:

```ts
export { QrCodePreview } from "./QrCodePreview.js";
export type { QrCodePreviewProps } from "./QrCodePreview.js";
```

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
pnpm --filter @aesmsg/ui test QrCodePreview
pnpm --filter @aesmsg/ui typecheck
pnpm lint
```

Expected: 3 cases pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/QrCodePreview.tsx packages/ui/tests/QrCodePreview.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add QrCodePreview rendering SVG via qrcode npm package"
```

---

## Task 9: Implement `DangerZone`

Direct port of the "Danger Zone" block from `my_security_keys_aesmsg`. Renders a heading, description, and an action button on an error-bordered surface.

**Files:**
- Create: `packages/ui/src/DangerZone.tsx`
- Create: `packages/ui/tests/DangerZone.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/DangerZone.tsx`**

```tsx
import { Button } from "./Button.js";

export interface DangerZoneProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  className?: string;
}

export function DangerZone({
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: DangerZoneProps) {
  return (
    <div className={`pt-xl border-t border-outline-variant/10 space-y-md ${className}`.trim()}>
      <div className="space-y-sm">
        <h3 className="font-h2 text-h2 text-error">Danger Zone</h3>
        <p className="text-on-surface-variant font-body-md">
          Irreversible actions that affect your security status.
        </p>
      </div>
      <div className="bg-error-container/10 border border-error/20 rounded-xl p-lg flex flex-col md:flex-row md:items-center justify-between gap-md">
        <div>
          <p className="font-label-sm text-on-surface font-semibold">{title}</p>
          <p className="text-label-sm text-on-surface-variant">{description}</p>
        </div>
        <Button variant="danger" onClick={onAction} className="whitespace-nowrap">
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/ui/tests/DangerZone.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DangerZone } from "../src/DangerZone.js";

describe("DangerZone", () => {
  it("renders title, description, and action label", () => {
    render(
      <DangerZone
        title="Wipe Private Key"
        description="Permanently delete your identity from this device."
        actionLabel="Wipe Private Key"
        onAction={() => {}}
      />,
    );
    expect(screen.getByText("Wipe Private Key")).toBeInTheDocument();
    expect(screen.getByText("Permanently delete your identity from this device.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wipe Private Key" })).toBeInTheDocument();
  });

  it("invokes onAction when the action button is clicked", async () => {
    const handler = vi.fn();
    render(
      <DangerZone
        title="Wipe Private Key"
        description="Irreversible."
        actionLabel="Wipe Private Key"
        onAction={handler}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Wipe Private Key" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("uses the danger Button variant for the action", () => {
    render(
      <DangerZone
        title="x"
        description="y"
        actionLabel="Wipe"
        onAction={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Wipe" }).className).toContain("bg-error");
  });
});
```

- [ ] **Step 3: Update `packages/ui/src/index.ts`**

Append:

```ts
export { DangerZone } from "./DangerZone.js";
export type { DangerZoneProps } from "./DangerZone.js";
```

- [ ] **Step 4: Run tests + typecheck + lint**

Same pattern as previous tasks. Expected: 3 cases pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/DangerZone.tsx packages/ui/tests/DangerZone.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add DangerZone component (Wipe Private Key action surface)"
```

---

## Task 10: Implement `Modal`, `TopAppBar`, `SideNav`

Three structural components. `Modal` wraps the wipe-confirm dialog. `TopAppBar` and `SideNav` come from `my_security_keys_aesmsg`.

**Files:**
- Create: `packages/ui/src/Modal.tsx`
- Create: `packages/ui/src/TopAppBar.tsx`
- Create: `packages/ui/src/SideNav.tsx`
- Create: `packages/ui/tests/Modal.test.tsx`
- Create: `packages/ui/tests/TopAppBar.test.tsx`
- Create: `packages/ui/tests/SideNav.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/Modal.tsx`**

```tsx
import { useEffect, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  accent?: "default" | "danger";
  children: ReactNode;
}

export function Modal({ open, onClose, ariaLabel, accent = "default", children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const accentBorder = accent === "danger" ? "border-error/30" : "border-outline-variant/30";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={`w-full max-w-md rounded-xl bg-surface-container border ${accentBorder} shadow-2xl p-lg`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/ui/src/TopAppBar.tsx`**

```tsx
import type { ReactNode } from "react";
import { MaterialIcon } from "./MaterialIcon.js";

export interface TopAppBarProps {
  children?: ReactNode;
}

export function TopAppBar({ children }: TopAppBarProps) {
  return (
    <header className="bg-surface/80 backdrop-blur-xl fixed top-0 z-40 w-full border-b border-outline-variant/10">
      <div className="flex justify-between items-center w-full px-lg py-md max-w-7xl mx-auto">
        <div className="font-display text-h1 font-bold tracking-tight text-on-surface">
          aesmsg
        </div>
        <div className="flex items-center gap-md">
          {children}
          <button
            type="button"
            aria-label="Security"
            className="text-on-surface-variant hover:text-primary active:scale-95 transition"
          >
            <MaterialIcon name="security" />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="text-on-surface-variant hover:text-primary active:scale-95 transition"
          >
            <MaterialIcon name="notifications" />
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `packages/ui/src/SideNav.tsx`**

```tsx
import { MaterialIcon } from "./MaterialIcon.js";

export interface SideNavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
}

export interface SideNavProps {
  items: SideNavItem[];
  activeId: string;
}

export function SideNav({ items, activeId }: SideNavProps) {
  return (
    <aside className="hidden md:flex flex-col py-xl gap-md bg-surface-container-low h-screen w-64 fixed left-0 top-0 border-r border-outline-variant/10 z-30">
      <div className="px-md mb-xl">
        <div className="font-display text-h2 font-bold text-on-surface px-md">aesmsg</div>
        <div className="px-md mt-xs">
          <p className="text-label-sm font-label-sm uppercase tracking-widest text-primary">
            Verified Session
          </p>
        </div>
      </div>
      <nav className="flex-1 px-sm space-y-xs">
        {items.map((item) => {
          const isActive = item.id === activeId;
          const base =
            "flex items-center gap-md px-md py-sm rounded-lg transition-all duration-300 font-label-sm uppercase tracking-widest";
          const active =
            "text-primary bg-primary-container/10 border-r-2 border-primary";
          const inactive =
            "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface";
          return (
            <a
              key={item.id}
              href={item.href}
              className={`${base} ${isActive ? active : inactive}`.trim()}
              aria-current={isActive ? "page" : undefined}
            >
              <MaterialIcon name={item.icon} filled={isActive} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: Create `packages/ui/tests/Modal.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../src/Modal.js";

describe("Modal", () => {
  it("renders nothing when open=false", () => {
    render(
      <Modal open={false} onClose={() => {}} ariaLabel="x">
        <span data-testid="child">hi</span>
      </Modal>,
    );
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("renders the dialog with role=dialog and the given aria-label", () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="Wipe confirmation">
        <span data-testid="child">hi</span>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Wipe confirmation" })).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("invokes onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} ariaLabel="x">
        <span data-testid="child">hi</span>
      </Modal>,
    );
    const backdrop = screen.getByRole("dialog");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT invoke onClose when the modal content is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} ariaLabel="x">
        <span data-testid="child">hi</span>
      </Modal>,
    );
    await userEvent.click(screen.getByTestId("child"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("invokes onClose on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} ariaLabel="x">
        <span>hi</span>
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("uses error border when accent='danger'", () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="x" accent="danger">
        <span data-testid="child">hi</span>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const inner = dialog.firstChild as HTMLElement;
    expect(inner.className).toContain("border-error/30");
  });
});
```

- [ ] **Step 5: Create `packages/ui/tests/TopAppBar.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopAppBar } from "../src/TopAppBar.js";

describe("TopAppBar", () => {
  it("renders the aesmsg wordmark", () => {
    render(<TopAppBar />);
    expect(screen.getByText("aesmsg")).toBeInTheDocument();
  });

  it("renders security and notifications icon buttons", () => {
    render(<TopAppBar />);
    expect(screen.getByRole("button", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("renders children before the icon buttons", () => {
    render(
      <TopAppBar>
        <span data-testid="custom">Custom</span>
      </TopAppBar>,
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Create `packages/ui/tests/SideNav.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SideNav, type SideNavItem } from "../src/SideNav.js";

const ITEMS: SideNavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard" },
  { id: "keys", label: "Keys", icon: "vpn_key", href: "/keys" },
];

describe("SideNav", () => {
  it("renders all items", () => {
    render(<SideNav items={ITEMS} activeId="keys" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Keys")).toBeInTheDocument();
  });

  it("marks the active item with aria-current=page", () => {
    render(<SideNav items={ITEMS} activeId="keys" />);
    const keys = screen.getByText("Keys").closest("a") as HTMLElement;
    const dashboard = screen.getByText("Dashboard").closest("a") as HTMLElement;
    expect(keys).toHaveAttribute("aria-current", "page");
    expect(dashboard).not.toHaveAttribute("aria-current");
  });

  it("uses the primary highlight on the active item", () => {
    render(<SideNav items={ITEMS} activeId="keys" />);
    const keys = screen.getByText("Keys").closest("a") as HTMLElement;
    expect(keys.className).toContain("text-primary");
    expect(keys.className).toContain("border-primary");
  });
});
```

- [ ] **Step 7: Update `packages/ui/src/index.ts`**

Append:

```ts
export { Modal } from "./Modal.js";
export type { ModalProps } from "./Modal.js";
export { TopAppBar } from "./TopAppBar.js";
export type { TopAppBarProps } from "./TopAppBar.js";
export { SideNav } from "./SideNav.js";
export type { SideNavItem, SideNavProps } from "./SideNav.js";
```

- [ ] **Step 8: Run tests + typecheck + lint + coverage**

```bash
pnpm --filter @aesmsg/ui test
pnpm --filter @aesmsg/ui typecheck
pnpm lint
pnpm --filter @aesmsg/ui test:coverage
```

Expected: 6 + 3 + 3 = 12 new cases pass. Total UI tests now ~37 (10 from Task 4, 8 from Task 5, 7 from Task 6, 4 from Task 7, 3 from Task 8, 3 from Task 9, 12 here). Coverage ≥85% on `src/`.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/Modal.tsx packages/ui/src/TopAppBar.tsx packages/ui/src/SideNav.tsx packages/ui/tests/Modal.test.tsx packages/ui/tests/TopAppBar.test.tsx packages/ui/tests/SideNav.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add Modal, TopAppBar, SideNav"
```

---

## Task 11: Set up `apps/web` test infrastructure

`apps/web` currently has no real tests. Slice 3 needs browser-mode tests for the identity context and the `/keys` E2E. Set up the Vitest config to match `key-store` (browser-mode + Playwright + RTL).

**Files:**
- Modify: `apps/web/package.json` (add deps + real test scripts)
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/tests/setup.ts`

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter web add @aesmsg/ui@workspace:* @aesmsg/key-store@workspace:*
pnpm --filter web add -D \
  "@vitest/browser@^3.2.0" \
  "@vitest/coverage-v8@^3.2.0" \
  "playwright@^1.59.0" \
  "vitest@^3.0.0" \
  "@testing-library/react@^16.0.0" \
  "@testing-library/dom@^10.0.0" \
  "@testing-library/jest-dom@^6.0.0" \
  "@testing-library/user-event@^14.0.0"
```

Expected: deps added; `@aesmsg/key-store` and `@aesmsg/ui` linked via workspace protocol.

- [ ] **Step 2: Update `apps/web/package.json` scripts**

Replace the `scripts` block (preserve `dev`, `build`, `start`, `typecheck` from Phase 0):

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "test": "vitest run --config vitest.config.ts",
  "test:watch": "vitest --config vitest.config.ts",
  "test:coverage": "vitest run --config vitest.config.ts --coverage"
}
```

- [ ] **Step 3: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.tsx", "src/**/*.ts", "app/**/*.tsx", "app/**/*.ts"],
      exclude: ["app/layout.tsx", "**/*.d.ts"],
      thresholds: {
        lines: 80,
      },
    },
  },
});
```

- [ ] **Step 4: Create `apps/web/tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

const DB_NAME = "aesmsg";

afterEach(async () => {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});
```

- [ ] **Step 5: Verify the test runner boots**

```bash
pnpm install
pnpm --filter web typecheck
pnpm --filter web test
```

Expected: typecheck clean. `pnpm test` reports zero tests (no test files yet); the runner should boot without errors. If the runner errors on missing tests, create a placeholder `apps/web/tests/placeholder.test.ts` containing `import { it } from 'vitest'; it("placeholder", () => {});` and verify; we'll delete it in Task 12.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/tests pnpm-lock.yaml
git commit -m "chore(web): set up Vitest browser mode + RTL for Slice 3 tests"
```

---

## Task 12: Implement identity context + state-machine tests

The `IdentityProvider` and `useIdentity` hook hold the bootstrap state machine. Tests in browser mode verify every state transition.

**Files:**
- Create: `apps/web/src/lib/identity-context.tsx`
- Create: `apps/web/src/hooks/use-identity.ts`
- Create: `apps/web/tests/identity-context.test.tsx`
- Delete: `apps/web/tests/placeholder.test.ts` (if created in Task 11)

- [ ] **Step 1: Create `apps/web/src/lib/identity-context.tsx`**

```tsx
"use client";

import {
  exportPublicKey,
  generateIdentity,
  type IdentityKeypair,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import {
  deleteIdentity,
  hasIdentity,
  loadIdentity,
  saveIdentity,
  SCHEMA_VERSION,
  type StoredIdentity,
} from "@aesmsg/key-store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PRIMARY_ID = "primary";

export type IdentityState =
  | { status: "loading" }
  | { status: "no_identity" }
  | { status: "locked"; storedIdentity: StoredIdentity }
  | { status: "unlocked"; storedIdentity: StoredIdentity; identity: IdentityKeypair };

export interface IdentityActions {
  unlock(passphrase: string): Promise<void>;
  setupNew(passphrase: string, label?: string): Promise<void>;
  lock(): void;
  wipe(): Promise<void>;
}

interface IdentityContextValue {
  state: IdentityState;
  actions: IdentityActions;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IdentityState>({ status: "loading" });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const has = await hasIdentity(PRIMARY_ID);
        if (cancelled) return;
        if (!has) {
          setState({ status: "no_identity" });
          return;
        }
        const stored = await loadIdentity(PRIMARY_ID);
        if (cancelled) return;
        if (!stored) {
          setState({ status: "no_identity" });
          return;
        }
        setState({ status: "locked", storedIdentity: stored });
      } catch {
        if (!cancelled) setState({ status: "no_identity" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setupNew = useCallback(async (passphrase: string, label = "My identity") => {
    const id = await generateIdentity();
    const wrapped = await wrapPrivateKey(id, passphrase);
    const pk = exportPublicKey(id);
    const record: StoredIdentity = {
      identityId: PRIMARY_ID,
      publicKeyString: pk,
      wrapped,
      createdAt: new Date().toISOString(),
      label,
      schemaVersion: SCHEMA_VERSION,
    };
    await saveIdentity(record);
    setState({ status: "unlocked", storedIdentity: record, identity: id });
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    const current = stateRef.current;
    if (current.status !== "locked") {
      throw new Error(`Cannot unlock from status: ${current.status}`);
    }
    const identity = await unwrapPrivateKey(current.storedIdentity.wrapped, passphrase);
    setState({ status: "unlocked", storedIdentity: current.storedIdentity, identity });
  }, []);

  const lock = useCallback(() => {
    const current = stateRef.current;
    if (current.status === "unlocked") {
      setState({ status: "locked", storedIdentity: current.storedIdentity });
    }
  }, []);

  const wipe = useCallback(async () => {
    await deleteIdentity(PRIMARY_ID);
    setState({ status: "no_identity" });
  }, []);

  const actions: IdentityActions = useMemo(
    () => ({ setupNew, unlock, lock, wipe }),
    [setupNew, unlock, lock, wipe],
  );
  const value = useMemo<IdentityContextValue>(() => ({ state, actions }), [state, actions]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentityContext(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used within IdentityProvider");
  return ctx;
}
```

- [ ] **Step 2: Create `apps/web/src/hooks/use-identity.ts`**

```ts
"use client";

export { useIdentityContext as useIdentity } from "../lib/identity-context.js";
export type { IdentityActions, IdentityState } from "../lib/identity-context.js";
```

- [ ] **Step 3: Create `apps/web/tests/identity-context.test.tsx`**

```tsx
import { exportPublicKey, BadPassphraseError } from "@aesmsg/crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdentityProvider, useIdentityContext } from "../src/lib/identity-context.js";

function StateProbe() {
  const { state } = useIdentityContext();
  return (
    <div>
      <div data-testid="status">{state.status}</div>
      {state.status === "unlocked" && (
        <div data-testid="pubkey">{exportPublicKey(state.identity)}</div>
      )}
      {state.status === "locked" && (
        <div data-testid="stored-pubkey">{state.storedIdentity.publicKeyString}</div>
      )}
    </div>
  );
}

function ActionTrigger({ onActions }: { onActions?: (a: ReturnType<typeof useIdentityContext>["actions"]) => void }) {
  const { actions } = useIdentityContext();
  if (onActions) onActions(actions);
  return null;
}

describe("IdentityProvider", () => {
  it("transitions loading -> no_identity on a fresh IndexedDB", async () => {
    render(
      <IdentityProvider>
        <StateProbe />
      </IdentityProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("no_identity");
    });
  });

  it("transitions to unlocked after setupNew, exposes the in-memory identity", async () => {
    let actions!: ReturnType<typeof useIdentityContext>["actions"];
    render(
      <IdentityProvider>
        <StateProbe />
        <ActionTrigger onActions={(a) => { actions = a; }} />
      </IdentityProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no_identity"));
    await act(async () => {
      await actions.setupNew("twelve chars-passphrase");
    });
    expect(screen.getByTestId("status").textContent).toBe("unlocked");
    expect(screen.getByTestId("pubkey").textContent).toMatch(/^amk1:/);
  });

  it("transitions to locked on a re-mount after setupNew (no in-memory key)", async () => {
    let actions!: ReturnType<typeof useIdentityContext>["actions"];
    const Probe = () => (
      <IdentityProvider>
        <StateProbe />
        <ActionTrigger onActions={(a) => { actions = a; }} />
      </IdentityProvider>
    );
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no_identity"));
    await act(async () => {
      await actions.setupNew("twelve chars-passphrase");
    });
    const originalPk = screen.getByTestId("pubkey").textContent;
    unmount();

    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("locked"));
    expect(screen.getByTestId("stored-pubkey").textContent).toBe(originalPk);
  });

  it("unlock with wrong passphrase throws BadPassphraseError and stays locked", async () => {
    let actions!: ReturnType<typeof useIdentityContext>["actions"];
    const Probe = () => (
      <IdentityProvider>
        <StateProbe />
        <ActionTrigger onActions={(a) => { actions = a; }} />
      </IdentityProvider>
    );
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no_identity"));
    await act(async () => {
      await actions.setupNew("twelve chars-passphrase");
    });
    unmount();
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("locked"));

    await expect(actions.unlock("wrong passphrase")).rejects.toBeInstanceOf(BadPassphraseError);
    expect(screen.getByTestId("status").textContent).toBe("locked");
  });

  it("unlock with correct passphrase transitions to unlocked", async () => {
    let actions!: ReturnType<typeof useIdentityContext>["actions"];
    const Probe = () => (
      <IdentityProvider>
        <StateProbe />
        <ActionTrigger onActions={(a) => { actions = a; }} />
      </IdentityProvider>
    );
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no_identity"));
    await act(async () => {
      await actions.setupNew("twelve chars-passphrase");
    });
    const originalPk = screen.getByTestId("pubkey").textContent;
    unmount();
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("locked"));

    await act(async () => {
      await actions.unlock("twelve chars-passphrase");
    });
    expect(screen.getByTestId("status").textContent).toBe("unlocked");
    expect(screen.getByTestId("pubkey").textContent).toBe(originalPk);
  });

  it("lock from unlocked returns to locked without IndexedDB writes", async () => {
    let actions!: ReturnType<typeof useIdentityContext>["actions"];
    render(
      <IdentityProvider>
        <StateProbe />
        <ActionTrigger onActions={(a) => { actions = a; }} />
      </IdentityProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no_identity"));
    await act(async () => {
      await actions.setupNew("twelve chars-passphrase");
    });
    expect(screen.getByTestId("status").textContent).toBe("unlocked");

    await act(async () => {
      actions.lock();
    });
    expect(screen.getByTestId("status").textContent).toBe("locked");
  });

  it("wipe transitions to no_identity and the IndexedDB record is gone", async () => {
    let actions!: ReturnType<typeof useIdentityContext>["actions"];
    const Probe = () => (
      <IdentityProvider>
        <StateProbe />
        <ActionTrigger onActions={(a) => { actions = a; }} />
      </IdentityProvider>
    );
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no_identity"));
    await act(async () => {
      await actions.setupNew("twelve chars-passphrase");
    });
    expect(screen.getByTestId("status").textContent).toBe("unlocked");
    await act(async () => {
      await actions.wipe();
    });
    expect(screen.getByTestId("status").textContent).toBe("no_identity");
    unmount();
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no_identity"));
  });
});
```

- [ ] **Step 4: Delete the placeholder if it was created in Task 11**

```bash
rm -f apps/web/tests/placeholder.test.ts
```

- [ ] **Step 5: Run tests + typecheck + lint**

```bash
pnpm --filter web test identity-context
pnpm --filter web typecheck
pnpm lint
```

Expected: 7 cases pass. The state-machine tests can each take a few hundred milliseconds (Argon2id + IndexedDB).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/identity-context.tsx apps/web/src/hooks/use-identity.ts apps/web/tests/identity-context.test.tsx
git commit -m "feat(web): add IdentityProvider + useIdentity bootstrap state machine"
```

---

## Task 13: Implement `/keys` route screens

Four screen components under `apps/web/src/keys/`. Each composes `packages/ui/` primitives with state.

**Files:**
- Create: `apps/web/src/keys/SetPassphraseScreen.tsx`
- Create: `apps/web/src/keys/UnlockScreen.tsx`
- Create: `apps/web/src/keys/MyKeysScreen.tsx`
- Create: `apps/web/src/keys/WipeConfirmModal.tsx`

- [ ] **Step 1: Create `apps/web/src/keys/SetPassphraseScreen.tsx`**

```tsx
"use client";

import { Button, GlassCard, MaterialIcon, PasswordInput, Surface } from "@aesmsg/ui";
import { useState } from "react";

export interface SetPassphraseScreenProps {
  onSubmit: (passphrase: string) => Promise<void>;
}

const MIN_LENGTH = 12;

export function SetPassphraseScreen({ onSubmit }: SetPassphraseScreenProps) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): string | null => {
    if (pw.length < MIN_LENGTH) return `Passphrase must be at least ${MIN_LENGTH} characters.`;
    if (pw !== confirm) return "Passphrases must match.";
    return null;
  };

  const handle = async () => {
    if (submitting) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(pw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create identity.");
      setSubmitting(false);
    }
  };

  return (
    <Surface className="flex items-center justify-center p-md">
      <main className="w-full max-w-md flex flex-col gap-lg">
        <div className="text-center space-y-sm">
          <h1 className="font-display text-display font-semibold text-on-surface tracking-tight">
            Create your identity
          </h1>
          <p className="font-body-md text-on-surface-variant">
            Choose a passphrase. Your private key is wrapped with it locally — we never see it.
          </p>
        </div>

        <GlassCard className="p-lg space-y-md">
          <PasswordInput
            label="Passphrase"
            name="passphrase"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={`At least ${MIN_LENGTH} characters`}
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirm passphrase"
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error ?? undefined}
            autoComplete="new-password"
          />
          <Button
            variant="primary"
            icon="vpn_key"
            loading={submitting}
            onClick={handle}
            className="w-full mt-md"
          >
            Create identity
          </Button>
        </GlassCard>

        <div className="rounded-xl bg-surface-container-low border border-outline-variant/20 p-md flex gap-md items-start">
          <div className="p-sm bg-primary/10 rounded-lg shrink-0">
            <MaterialIcon name="info" className="text-primary" />
          </div>
          <div className="space-y-xs">
            <h4 className="font-label-sm text-label-sm font-bold text-on-surface">
              Argon2id memory-hard derivation
            </h4>
            <p className="text-label-sm text-on-surface-variant">
              Forgotten passphrase = unrecoverable. No fallback by design.
            </p>
          </div>
        </div>
      </main>
    </Surface>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/keys/UnlockScreen.tsx`**

```tsx
"use client";

import { BadPassphraseError } from "@aesmsg/crypto";
import { Button, GlassCard, PasswordInput, Surface } from "@aesmsg/ui";
import { useState } from "react";

export interface UnlockScreenProps {
  onUnlock: (passphrase: string) => Promise<void>;
  onWipe: () => void;
}

export function UnlockScreen({ onUnlock, onWipe }: UnlockScreenProps) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handle = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onUnlock(pw);
    } catch (e) {
      setError(e instanceof BadPassphraseError ? "Wrong passphrase" : "Could not unlock.");
      setSubmitting(false);
    }
  };

  return (
    <Surface className="flex items-center justify-center p-md">
      <main className="w-full max-w-md flex flex-col gap-lg">
        <div className="text-center space-y-sm">
          <h1 className="font-display text-display font-semibold text-on-surface tracking-tight">
            Unlock your identity
          </h1>
          <p className="font-body-md text-on-surface-variant">
            Enter your passphrase to decrypt your private key for this session.
          </p>
        </div>

        <GlassCard className="p-lg space-y-md">
          <PasswordInput
            label="Passphrase"
            name="passphrase"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            error={error ?? undefined}
            autoComplete="current-password"
          />
          <Button
            variant="primary"
            icon="lock_open"
            loading={submitting}
            onClick={handle}
            className="w-full mt-md"
          >
            Unlock
          </Button>
        </GlassCard>

        <button
          type="button"
          onClick={onWipe}
          className="text-center font-label-sm text-label-sm text-error hover:text-error/80 transition-colors"
        >
          Wipe and start over &rarr;
        </button>
      </main>
    </Surface>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/keys/MyKeysScreen.tsx`**

```tsx
"use client";

import { fingerprint, type PublicKeyString } from "@aesmsg/crypto";
import {
  Button,
  DangerZone,
  FingerprintDisplay,
  GlassCard,
  MaterialIcon,
  QrCodePreview,
  Surface,
} from "@aesmsg/ui";
import { useEffect, useState } from "react";
import type { Fingerprint } from "@aesmsg/crypto";

export interface MyKeysScreenProps {
  publicKeyString: PublicKeyString;
  onWipe: () => void;
}

export function MyKeysScreen({ publicKeyString, onWipe }: MyKeysScreenProps) {
  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const f = await fingerprint(publicKeyString);
      if (!cancelled) setFp(f);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKeyString]);

  const onCopy = async () => {
    await navigator.clipboard.writeText(publicKeyString);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Surface className="px-md md:px-xl py-xl">
      <main className="max-w-[640px] mx-auto w-full space-y-xl">
        <section className="text-center space-y-md">
          <h2 className="font-h1 text-h1 text-on-surface">Identity Management</h2>
          <p className="text-on-surface-variant font-body-md max-w-md mx-auto">
            Manage your cryptographic presence. Your public key allows others to send you
            end-to-end encrypted messages.
          </p>
        </section>

        <GlassCard className="p-xl space-y-lg flex flex-col items-center">
          <QrCodePreview value={publicKeyString} size={192} />
          <div className="w-full space-y-sm">
            <span className="block text-label-sm font-label-sm text-primary uppercase tracking-widest text-center">
              Public Key Fingerprint
            </span>
            {fp && <FingerprintDisplay fingerprint={fp} truncate={4} />}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md w-full">
            <Button variant="secondary" icon={copied ? "check" : "share"} onClick={onCopy}>
              {copied ? "Copied" : "Share Public Key"}
            </Button>
            <Button variant="secondary" icon="cloud_download" disabled>
              Export Backup
            </Button>
          </div>
        </GlassCard>

        <div className="flex items-center justify-center gap-md text-emerald-400 bg-emerald-400/5 py-sm px-md rounded-full border border-emerald-400/20 w-fit mx-auto">
          <MaterialIcon name="verified_user" filled className="text-[18px]" />
          <span className="font-label-sm">Your private key never leaves this device.</span>
        </div>

        <DangerZone
          title="Wipe Private Key"
          description="Permanently delete your identity from this device. All encrypted messages will be lost forever."
          actionLabel="Wipe Private Key"
          onAction={onWipe}
        />
      </main>
    </Surface>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/keys/WipeConfirmModal.tsx`**

```tsx
"use client";

import { Button, Modal, TextInput } from "@aesmsg/ui";
import { useState } from "react";

export interface WipeConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

const CONFIRM_TOKEN = "WIPE";

export function WipeConfirmModal({ open, onCancel, onConfirm }: WipeConfirmModalProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setValue("");
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onCancel();
  };

  const handleConfirm = async () => {
    if (value !== CONFIRM_TOKEN || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
      reset();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} ariaLabel="Wipe identity confirmation" accent="danger">
      <div className="space-y-lg">
        <div className="space-y-sm">
          <h2 className="font-h2 text-h2 font-semibold text-error">Wipe Private Key</h2>
          <p className="font-body-md text-on-surface-variant">
            All encrypted messages addressed to this identity will become unreadable forever.
            This cannot be undone.
          </p>
        </div>
        <TextInput
          label={`Type ${CONFIRM_TOKEN} to confirm`}
          name="wipe-confirm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={CONFIRM_TOKEN}
          monospace
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-md">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={value !== CONFIRM_TOKEN}
            loading={submitting}
            onClick={handleConfirm}
          >
            Wipe Private Key
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Run typecheck (no tests yet for screens — covered by E2E in Task 15)**

```bash
pnpm --filter web typecheck
pnpm lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/keys
git commit -m "feat(web): add /keys route screens (set passphrase, unlock, my keys, wipe confirm modal)"
```

---

## Task 14: Wire `/keys` route + root layout

The Next.js page at `app/keys/page.tsx` selects which screen to render based on `useIdentity().state.status`. The root `app/layout.tsx` wraps `{children}` in `IdentityProvider`.

**Files:**
- Create: `apps/web/app/keys/page.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Create `apps/web/app/keys/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useIdentity } from "@/src/hooks/use-identity.js";
import { MyKeysScreen } from "@/src/keys/MyKeysScreen.js";
import { SetPassphraseScreen } from "@/src/keys/SetPassphraseScreen.js";
import { UnlockScreen } from "@/src/keys/UnlockScreen.js";
import { WipeConfirmModal } from "@/src/keys/WipeConfirmModal.js";

export default function KeysPage() {
  const { state, actions } = useIdentity();
  const [wipeOpen, setWipeOpen] = useState(false);

  return (
    <>
      {state.status === "loading" && (
        <main className="min-h-screen bg-background text-on-surface flex items-center justify-center">
          <p className="font-body-md text-on-surface-variant">Loading…</p>
        </main>
      )}

      {state.status === "no_identity" && (
        <SetPassphraseScreen onSubmit={(pw) => actions.setupNew(pw)} />
      )}

      {state.status === "locked" && (
        <UnlockScreen
          onUnlock={(pw) => actions.unlock(pw)}
          onWipe={() => setWipeOpen(true)}
        />
      )}

      {state.status === "unlocked" && (
        <MyKeysScreen
          publicKeyString={state.storedIdentity.publicKeyString}
          onWipe={() => setWipeOpen(true)}
        />
      )}

      <WipeConfirmModal
        open={wipeOpen}
        onCancel={() => setWipeOpen(false)}
        onConfirm={async () => {
          await actions.wipe();
          setWipeOpen(false);
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Modify `apps/web/app/layout.tsx`**

Replace its body with:

```tsx
import type { Metadata } from "next";
import { IdentityProvider } from "@/src/lib/identity-context.js";
import "./globals.css";

export const metadata: Metadata = {
  title: "aesmsg",
  description:
    "Zero-knowledge encryption layer for the channels you already use. Encrypt before you send.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <IdentityProvider>{children}</IdentityProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Add Material Symbols + fonts to `globals.css`**

`apps/web/app/globals.css` already imports Tailwind and the design tokens. Append the Google Fonts links and a Material Symbols variation-settings rule. Add at the bottom:

```css
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Geist:wght@400..800&family=Inter:wght@400..600&family=JetBrains+Mono:wght@400;500&display=swap");

.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
}
```

- [ ] **Step 4: Boot the dev server, smoke-test by hand**

```bash
pnpm --filter web dev
```

Open `http://localhost:3000/keys` in a browser. Confirm:

- A "Create your identity" screen renders on a dark background.
- Geist heading, Inter body, dark surface tokens applied.
- Type a 12-char passphrase in both inputs and click "Create identity". After ~500 ms (Argon2id), the unlocked screen renders with the QR code and a 4-group fingerprint.
- Reload the page. The unlock screen renders.
- Enter the passphrase again — back to unlocked.
- Click "Wipe Private Key", type "WIPE", confirm. Back to set-passphrase.

Stop the server with Ctrl-C.

- [ ] **Step 5: Run typecheck + lint**

```bash
pnpm --filter web typecheck
pnpm lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): wire /keys route + IdentityProvider in root layout"
```

---

## Task 15: End-to-end happy-path test

A single browser-mode test that exercises the full Slice 3 flow against the real `<KeysPage>` mounted under `<IdentityProvider>`.

**Files:**
- Create: `apps/web/tests/keys-page.e2e.test.tsx`

- [ ] **Step 1: Create the test**

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import KeysPage from "../app/keys/page.js";
import { IdentityProvider } from "../src/lib/identity-context.js";

function renderPage() {
  return render(
    <IdentityProvider>
      <KeysPage />
    </IdentityProvider>,
  );
}

describe("/keys end-to-end happy path", () => {
  it("walks bootstrap -> unlock -> wipe", async () => {
    const { unmount } = renderPage();

    // 1. Set passphrase appears.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create your identity" })).toBeInTheDocument(),
    );

    const passphrase = "twelve chars-passphrase";
    await act(async () => {
      await userEvent.type(screen.getByLabelText("Passphrase"), passphrase);
      await userEvent.type(screen.getByLabelText("Confirm passphrase"), passphrase);
    });
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Create identity/ }));
    });

    // 2. Unlocked view shows the fingerprint in 4-group truncated form.
    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", { name: "Identity Management" }),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
    const fpEl = await screen.findByText(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
    expect(fpEl).toBeInTheDocument();
    const originalFp = fpEl.textContent;

    // 3. Unmount and re-mount: locked view should appear.
    unmount();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Unlock your identity" })).toBeInTheDocument(),
    );

    // 4. Wrong passphrase shows error, stays on unlock screen.
    await act(async () => {
      await userEvent.type(screen.getByLabelText("Passphrase"), "wrong-passphrase!!");
      await userEvent.click(screen.getByRole("button", { name: /Unlock/ }));
    });
    await waitFor(() => expect(screen.getByText("Wrong passphrase")).toBeInTheDocument());

    // 5. Right passphrase unlocks; same fingerprint appears.
    await act(async () => {
      await userEvent.clear(screen.getByLabelText("Passphrase"));
      await userEvent.type(screen.getByLabelText("Passphrase"), passphrase);
      await userEvent.click(screen.getByRole("button", { name: /Unlock/ }));
    });
    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", { name: "Identity Management" }),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.getByText(originalFp as string)).toBeInTheDocument();

    // 6. Wipe modal: type WIPE, confirm. Returns to set-passphrase.
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Wipe Private Key" }));
    });
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Wipe identity confirmation" })).toBeInTheDocument(),
    );
    const confirmInput = screen.getByLabelText(/Type WIPE to confirm/);
    await act(async () => {
      await userEvent.type(confirmInput, "WIPE");
    });
    const wipeButton = screen
      .getAllByRole("button", { name: "Wipe Private Key" })
      .find((b) => !b.hasAttribute("disabled"));
    expect(wipeButton).toBeDefined();
    await act(async () => {
      if (wipeButton) await userEvent.click(wipeButton);
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create your identity" })).toBeInTheDocument(),
    );
  });
}, 30_000);
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter web test keys-page
```

Expected: the single E2E case passes. Total runtime is dominated by Argon2id (3 invocations: setup, wrong unlock, right unlock) + IndexedDB writes — likely 3–5 seconds total.

If the test fails on a timing issue (Argon2id taking longer than the 5 s default per-test budget), the wrapping `30_000` ms timeout already gives 30 seconds.

- [ ] **Step 3: Run the full apps/web test suite + typecheck + lint + coverage**

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm lint
pnpm --filter web test:coverage
```

Expected: all 8 tests pass (7 from Task 12 + 1 here). Coverage ≥80% on `src/` and `app/`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/keys-page.e2e.test.tsx
git commit -m "test(web): end-to-end happy path for /keys (bootstrap -> unlock -> wipe)"
```

---

## Task 16: README updates + final verification

**Files:**
- Modify: `packages/crypto/README.md` (fingerprint section)
- Modify: `packages/ui/README.md` (component catalogue)
- Modify: `apps/web/AGENTS.md` (identity context note)

- [ ] **Step 1: Update `packages/crypto/README.md`**

Find the **Fingerprint** subsection inside "Wire formats (versioned)". Replace the code block:

```
sha-256( 34-byte canonical pubkey bytes ) -> first 15 bytes -> "abcd efgh ijkl mnop qrst uvwx"
```

…with:

```
sha-256( 34-byte canonical pubkey bytes ) -> first 16 bytes -> "SM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
```

And update the surrounding line "(24 lowercase base32 chars + 5 spaces, 120 bits)" to:

```
**Fingerprint** (42 chars: `SM-` prefix + 32 uppercase hex in 8 dash-separated groups, 128 bits):
```

Also, in the Public API code block at the top, add a line above `compareFingerprint`:

```ts
truncateFingerprint(fp: Fingerprint, groups: number): string                     // for condensed displays
```

- [ ] **Step 2: Replace `packages/ui/README.md`**

Overwrite with:

```markdown
# @aesmsg/ui

Shared React component catalogue for aesmsg.

## Status

Slice 3: first batch of typed React components migrated from
[`all_design_screens/`](../../all_design_screens/) HTML mockups.

## Components

| Component | Source mockup | Purpose |
|---|---|---|
| `Surface` | (foundation) | Page background canvas. |
| `GlassCard` | every mockup | Glass-card pattern (gradient + backdrop blur + border). |
| `Button` | every mockup | `primary` / `secondary` / `danger` variants, optional icon, loading state. |
| `TextInput` | `wipe_identity_confirm_aesmsg/` | Text input with label + error slot. |
| `PasswordInput` | `set_passphrase_aesmsg/`, `unlock_passphrase_aesmsg/` | Password input. |
| `MaterialIcon` | every mockup | Wraps `<span class="material-symbols-outlined">`. |
| `FingerprintDisplay` | `my_security_keys_aesmsg/`, `my_identity_aesmsg/` | Renders a `Fingerprint` in JetBrains Mono with copy button. `truncate` prop. |
| `QrCodePreview` | `my_security_keys_aesmsg/`, `my_identity_aesmsg/` | SVG QR of a public key. |
| `DangerZone` | `my_security_keys_aesmsg/` | "Wipe Private Key" surface. |
| `Modal` | `wipe_identity_confirm_aesmsg/` | Backdrop + centered card primitive. |
| `TopAppBar` | `my_security_keys_aesmsg/` | Header with aesmsg wordmark. |
| `SideNav` | `my_security_keys_aesmsg/` | Web-only sidebar (md+ breakpoint). |

## Tests

Browser-mode (Vitest browser + Playwright + headless Chromium + React
Testing Library). Run `pnpm --filter @aesmsg/ui test`.

Coverage gate: ≥85% lines on `src/`.

## What does NOT belong here

- App-specific routing logic (lives in `apps/web/app/`).
- Crypto operations (always import from `@aesmsg/crypto`).
- Network calls (always go through API route handlers in `apps/web`).
- Storage (always go through `@aesmsg/key-store`).
```

- [ ] **Step 3: Append to `apps/web/AGENTS.md`** (or create the section if absent)

Open `apps/web/AGENTS.md`. After the existing `<!-- END:nextjs-agent-rules -->` line, append:

```markdown

## Identity context (Slice 3)

The web app wraps every route in `<IdentityProvider>` (rooted in
`app/layout.tsx`). The provider reads from `@aesmsg/key-store` at mount and
exposes a state machine via `useIdentity()`:

```ts
state: { status: "loading" | "no_identity" | "locked" | "unlocked"; … };
actions: { setupNew, unlock, lock, wipe };
```

- The unwrapped `IdentityKeypair` lives in tab memory only. Closing the tab
  drops it; reopening returns the user to the locked state.
- `setupNew` and `unlock` perform Argon2id (~300–800 ms). UI components must
  show a loading state on the action button — the existing `<Button loading>`
  prop handles this.
- `wipe` is irreversible by design. The UI funnels every wipe through the
  type-to-confirm `<WipeConfirmModal>`.
- Tests run under Vitest browser mode (Chromium headless via Playwright) with
  IndexedDB cleared between cases by `tests/setup.ts`.
```

- [ ] **Step 4: Final clean-install verification**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

Expected:
- `pnpm install` clean.
- `pnpm typecheck` passes for every workspace.
- `pnpm lint` clean (Biome).
- `pnpm test` runs every workspace's tests:
  - `@aesmsg/design-tokens` — 6 passed
  - `@aesmsg/crypto` — Node + browser, ≥100 tests
  - `@aesmsg/key-store` — 13 passed
  - `@aesmsg/ui` — ≥37 component tests
  - `web` — 8 tests (7 state-machine + 1 E2E)

- [ ] **Step 5: Coverage spot-check**

```bash
pnpm --filter @aesmsg/crypto test:coverage
pnpm --filter @aesmsg/key-store test:coverage
pnpm --filter @aesmsg/ui test:coverage
pnpm --filter web test:coverage
```

Expected: crypto + key-store ≥95%, ui ≥85%, web ≥80%.

- [ ] **Step 6: Commit**

```bash
git add packages/crypto/README.md packages/ui/README.md apps/web/AGENTS.md
git commit -m "docs: update READMEs + AGENTS.md for Slice 3 (fingerprint format, ui catalogue, identity context)"
```

- [ ] **Step 7: Final state check**

```bash
git status
git log --oneline | head -25
```

Expected: working tree clean. The Slice 3 commits look roughly like:

```
docs: update READMEs + AGENTS.md for Slice 3 ...
test(web): end-to-end happy path for /keys ...
feat(web): wire /keys route + IdentityProvider in root layout
feat(web): add /keys route screens ...
feat(web): add IdentityProvider + useIdentity bootstrap state machine
chore(web): set up Vitest browser mode + RTL for Slice 3 tests
feat(ui): add Modal, TopAppBar, SideNav
feat(ui): add DangerZone component ...
feat(ui): add QrCodePreview rendering SVG via qrcode npm package
feat(ui): add FingerprintDisplay with truncate prop and clipboard copy
feat(ui): add TextInput and PasswordInput ...
feat(ui): add Button with primary/secondary/danger variants and loading state
feat(ui): add Surface, GlassCard, MaterialIcon primitives
chore(ui): scaffold packages/ui for browser-mode component tests ...
design: add set-passphrase, unlock, wipe-confirm mockups for Slice 3
refactor(crypto): fingerprint format -> SM-XXXX-... per design system + truncateFingerprint
docs: add Slice 3 (identity bootstrap UI) implementation plan
docs: add Slice 3 (identity bootstrap UI) design spec
```

---

## Self-review

**1. Spec coverage:**

Walking each section of [`docs/superpowers/specs/2026-05-09-identity-bootstrap-design.md`](../specs/2026-05-09-identity-bootstrap-design.md):

- §4 Fingerprint format change → Task 1 (refactor + tests + helper).
- §5 Three new mockups → Task 2 (HTML + screen-list update).
- §6 UI components → Tasks 3 (scaffold), 4 (Surface/GlassCard/MaterialIcon), 5 (Button), 6 (TextInput/PasswordInput), 7 (FingerprintDisplay), 8 (QrCodePreview), 9 (DangerZone), 10 (Modal/TopAppBar/SideNav). 12 components, all tested.
- §7 `apps/web` integration → Tasks 11 (test setup), 12 (identity context), 13 (route screens), 14 (route + layout wiring).
- §8 Tests → Task 12 (state-machine), Task 15 (E2E).
- §9 Definition of done → Task 16 verifies each criterion.
- §10 Risks → mitigated inline (Argon2id timing → `loading` prop on Button; clipboard requires HTTPS/localhost → noted in spec; QR module variability → pinned major in package.json).

No gaps.

**2. Placeholder scan:**

Three intentional "verify against runtime" hooks exist:

- Task 11 Step 5 — placeholder test for boot-up of the runner; immediately deleted in Task 12 Step 4.
- Task 14 Step 4 — manual smoke test in a real browser before E2E test runs (Task 15).

Neither is a plan placeholder. No `TBD` / `TODO` / "implement later" / "appropriate error handling" patterns anywhere.

**3. Type consistency:**

- `Fingerprint` brand — used identically across Task 1 (crypto), Task 7 (`<FingerprintDisplay>` consumes via prop), Task 13 (`<MyKeysScreen>` derives via `fingerprint(publicKeyString)`).
- `IdentityKeypair`, `StoredIdentity`, `WrappedKey`, `PublicKeyString` — match definitions from Slices 1 & 2; never re-declared.
- `IdentityState` discriminator — defined in Task 12, consumed in Tasks 13 (route screens read `state.storedIdentity`) and 14 (page narrows on `state.status`).
- `BadPassphraseError` — caught in Task 13 (`<UnlockScreen>`'s submit handler) and asserted in Task 12 (state-machine tests). Both reference the export from `@aesmsg/crypto`.
- `ButtonVariant`, `ButtonProps` — defined in Task 5, consumed by Tasks 9 (`<DangerZone>` uses `danger`), 13 (every screen uses `primary` / `secondary`).
- `SideNavItem` — defined in Task 10; not consumed in Slice 3 routes (no nav rendering in `/keys`) but exported for Slice 4+.

Consistent.

---

## Risks during execution

- **Tailwind 4 + custom token classes.** The `@theme` block in `@aesmsg/design-tokens/theme.css` defines `font-display`, `text-h1`, `bg-surface-container`, etc. If a class doesn't take effect, run `pnpm --filter web exec next build` once to force PostCSS to re-scan; verify the token is exported in `packages/design-tokens/src/theme.css`.
- **Material Symbols font load.** The Google Fonts URL must succeed at runtime; offline / CSP-restricted setups will fall back to plain text. Tests assert structural properties (the `<span class="material-symbols-outlined">` exists), not visual rendering, so they pass either way.
- **`navigator.clipboard.writeText` in tests.** The browser-mode tests run in headless Chromium with the clipboard permission denied by default. Tasks 7 + 13 stub `navigator.clipboard` in Task 7's test (`Object.assign(navigator, { clipboard: ... })`); the E2E in Task 15 does not stub — if it fails on a clipboard-permission error, add the same stub at the top of `keys-page.e2e.test.tsx`.
- **IndexedDB cleanup races.** `apps/web/tests/setup.ts` deletes the database between tests; if a transaction is mid-flight when the next test starts, occasional flakes can occur. Mitigation: every test that wraps `actions.setupNew` / `actions.wipe` does so inside `await act(async () => …)` so React state and the IndexedDB transaction both settle before the next assertion.
- **Argon2id wasm download in test runner.** First-run Vitest browser mode pulls the `hash-wasm` Argon2id wasm from the package; ensure the dev environment has cached it before timing-sensitive tests run. Mitigation: run `pnpm --filter @aesmsg/crypto test:browser` once before running web's E2E to warm the cache.
- **State-machine `unlock` reentry.** If a user double-clicks "Unlock", two unwraps run concurrently. The `submitting` flag in `<UnlockScreen>` and `<SetPassphraseScreen>` short-circuits re-entries. The state-machine tests in Task 12 exercise sequential calls only — concurrent-call protection is a UI concern, not a context concern.
- **Next.js 16 RSC vs Client Component split.** `IdentityProvider` and every route screen use `"use client"`. The root `app/layout.tsx` itself stays an RSC; only the children are client. The `keys/page.tsx` is `"use client"` because it consumes `useIdentity`. Verify on dev boot that no "you cannot use Hooks in Server Components" error surfaces.
