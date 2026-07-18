# Project Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay down a pnpm monorepo skeleton for aesmsg (zero-knowledge encrypted-link product) with strict-TS workspace tooling, an `apps/web` Next.js placeholder, and three workspace packages (`crypto`, `design-tokens`, `ui`) ready for Phase 1 to fill in.

**Architecture:** pnpm workspace at the repo root. `apps/` for runnable apps (web today, mobile deferred). `packages/` for reusable code (`crypto` is no-DOM, no-network, mobile-portable; `design-tokens` is the single source for `DESIGN.md` values; `ui` is the React component catalogue). Tooling: TypeScript strict, Biome lint+format, Vitest tests. Scaffolding does **not** include Phase 1 application logic — only structure, tooling, and type-stub interfaces.

**Tech Stack:** Node 22 LTS, pnpm 10, TypeScript 5 (latest), Next.js latest stable (explicitly **not** 15.x), React 19, Tailwind CSS 4, Biome 2, Vitest 3, `@hpke/core` (declared in spec, installed in Phase 1).

**Spec:** [docs/superpowers/specs/2026-05-09-project-init-design.md](../specs/2026-05-09-project-init-design.md)

---

## File structure target

After this plan completes, the repo looks like:

```
aesmsg/
├─ .editorconfig
├─ .gitignore
├─ .nvmrc
├─ biome.json
├─ CLAUDE.md                       (modified — adds "working in the codebase" section)
├─ LICENSE                         (Apache 2.0)
├─ README.md
├─ package.json                    (workspace root)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ all_design_screens/             (untouched)
├─ apps/
│  ├─ mobile/
│  │  └─ DECISION-DEFERRED.md
│  └─ web/
│     ├─ app/
│     │  ├─ globals.css
│     │  ├─ layout.tsx
│     │  └─ page.tsx               (placeholder)
│     ├─ next.config.ts
│     ├─ package.json
│     ├─ postcss.config.mjs
│     └─ tsconfig.json
├─ docs/
│  └─ superpowers/
│     ├─ plans/2026-05-09-project-initialization.md  (this file)
│     └─ specs/2026-05-09-project-init-design.md
└─ packages/
   ├─ crypto/
   │  ├─ package.json
   │  ├─ README.md                 (API + algorithm rationale)
   │  ├─ src/
   │  │  ├─ index.ts               (type-stub barrel)
   │  │  └─ types.ts
   │  ├─ tests/
   │  │  └─ stubs.test.ts          (asserts API surface; impl throws NotImplemented)
   │  ├─ tsconfig.json
   │  └─ vitest.config.ts
   ├─ design-tokens/
   │  ├─ package.json
   │  ├─ README.md
   │  ├─ src/
   │  │  ├─ colors.ts
   │  │  ├─ index.ts
   │  │  ├─ rounded.ts
   │  │  ├─ spacing.ts
   │  │  ├─ theme.css              (Tailwind 4 @theme directive)
   │  │  └─ typography.ts
   │  ├─ tests/
   │  │  └─ tokens.test.ts
   │  ├─ tsconfig.json
   │  └─ vitest.config.ts
   └─ ui/
      ├─ package.json
      ├─ README.md
      ├─ src/index.ts              (empty barrel)
      └─ tsconfig.json
```

---

## Task 1: Initialize git + base files

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `LICENSE`
- Create: `README.md`

- [ ] **Step 1: Initialize git repository**

Run: `git init`
Expected output: `Initialized empty Git repository in /path/to/aesmsg/.git/`

- [ ] **Step 2: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
build/
.next/
out/
*.tsbuildinfo

# Test output
coverage/
.nyc_output/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# Editor / OS
.DS_Store
.idea/
.vscode/
*.swp
*.swo
Thumbs.db

# Env files (NEVER commit)
.env
.env.local
.env.*.local

# Misc
.cache/
.turbo/
```

- [ ] **Step 3: Create `.editorconfig`**

```editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Create `.nvmrc`**

```
22
```

- [ ] **Step 5: Create `LICENSE` (Apache 2.0)**

Run: `curl -fsSL https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSE`
Expected: file written, ~11kb. Verify with: `head -2 LICENSE` → "Apache License" / "Version 2.0, January 2004".

- [ ] **Step 6: Create `README.md` (placeholder)**

```markdown
# aesmsg

Zero-knowledge encryption layer for the channels you already use.

aesmsg turns sensitive content into a shareable link to ciphertext that you paste into Slack, WhatsApp, email, or any other channel. The channel only ever transports an opaque link — only the intended recipient can decrypt the contents on their device.

This repo currently contains the design artifacts in [`all_design_screens/`](all_design_screens/) and a workspace skeleton. Phase 1 (web MVP) implementation is in progress.

## Status

- Phase 0 (this commit): monorepo + tooling skeleton, design artifacts intact
- Phase 1 (next): web MVP — text encryption, 24h expiry, manual PKI
- Phase 2: native mobile (stack TBD — see `apps/mobile/DECISION-DEFERRED.md`)
- Phase 3: enterprise (admin controls, audit logs, team directories)

## Working in this repo

- Node 22, pnpm 10. Use `corepack enable` then commands work.
- `pnpm install` from the repo root installs all workspaces.
- `pnpm dev` boots the web app (Phase 1 placeholder for now).
- `pnpm typecheck` runs TS across all workspaces.
- `pnpm lint` runs Biome.
- `pnpm test` runs Vitest across all workspaces.

## License

Apache 2.0 — see [LICENSE](LICENSE).
```

- [ ] **Step 7: Verify files in place**

Run: `ls -la`
Expected: `.gitignore`, `.editorconfig`, `.nvmrc`, `LICENSE`, `README.md` all present alongside existing `CLAUDE.md` and `all_design_screens/`.

- [ ] **Step 8: Commit**

```bash
git add .gitignore .editorconfig .nvmrc LICENSE README.md
git commit -m "chore: initialize repo with baseline files (Apache 2.0, .gitignore, .editorconfig, .nvmrc, README placeholder)"
```

---

## Task 2: Workspace root configuration

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Enable corepack and verify pnpm**

Run: `corepack enable && pnpm --version`
Expected: a version string like `10.x.x`. If pnpm is not on the PATH after corepack, run `corepack prepare pnpm@latest --activate` and re-check.

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "aesmsg",
  "version": "0.0.0",
  "private": true,
  "license": "Apache-2.0",
  "description": "Zero-knowledge encryption layer for existing channels",
  "engines": {
    "node": ">=22.0.0"
  },
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --filter web dev",
    "typecheck": "pnpm -r typecheck",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

Note: the `packageManager` pin should be updated to whatever `pnpm --version` reported in Step 1. Edit the file to match before saving.

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "incremental": true
  }
}
```

- [ ] **Step 5: Run pnpm install (validates workspace layout)**

Run: `pnpm install`
Expected: `Done` with no errors. A `pnpm-lock.yaml` is generated. `node_modules/` appears at root with TypeScript installed.

- [ ] **Step 6: Verify TypeScript is callable**

Run: `pnpm exec tsc --version`
Expected: `Version 5.x.x` matching what was resolved.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: set up pnpm workspace with strict TypeScript base config"
```

---

## Task 3: Biome configuration

**Files:**
- Create: `biome.json`
- Modify: root `package.json` (Biome already in scripts; add the dev dep)

- [ ] **Step 1: Install Biome at workspace root**

Run: `pnpm add -D -w @biomejs/biome@latest`
Expected: a single `@biomejs/biome` entry appears in root `package.json` under `devDependencies`. Lockfile updated.

- [ ] **Step 2: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true,
    "includes": [
      "**",
      "!node_modules/**",
      "!**/dist/**",
      "!**/.next/**",
      "!all_design_screens/**",
      "!pnpm-lock.yaml"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

Note: `all_design_screens/**` is excluded — the existing HTML mockups use Tailwind CDN and inline JSON config that would generate noise. They will be migrated into typed components in Phase 1.

- [ ] **Step 3: Run Biome to verify config is valid**

Run: `pnpm exec biome check .`
Expected: command exits cleanly. Output may say "Checked 0 files" since no source files exist yet — that is expected and fine.

- [ ] **Step 4: Commit**

```bash
git add biome.json package.json pnpm-lock.yaml
git commit -m "chore: add Biome lint+format with workspace-wide config"
```

---

## Task 4: design-tokens package

**Files:**
- Create: `packages/design-tokens/package.json`
- Create: `packages/design-tokens/tsconfig.json`
- Create: `packages/design-tokens/vitest.config.ts`
- Create: `packages/design-tokens/README.md`
- Create: `packages/design-tokens/src/colors.ts`
- Create: `packages/design-tokens/src/typography.ts`
- Create: `packages/design-tokens/src/spacing.ts`
- Create: `packages/design-tokens/src/rounded.ts`
- Create: `packages/design-tokens/src/index.ts`
- Create: `packages/design-tokens/src/theme.css`
- Create: `packages/design-tokens/tests/tokens.test.ts`

The values come straight from the YAML frontmatter of [`all_design_screens/secure_message_design_system/DESIGN.md`](../../../all_design_screens/secure_message_design_system/DESIGN.md). Treat the frontmatter as the source of truth — the prose body of that file has stale colors that conflict; ignore the prose colors and use the YAML.

- [ ] **Step 1: Create directory and `package.json`**

Run: `mkdir -p packages/design-tokens/src packages/design-tokens/tests`

`packages/design-tokens/package.json`:

```json
{
  "name": "@aesmsg/design-tokens",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./theme.css": "./src/theme.css",
    "./colors": "./src/colors.ts",
    "./typography": "./src/typography.ts",
    "./spacing": "./src/spacing.ts",
    "./rounded": "./src/rounded.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/design-tokens/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/design-tokens/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the failing test for tokens**

`packages/design-tokens/tests/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { colors, rounded, spacing, typography } from "../src/index.js";

describe("design tokens", () => {
  it("exposes the dark surface color from DESIGN.md", () => {
    expect(colors.surface).toBe("#141218");
  });

  it("exposes the Electric Violet primary color from DESIGN.md", () => {
    expect(colors.primary).toBe("#cfbcff");
  });

  it("exposes the surface-container ladder", () => {
    expect(colors.surfaceContainerLowest).toBe("#0f0d13");
    expect(colors.surfaceContainerLow).toBe("#1d1b20");
    expect(colors.surfaceContainer).toBe("#211f24");
    expect(colors.surfaceContainerHigh).toBe("#2b292f");
    expect(colors.surfaceContainerHighest).toBe("#36343a");
  });

  it("exposes the typography scale with Geist for headings", () => {
    expect(typography.display.fontFamily).toBe("Geist");
    expect(typography.h1.fontFamily).toBe("Geist");
    expect(typography.bodyMd.fontFamily).toBe("Inter");
    expect(typography.monoCode.fontFamily).toBe("JetBrains Mono");
  });

  it("exposes 8px-based spacing scale", () => {
    expect(spacing.xs).toBe("4px");
    expect(spacing.sm).toBe("8px");
    expect(spacing.md).toBe("16px");
    expect(spacing.lg).toBe("24px");
    expect(spacing.xl).toBe("48px");
    expect(spacing.xxl).toBe("80px");
  });

  it("exposes the rounded scale", () => {
    expect(rounded.sm).toBe("0.25rem");
    expect(rounded.DEFAULT).toBe("0.5rem");
    expect(rounded.md).toBe("0.75rem");
    expect(rounded.lg).toBe("1rem");
    expect(rounded.xl).toBe("1.5rem");
    expect(rounded.full).toBe("9999px");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @aesmsg/design-tokens test`
Expected: install resolves Vitest, then test FAILS with module resolution errors (`Cannot find module '../src/index.js'`) — this is the failing-test state we want.

- [ ] **Step 6: Create `packages/design-tokens/src/colors.ts`**

```ts
export const colors = {
  surface: "#141218",
  surfaceDim: "#141218",
  surfaceBright: "#3b383e",
  surfaceContainerLowest: "#0f0d13",
  surfaceContainerLow: "#1d1b20",
  surfaceContainer: "#211f24",
  surfaceContainerHigh: "#2b292f",
  surfaceContainerHighest: "#36343a",
  onSurface: "#e6e0e9",
  onSurfaceVariant: "#cbc4d2",
  inverseSurface: "#e6e0e9",
  inverseOnSurface: "#322f35",
  outline: "#948e9c",
  outlineVariant: "#494551",
  surfaceTint: "#cfbcff",
  primary: "#cfbcff",
  onPrimary: "#381e72",
  primaryContainer: "#6750a4",
  onPrimaryContainer: "#e0d2ff",
  inversePrimary: "#6750a4",
  secondary: "#cdc0e9",
  onSecondary: "#342b4b",
  secondaryContainer: "#4d4465",
  onSecondaryContainer: "#bfb2da",
  tertiary: "#e7c365",
  onTertiary: "#3e2e00",
  tertiaryContainer: "#c9a74d",
  onTertiaryContainer: "#503d00",
  error: "#ffb4ab",
  onError: "#690005",
  errorContainer: "#93000a",
  onErrorContainer: "#ffdad6",
  primaryFixed: "#e9ddff",
  primaryFixedDim: "#cfbcff",
  onPrimaryFixed: "#22005d",
  onPrimaryFixedVariant: "#4f378a",
  secondaryFixed: "#e9ddff",
  secondaryFixedDim: "#cdc0e9",
  onSecondaryFixed: "#1f1635",
  onSecondaryFixedVariant: "#4b4263",
  tertiaryFixed: "#ffdf93",
  tertiaryFixedDim: "#e7c365",
  onTertiaryFixed: "#241a00",
  onTertiaryFixedVariant: "#594400",
  background: "#141218",
  onBackground: "#e6e0e9",
  surfaceVariant: "#36343a",
} as const;

export type ColorToken = keyof typeof colors;
```

- [ ] **Step 7: Create `packages/design-tokens/src/typography.ts`**

```ts
export const typography = {
  display: {
    fontFamily: "Geist",
    fontSize: "48px",
    fontWeight: "600",
    lineHeight: "1.1",
    letterSpacing: "-0.04em",
  },
  h1: {
    fontFamily: "Geist",
    fontSize: "32px",
    fontWeight: "600",
    lineHeight: "1.2",
    letterSpacing: "-0.02em",
  },
  h2: {
    fontFamily: "Geist",
    fontSize: "24px",
    fontWeight: "500",
    lineHeight: "1.3",
    letterSpacing: "-0.01em",
  },
  bodyLg: {
    fontFamily: "Inter",
    fontSize: "18px",
    fontWeight: "400",
    lineHeight: "1.6",
  },
  bodyMd: {
    fontFamily: "Inter",
    fontSize: "15px",
    fontWeight: "400",
    lineHeight: "1.5",
  },
  labelSm: {
    fontFamily: "Inter",
    fontSize: "13px",
    fontWeight: "500",
    lineHeight: "1.4",
    letterSpacing: "0.05em",
  },
  monoCode: {
    fontFamily: "JetBrains Mono",
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "1.5",
  },
} as const;

export type TypographyToken = keyof typeof typography;
```

- [ ] **Step 8: Create `packages/design-tokens/src/spacing.ts`**

```ts
export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "48px",
  xxl: "80px",
} as const;

export type SpacingToken = keyof typeof spacing;
```

- [ ] **Step 9: Create `packages/design-tokens/src/rounded.ts`**

```ts
export const rounded = {
  sm: "0.25rem",
  DEFAULT: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  full: "9999px",
} as const;

export type RoundedToken = keyof typeof rounded;
```

- [ ] **Step 10: Create `packages/design-tokens/src/index.ts`**

```ts
export { colors } from "./colors.js";
export type { ColorToken } from "./colors.js";
export { typography } from "./typography.js";
export type { TypographyToken } from "./typography.js";
export { spacing } from "./spacing.js";
export type { SpacingToken } from "./spacing.js";
export { rounded } from "./rounded.js";
export type { RoundedToken } from "./rounded.js";
```

- [ ] **Step 11: Create `packages/design-tokens/src/theme.css`** (Tailwind 4 `@theme` directive)

```css
@theme {
  /* Surfaces */
  --color-surface: #141218;
  --color-surface-dim: #141218;
  --color-surface-bright: #3b383e;
  --color-surface-container-lowest: #0f0d13;
  --color-surface-container-low: #1d1b20;
  --color-surface-container: #211f24;
  --color-surface-container-high: #2b292f;
  --color-surface-container-highest: #36343a;
  --color-on-surface: #e6e0e9;
  --color-on-surface-variant: #cbc4d2;
  --color-inverse-surface: #e6e0e9;
  --color-inverse-on-surface: #322f35;
  --color-outline: #948e9c;
  --color-outline-variant: #494551;
  --color-surface-tint: #cfbcff;

  /* Primary / Accent */
  --color-primary: #cfbcff;
  --color-on-primary: #381e72;
  --color-primary-container: #6750a4;
  --color-on-primary-container: #e0d2ff;
  --color-inverse-primary: #6750a4;

  /* Secondary */
  --color-secondary: #cdc0e9;
  --color-on-secondary: #342b4b;
  --color-secondary-container: #4d4465;
  --color-on-secondary-container: #bfb2da;

  /* Tertiary */
  --color-tertiary: #e7c365;
  --color-on-tertiary: #3e2e00;
  --color-tertiary-container: #c9a74d;
  --color-on-tertiary-container: #503d00;

  /* Error / destructive */
  --color-error: #ffb4ab;
  --color-on-error: #690005;
  --color-error-container: #93000a;
  --color-on-error-container: #ffdad6;

  /* Fixed */
  --color-primary-fixed: #e9ddff;
  --color-primary-fixed-dim: #cfbcff;
  --color-on-primary-fixed: #22005d;
  --color-on-primary-fixed-variant: #4f378a;
  --color-secondary-fixed: #e9ddff;
  --color-secondary-fixed-dim: #cdc0e9;
  --color-on-secondary-fixed: #1f1635;
  --color-on-secondary-fixed-variant: #4b4263;
  --color-tertiary-fixed: #ffdf93;
  --color-tertiary-fixed-dim: #e7c365;
  --color-on-tertiary-fixed: #241a00;
  --color-on-tertiary-fixed-variant: #594400;

  /* Background */
  --color-background: #141218;
  --color-on-background: #e6e0e9;
  --color-surface-variant: #36343a;

  /* Spacing — 8px-based scale (xs, sm, md, lg, xl, xxl) */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 48px;
  --spacing-xxl: 80px;

  /* Radii */
  --radius-sm: 0.25rem;
  --radius-default: 0.5rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;
  --radius-full: 9999px;

  /* Type — fonts */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-display: "Geist", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

- [ ] **Step 12: Create `packages/design-tokens/README.md`**

```markdown
# @aesmsg/design-tokens

Single source of truth for the aesmsg design system tokens — colors, typography, spacing, radii — defined in [`all_design_screens/secure_message_design_system/DESIGN.md`](../../all_design_screens/secure_message_design_system/DESIGN.md).

## Why this exists

The token values are the contract between design and implementation. Centralizing them here means:

- The web app (Tailwind 4) and any future mobile target (RN, KMM, native) consume the same source.
- Updating a token requires editing one file, not chasing every consumer.
- Tests pin the values so accidental drift is caught.

## Consumers

- **Tailwind 4 / `apps/web`**: import `@aesmsg/design-tokens/theme.css` from `app/globals.css`. Tailwind picks up the `@theme` block.
- **Programmatic / non-CSS**: import the named exports — `colors`, `typography`, `spacing`, `rounded`.

## Source-of-truth precedence

The YAML frontmatter at the top of `DESIGN.md` is authoritative. The prose body of that file has older draft colors that conflict — they are intentionally **not** mirrored here.
```

- [ ] **Step 13: Run install + test, verify it now passes**

Run: `pnpm install` (resolves Vitest into the new package)
Run: `pnpm --filter @aesmsg/design-tokens test`
Expected: `6 passed`. All token assertions green.

- [ ] **Step 14: Run typecheck**

Run: `pnpm --filter @aesmsg/design-tokens typecheck`
Expected: no output, exit code 0.

- [ ] **Step 15: Commit**

```bash
git add packages/design-tokens package.json pnpm-lock.yaml
git commit -m "feat(design-tokens): add @aesmsg/design-tokens package mirroring DESIGN.md frontmatter"
```

---

## Task 5: crypto package skeleton

**Files:**
- Create: `packages/crypto/package.json`
- Create: `packages/crypto/tsconfig.json`
- Create: `packages/crypto/vitest.config.ts`
- Create: `packages/crypto/README.md`
- Create: `packages/crypto/src/types.ts`
- Create: `packages/crypto/src/index.ts`
- Create: `packages/crypto/tests/stubs.test.ts`

This task ships **type stubs only**. Every exported function throws `NotImplementedError`. Phase 1 will replace the bodies with real HPKE-backed implementations. The stubs exist now so:
- the public API surface is locked and documented,
- consumer packages can wire imports without waiting on real crypto,
- the test that asserts "all stubs throw NotImplemented" prevents accidental shipping of partial implementations.

- [ ] **Step 1: Create directory and `package.json`**

Run: `mkdir -p packages/crypto/src packages/crypto/tests`

`packages/crypto/package.json`:

```json
{
  "name": "@aesmsg/crypto",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/crypto/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "lib": ["ES2022"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

Note: `lib` excludes DOM intentionally. The crypto package must remain DOM-free so it ports cleanly to React Native or other non-browser runtimes.

- [ ] **Step 3: Create `packages/crypto/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the failing test**

`packages/crypto/tests/stubs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  importPublicKey,
  NotImplementedError,
  open,
  seal,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "../src/index.js";

describe("@aesmsg/crypto stubs", () => {
  it("exposes generateIdentity that throws NotImplementedError", async () => {
    await expect(generateIdentity()).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("exposes exportPublicKey that throws NotImplementedError", () => {
    expect(() => exportPublicKey({} as never)).toThrow(NotImplementedError);
  });

  it("exposes importPublicKey that throws NotImplementedError", () => {
    expect(() => importPublicKey("placeholder")).toThrow(NotImplementedError);
  });

  it("exposes fingerprint that throws NotImplementedError", () => {
    expect(() => fingerprint("placeholder")).toThrow(NotImplementedError);
  });

  it("exposes seal that throws NotImplementedError", async () => {
    await expect(seal(new Uint8Array(), {} as never)).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("exposes open that throws NotImplementedError", async () => {
    await expect(open({} as never, {} as never)).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("exposes wrapPrivateKey that throws NotImplementedError", async () => {
    await expect(wrapPrivateKey({} as never, "passphrase")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("exposes unwrapPrivateKey that throws NotImplementedError", async () => {
    await expect(unwrapPrivateKey({} as never, "passphrase")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});
```

- [ ] **Step 5: Run install + test, expect failure**

Run: `pnpm install`
Run: `pnpm --filter @aesmsg/crypto test`
Expected: FAIL with `Cannot find module '../src/index.js'`. This is the red state.

- [ ] **Step 6: Create `packages/crypto/src/types.ts`**

```ts
declare const __idBrand: unique symbol;
declare const __pubBrand: unique symbol;
declare const __ctBrand: unique symbol;
declare const __wrappedBrand: unique symbol;
declare const __pkStrBrand: unique symbol;
declare const __fpBrand: unique symbol;

export type IdentityKeypair = { readonly [__idBrand]: void };
export type RecipientPublicKey = { readonly [__pubBrand]: void };
export type Ciphertext = { readonly [__ctBrand]: void };
export type WrappedKey = { readonly [__wrappedBrand]: void };
export type PublicKeyString = string & { readonly [__pkStrBrand]: void };
export type Fingerprint = string & { readonly [__fpBrand]: void };
```

These are nominal-typed brands. Phase 1 will give them concrete shapes (e.g., `IdentityKeypair = { publicKey: Uint8Array; privateKey: Uint8Array }`) — for now they are opaque to consumers, which keeps the API surface minimal until the real implementation arrives.

- [ ] **Step 7: Create `packages/crypto/src/index.ts`**

```ts
import type {
  Ciphertext,
  Fingerprint,
  IdentityKeypair,
  PublicKeyString,
  RecipientPublicKey,
  WrappedKey,
} from "./types.js";

export type {
  Ciphertext,
  Fingerprint,
  IdentityKeypair,
  PublicKeyString,
  RecipientPublicKey,
  WrappedKey,
};

export class NotImplementedError extends Error {
  constructor(symbol: string) {
    super(`@aesmsg/crypto: ${symbol} is not implemented yet (Phase 1).`);
    this.name = "NotImplementedError";
  }
}

export async function generateIdentity(): Promise<IdentityKeypair> {
  throw new NotImplementedError("generateIdentity");
}

export function exportPublicKey(_id: IdentityKeypair): PublicKeyString {
  throw new NotImplementedError("exportPublicKey");
}

export function importPublicKey(_s: string): RecipientPublicKey {
  throw new NotImplementedError("importPublicKey");
}

export function fingerprint(_pk: string): Fingerprint {
  throw new NotImplementedError("fingerprint");
}

export async function seal(
  _plaintext: Uint8Array,
  _recipient: RecipientPublicKey,
  _aad?: Uint8Array,
): Promise<Ciphertext> {
  throw new NotImplementedError("seal");
}

export async function open(
  _ciphertext: Ciphertext,
  _id: IdentityKeypair,
  _aad?: Uint8Array,
): Promise<Uint8Array> {
  throw new NotImplementedError("open");
}

export async function wrapPrivateKey(
  _id: IdentityKeypair,
  _passphrase: string,
): Promise<WrappedKey> {
  throw new NotImplementedError("wrapPrivateKey");
}

export async function unwrapPrivateKey(
  _wrapped: WrappedKey,
  _passphrase: string,
): Promise<IdentityKeypair> {
  throw new NotImplementedError("unwrapPrivateKey");
}
```

- [ ] **Step 8: Create `packages/crypto/README.md`**

```markdown
# @aesmsg/crypto

Trust-critical encryption primitives for aesmsg. **No DOM. No network. No storage.**
This package is the only place that knows how the product encrypts and decrypts data.

## Status

**Skeleton only.** The public API surface is defined; every function throws `NotImplementedError`.
Phase 1 lands the real implementation against the contracts described below.

## Public API

```ts
generateIdentity(): Promise<IdentityKeypair>
exportPublicKey(id: IdentityKeypair): PublicKeyString
importPublicKey(s: string): RecipientPublicKey
fingerprint(pk: string): Fingerprint
seal(plaintext: Uint8Array, recipient: RecipientPublicKey, aad?: Uint8Array): Promise<Ciphertext>
open(ciphertext: Ciphertext, id: IdentityKeypair, aad?: Uint8Array): Promise<Uint8Array>
wrapPrivateKey(id: IdentityKeypair, passphrase: string): Promise<WrappedKey>
unwrapPrivateKey(wrapped: WrappedKey, passphrase: string): Promise<IdentityKeypair>
```

## Algorithm choices (locked by spec)

- **Hybrid public-key encryption: HPKE (RFC 9180)** via [`@hpke/core`](https://github.com/dajiaji/hpke-js).
  Suite: `DHKEM(X25519, HKDF-SHA256)` KEM + `HKDF-SHA256` KDF + `AES-256-GCM` AEAD.
  Satisfies both "modern curve" (X25519) and the PRD's AES-256-GCM requirement.
- **Local key wrap: Argon2id** for passphrase derivation → AES-256-GCM for the wrap.
  Fallback: PBKDF2-SHA256 (≥600k iterations) if the Argon2 wasm cost becomes a problem.
- **Fingerprint encoding:** SHA-256 of the public-key bytes, encoded as 6 groups of 4 lowercase
  base32 characters separated by spaces (24 chars total, ≈120 bits) — enough for manual
  human verification.

## Portability

This package is intentionally DOM-free and network-free. The same primitives must port to:

- React Native / native mobile (Phase 2) — direct bridging via the same lib or a native HPKE.
- Server-side (Node) — used in tests, never on the production server runtime, since the server
  never sees plaintext.

## Tests

Phase 1 will add: RFC 9180 Appendix A KAT vectors, round-trip property tests, wrong-key
failure tests, and ciphertext-tamper tests (any single-byte mutation must cause `open` to throw).

The current skeleton test in `tests/stubs.test.ts` only asserts that every export exists and
throws `NotImplementedError`. This catches accidental partial implementations from being
shipped.
```

- [ ] **Step 9: Run the test, verify it now passes**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: `8 passed`.

- [ ] **Step 10: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0.

- [ ] **Step 11: Commit**

```bash
git add packages/crypto pnpm-lock.yaml
git commit -m "feat(crypto): add @aesmsg/crypto skeleton with type stubs (HPKE-bound API)"
```

---

## Task 6: ui package skeleton

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/README.md`

This package is intentionally near-empty at scaffold time. The first React component lands in Phase 1; the package exists now so consumers can declare the workspace dependency.

- [ ] **Step 1: Create directory and `package.json`**

Run: `mkdir -p packages/ui/src`

`packages/ui/package.json`:

```json
{
  "name": "@aesmsg/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "echo 'no tests yet (Phase 1 adds component tests)' && exit 0"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/ui/src/index.ts`**

```ts
// @aesmsg/ui — shared React component catalogue.
// Phase 1 migrates components from `all_design_screens/<screen>/code.html`
// into typed React components, starting with a layout primitive.
export {};
```

- [ ] **Step 4: Create `packages/ui/README.md`**

```markdown
# @aesmsg/ui

Shared React component catalogue for aesmsg.

## Status

**Skeleton only.** Phase 1 begins migrating the design mockups in
[`all_design_screens/`](../../all_design_screens/) into typed React components.
The first migration target is a layout primitive (e.g., `<Surface>`)
matching the surface-container hierarchy from `DESIGN.md`.

## Migration approach (Phase 1)

1. Pick one screen folder as a reference (e.g., `dashboard_aesmsg/`).
2. Extract repeating structures into components: `<Surface>`, `<Card>`, `<Button>`,
   `<KeyCard>`, `<EncryptionStatusChip>`.
3. Components consume tokens from `@aesmsg/design-tokens` — never hard-code colors or spacing.
4. Each component gets a Vitest + React Testing Library test for its key interaction surface.
5. Storybook is deferred until the catalogue grows past ~10 components.

## What does NOT belong here

- App-specific routing logic (lives in `apps/web/app/`).
- Crypto operations (always import from `@aesmsg/crypto`).
- Network calls (always go through API route handlers in `apps/web`).
```

- [ ] **Step 5: Install React + types**

Run: `pnpm install`
Expected: React 19 and `@types/react` resolved into `packages/ui/`.

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @aesmsg/ui typecheck`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): add @aesmsg/ui skeleton (empty barrel, Phase 1 migration target)"
```

---

## Task 7: Mobile decision-deferred marker

**Files:**
- Create: `apps/mobile/DECISION-DEFERRED.md`

- [ ] **Step 1: Create the marker file**

Run: `mkdir -p apps/mobile`

`apps/mobile/DECISION-DEFERRED.md`:

```markdown
# Mobile stack: decision deferred

This directory is intentionally empty. The mobile-stack choice (React Native vs.
Kotlin Multiplatform vs. native iOS + Android) was deliberately deferred during
project initialization (2026-05-09) and is revisited at Phase 2 kickoff.

## Why this is deferred, not forgotten

For a zero-knowledge product, the mobile-stack choice has security implications
that go beyond developer ergonomics:

- **OTA updates (CodePush / Expo Updates)** in React Native can hot-swap crypto
  code without app review — exactly the supply-chain trust the product is
  supposed to defeat. If RN is chosen, OTA must be disabled for any module
  touching crypto.
- **Hardware-backed key storage** (Secure Enclave / StrongBox) is reachable
  from RN via native modules but with more surface area than calling the
  native API directly.
- **Memory hygiene** for plaintext and key material is harder in JS than in
  Swift/Kotlin.

The crypto package (`packages/crypto`) is intentionally DOM-free and
network-free precisely so it ports to whichever option is chosen later.

## Options to weigh at Phase 2

| Option | Velocity | Security story | Effort |
|---|---|---|---|
| React Native (no OTA) | Fastest | Acceptable with native modules | Lowest |
| Kotlin Multiplatform | Medium | Strong (native UI + native key storage) | Medium |
| Native Swift + native Kotlin | Slowest | Strongest | Highest |

## Where the design lives in the meantime

The mobile mockups in `all_design_screens/mobile_*` describe the intended UX
regardless of stack choice.
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/DECISION-DEFERRED.md
git commit -m "docs(mobile): record deferred mobile-stack decision with security rationale"
```

---

## Task 8: apps/web Next.js scaffold

**Files (created by `create-next-app` and then edited):**
- Create: `apps/web/` tree (app router, TS, Tailwind 4)
- Modify: `apps/web/package.json` (add workspace dep on `@aesmsg/design-tokens`)
- Modify: `apps/web/app/globals.css` (import design-tokens theme)
- Modify: `apps/web/app/page.tsx` (placeholder content)
- Modify: `apps/web/tsconfig.json` (extend repo base)
- Delete: `apps/web/.gitignore` (root .gitignore covers it; remove generated one)
- Delete: any ESLint config files generated (we use Biome)

- [ ] **Step 1: Run create-next-app for the web workspace**

Run from repo root:

```bash
pnpm dlx create-next-app@latest apps/web \
  --typescript \
  --tailwind \
  --app \
  --no-eslint \
  --no-src-dir \
  --import-alias "@/*" \
  --use-pnpm \
  --turbopack \
  --skip-install
```

Expected: scaffolds `apps/web/` with `app/`, `package.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `app/globals.css`, `app/page.tsx`, `app/layout.tsx`, `app/favicon.ico`. No ESLint files. `--skip-install` keeps deps unresolved until we tweak the package.json.

If the `--skip-install` flag is rejected by the version of `create-next-app` you get, omit it; pnpm will install in this directory only and we will re-run `pnpm install` from the root anyway.

- [ ] **Step 2: Remove the duplicate `.gitignore` generated under `apps/web/`**

Run: `rm -f apps/web/.gitignore`

The root `.gitignore` already covers `node_modules/`, `.next/`, etc. for every workspace.

- [ ] **Step 3: Confirm no ESLint files were generated**

Run: `ls apps/web | grep -Ei 'eslint|\.eslint' || echo "no eslint files — good"`
Expected: `no eslint files — good`. If any are present, delete them: `rm -f apps/web/.eslintrc* apps/web/eslint.config.*`.

- [ ] **Step 4: Edit `apps/web/package.json`**

Replace its content with the following (preserve the actual versions `create-next-app` resolved for `next`, `react`, `react-dom`, `@types/*`, `tailwindcss`, etc. — only edit the metadata, scripts, and add the workspace dep):

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "echo 'no app tests yet (Phase 1 adds e2e + integration)' && exit 0"
  },
  "dependencies": {
    "@aesmsg/crypto": "workspace:*",
    "@aesmsg/design-tokens": "workspace:*",
    "@aesmsg/ui": "workspace:*",
    "next": "<keep what create-next-app picked>",
    "react": "<keep what create-next-app picked>",
    "react-dom": "<keep what create-next-app picked>"
  },
  "devDependencies": {
    "@types/node": "<keep what create-next-app picked>",
    "@types/react": "<keep what create-next-app picked>",
    "@types/react-dom": "<keep what create-next-app picked>",
    "tailwindcss": "<keep what create-next-app picked>",
    "@tailwindcss/postcss": "<keep what create-next-app picked>",
    "postcss": "<keep what create-next-app picked>",
    "typescript": "<keep what create-next-app picked>"
  }
}
```

The placeholder strings `<keep what create-next-app picked>` should be replaced with whatever versions the scaffolder resolved. Do **not** downgrade or remove any dep that was installed for you.

- [ ] **Step 5: Edit `apps/web/tsconfig.json` to extend the repo base**

Replace the generated content with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 6: Replace `apps/web/app/globals.css`**

Overwrite with:

```css
@import "tailwindcss";
@import "@aesmsg/design-tokens/theme.css";

html,
body {
  background: var(--color-background);
  color: var(--color-on-surface);
  font-family: var(--font-sans);
  min-height: 100dvh;
}

body {
  margin: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 7: Replace `apps/web/app/layout.tsx`**

Overwrite with:

```tsx
import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Replace `apps/web/app/page.tsx` with a placeholder**

Overwrite with:

```tsx
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-on-surface-variant)]">
        aesmsg — Phase 0
      </p>
      <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">
        Encrypt before you send.
      </h1>
      <p className="text-base leading-relaxed text-[color:var(--color-on-surface-variant)]">
        Workspace skeleton is up. Phase 1 (web MVP — text encryption, 24h
        expiry, manual PKI) is the next milestone.
      </p>
    </main>
  );
}
```

- [ ] **Step 9: Run `pnpm install` from the repo root to resolve workspace deps**

Run: `pnpm install`
Expected: pnpm symlinks `@aesmsg/crypto`, `@aesmsg/design-tokens`, `@aesmsg/ui` into `apps/web/node_modules/@aesmsg/`. No errors.

- [ ] **Step 10: Verify Tailwind 4 + PostCSS config picks up the theme import**

Run: `cat apps/web/postcss.config.mjs`
Expected output (or close — keep what `create-next-app` generated, just confirm it uses `@tailwindcss/postcss`):

```js
const config = {
  plugins: ["@tailwindcss/postcss"],
};
export default config;
```

If the file is missing or differs structurally, replace it with the above.

- [ ] **Step 11: Boot the dev server to verify it renders**

Run: `pnpm --filter web dev`
Expected: Next.js boots on `http://localhost:3000` (or the next free port). Open in a browser — the page should show the placeholder copy on a dark background using the design-tokens colors. Stop the server with Ctrl-C.

- [ ] **Step 12: Run typecheck**

Run: `pnpm --filter web typecheck`
Expected: no output, exit code 0. If `next-env.d.ts` is missing, run `pnpm --filter web exec next build --no-lint` once to generate it (Next creates it at first build/dev), then re-run typecheck.

- [ ] **Step 13: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js Phase 0 placeholder wired to design-tokens"
```

---

## Task 9: Update CLAUDE.md to reflect new layout

**Files:**
- Modify: `CLAUDE.md`

The existing CLAUDE.md leads with product context (good — keep that) but says "this repo currently contains design artifacts only" and "Do not suggest npm/pnpm/yarn/build/lint/test commands." Both are now wrong. We need to update the "Repository nature" section and add a "Working in the codebase" section without losing the product-context lead.

- [ ] **Step 1: Read the current CLAUDE.md to locate the section to replace**

Run: `grep -n "Repository nature" CLAUDE.md`
Expected: line number for the "## Repository nature" heading. Note it.

- [ ] **Step 2: Replace the "Repository nature" section and append a "Working in the codebase" section**

Replace the entire section starting at `## Repository nature` and going down to (and including) the roadmap-phases bullet list with this content:

```markdown
## Repository nature

This repo holds **both design artifacts and a code workspace**.

- `all_design_screens/` is the design source of truth — Tailwind-CDN HTML mockups + PNGs + the `DESIGN.md` token file. **Do not edit these as if they were app source**; they are reference material that gets migrated into typed React components in `packages/ui/` per-screen during Phase 1.
- The code workspace is a **pnpm monorepo** at the repo root. Use `pnpm` (not `npm`/`yarn`). Node 22 LTS, `corepack enable` to get pnpm.

Roadmap phases per the PRD:

- **Phase 0 (current):** monorepo + tooling skeleton, design artifacts intact, `apps/web` placeholder boots.
- **Phase 1 (next):** web MVP — text encryption, 24h expiry, manual PKI, real crypto behind `@aesmsg/crypto`.
- **Phase 2:** native mobile (stack TBD — see [`apps/mobile/DECISION-DEFERRED.md`](apps/mobile/DECISION-DEFERRED.md)), biometric unlock, secure file attachments.
- **Phase 3:** enterprise (admin controls, metadata-only audit logs, team contact directories).

## Working in the codebase

**Layout:**

- `apps/web/` — Next.js (latest stable, app router, TS strict). Phase 1 frontend + API routes will live here.
- `apps/mobile/` — placeholder; mobile stack chosen at Phase 2.
- `packages/crypto/` — trust-critical encryption primitives. **No DOM, no network, no storage.** Phase 0 ships type stubs only; Phase 1 implements against HPKE + `@hpke/core`.
- `packages/design-tokens/` — single source for `DESIGN.md` values. Tailwind 4 `@theme` block + TS exports. The Tailwind config in `apps/web` consumes this; never hardcode colors or spacing in components.
- `packages/ui/` — shared React component catalogue, populated incrementally during Phase 1.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design specs and implementation plans.

**Commands (run from the repo root):**

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies. |
| `pnpm dev` | Boot the web app on `http://localhost:3000`. |
| `pnpm typecheck` | Run TypeScript across every workspace. |
| `pnpm lint` | Run Biome (lint + format check). |
| `pnpm lint:fix` | Apply Biome's safe fixes. |
| `pnpm format` | Apply formatting fixes only. |
| `pnpm test` | Run Vitest across every workspace. |
| `pnpm --filter <name> <script>` | Target a single workspace, e.g. `pnpm --filter @aesmsg/crypto test`. |

**Tooling decisions** (locked in [`docs/superpowers/specs/2026-05-09-project-init-design.md`](docs/superpowers/specs/2026-05-09-project-init-design.md)):

- **Package manager:** pnpm 10. **Test runner:** Vitest. **Lint+format:** Biome 2 (replaces ESLint + Prettier — there is no ESLint config in this repo on purpose).
- **Crypto:** HPKE (RFC 9180) via `@hpke/core` — X25519 KEM + AES-256-GCM AEAD + HKDF-SHA256. Implementation arrives in Phase 1.
- **Hosting:** Sproobo (Postgres + Redis + object storage). Deploy plumbing arrives once a Phase 1 vertical slice exists.
- **License:** Apache 2.0.
```

(Use the Edit tool to perform the replacement. The existing "## Layout" section that lists `all_design_screens/...` paths can stay where it is — keep it; this new "Working in the codebase" section sits **above** the existing "## Working in this repo" section and the latter should be removed since the new section supersedes it.)

- [ ] **Step 3: Remove the now-redundant "## Working in this repo" section from CLAUDE.md**

The previous content of "## Working in this repo" described how to edit raw HTML mockups. That guidance still matters for the design files but should now be inline under `all_design_screens/` rules. Edit so the only "working in" guidance left is the new "## Working in the codebase" section above. Move the bullets about color semantics, Geist/Inter/JetBrains rules, prohibited copy phrases, etc. into a new section called `## Design rules (when editing all_design_screens/ or packages/ui)`. Keep all of those constraints — only relocate them.

- [ ] **Step 4: Verify CLAUDE.md still reads cleanly**

Run: `head -100 CLAUDE.md`
Expected: the file still leads with "## What this project is" and the product-context sections; the new "Repository nature" / "Working in the codebase" sections sit where the old ones were.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update CLAUDE.md for the new monorepo layout and tooling"
```

---

## Task 10: Final verification

**Files:** none — this task only runs commands.

- [ ] **Step 1: Clean install from scratch**

Run: `rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install`
Expected: `Done` with no errors. Lockfile is unchanged after install (no drift).

- [ ] **Step 2: Run typecheck across all workspaces**

Run: `pnpm typecheck`
Expected: all workspaces pass. No TS errors anywhere.

- [ ] **Step 3: Run lint across the repo**

Run: `pnpm lint`
Expected: Biome reports no errors. Warnings are acceptable but should be reviewed.

- [ ] **Step 4: Run tests across all workspaces**

Run: `pnpm test`
Expected:
- `@aesmsg/design-tokens` — 6 passed
- `@aesmsg/crypto` — 8 passed
- `@aesmsg/ui` — placeholder echo, exit 0
- `web` — placeholder echo, exit 0

- [ ] **Step 5: Boot the dev server one more time and visually confirm**

Run: `pnpm dev`
Open `http://localhost:3000` in a browser. Confirm:
- Page loads on a dark `#141218` background.
- Headline "Encrypt before you send." renders in Geist (or system fallback if Geist isn't loaded yet — that is fine for Phase 0).
- No console errors in the browser dev tools.

Stop with Ctrl-C.

- [ ] **Step 6: Confirm git history is clean**

Run: `git log --oneline`
Expected: roughly 9 commits in this order:

```
chore: initialize repo with baseline files (Apache 2.0, .gitignore, .editorconfig, .nvmrc, README placeholder)
chore: set up pnpm workspace with strict TypeScript base config
chore: add Biome lint+format with workspace-wide config
feat(design-tokens): add @aesmsg/design-tokens package mirroring DESIGN.md frontmatter
feat(crypto): add @aesmsg/crypto skeleton with type stubs (HPKE-bound API)
feat(ui): add @aesmsg/ui skeleton (empty barrel, Phase 1 migration target)
docs(mobile): record deferred mobile-stack decision with security rationale
feat(web): scaffold Next.js Phase 0 placeholder wired to design-tokens
docs(claude): update CLAUDE.md for the new monorepo layout and tooling
```

- [ ] **Step 7: Commit anything stray, if any**

Run: `git status`
Expected: `nothing to commit, working tree clean`. If anything remains (Vitest cache, generated `next-env.d.ts`, etc.), either add it to `.gitignore` (and commit that change) or commit it explicitly with a `chore:` message.

- [ ] **Step 8: Add the spec + plan to git history**

The spec and this plan were written before `git init` — they exist on disk but are not tracked yet:

Run: `git add docs/superpowers/specs/2026-05-09-project-init-design.md docs/superpowers/plans/2026-05-09-project-initialization.md`
Run: `git commit -m "docs: add Phase 0 initialization spec and implementation plan"`

- [ ] **Step 9: Final state check**

Run: `git log --oneline | wc -l && git status`
Expected: 10 commits total, working tree clean.

---

## Self-review

**1. Spec coverage check**

Walking each section of [`docs/superpowers/specs/2026-05-09-project-init-design.md`](../specs/2026-05-09-project-init-design.md):

- §4 Repository layout → Tasks 1, 2, 4–8 cover every path in the spec's tree
- §5 Stack decisions → pnpm (Task 2), TS strict (Task 2), Biome (Task 3), Next.js latest (Task 8), Vitest (Tasks 4 & 5), Apache 2.0 (Task 1), `@hpke/core` declared but not installed at scaffold (Task 5 README documents this)
- §6 `packages/crypto` → Task 5 (type stubs, README, NotImplemented tests)
- §6 `packages/design-tokens` → Task 4 (TS exports + theme.css + tests)
- §6 `packages/ui` → Task 6 (empty barrel + README)
- §6 `apps/web` → Task 8 (scaffold + tokens wiring + placeholder page)
- §7 Storage adapter interfaces → **deliberately deferred to Phase 1**, called out in spec §7 as "real adapters are Phase 1 implementation work." No init task needed.
- §8 Public-link preview safety → architectural invariant for Phase 1; no init task
- §9 Identity / PKI model → informs `crypto` API in Task 5; no separate task
- §10 Initial commit plan → matches Task 10 final state
- §11 Success criteria → Task 10 verifies each one
- §12 Risks/open questions → none gate this plan; resolved in Phase 1 planning

No gaps.

**2. Placeholder scan**

Reviewed for "TBD", "TODO", "implement later", "appropriate error handling", "similar to Task N", and missing code blocks. Two intentional placeholder strings exist:
- `<keep what create-next-app picked>` in Task 8 Step 4 — this is intentional because `create-next-app` resolves these versions at run time and we want whatever is current. The instruction is explicit about how to fill it.
- "Phase 1 will add: …" in `packages/crypto/README.md` — this is a status note for the README, not a plan placeholder.

No real placeholders.

**3. Type consistency**

- `IdentityKeypair`, `RecipientPublicKey`, `Ciphertext`, `WrappedKey`, `PublicKeyString`, `Fingerprint` — defined once in Task 5 Step 6 and re-exported in Step 7, used consistently in the test (Task 5 Step 4) and README (Task 5 Step 8).
- `seal`/`open` signatures match between test (Task 5 Step 4), implementation (Task 5 Step 7), and README (Task 5 Step 8).
- `colors`, `typography`, `spacing`, `rounded` — same names in test (Task 4 Step 4), source files (Task 4 Steps 6–9), and barrel (Task 4 Step 10).
- `@aesmsg/design-tokens/theme.css` import path — declared in package exports (Task 4 Step 1) and consumed in `apps/web/app/globals.css` (Task 8 Step 6).

Consistent.

---

## Risks during execution

- **Tailwind 4 + Next.js latest scaffold quirks.** `create-next-app` may have moved options around between versions. If `--no-eslint` or `--no-src-dir` is rejected, run the prompt-based scaffolder and answer the prompts manually.
- **`@aesmsg/design-tokens/theme.css` resolution.** Tailwind 4's `@import` statement in `globals.css` must be resolved by PostCSS. If the import fails to resolve, the fix is usually to ensure pnpm linked the package (re-run `pnpm install` after editing `apps/web/package.json`).
- **`next-env.d.ts` not generated yet.** Typecheck on a fresh scaffold can fail until Next has produced `.next/types/`. Booting `next dev` once produces it.
