# Contributing to aesmsg

Thanks for your interest in contributing. aesmsg is a zero-knowledge encryption layer over
existing communication channels — encrypt before you send, share the link through any app,
and only the intended recipient can open it. Because it is a security product, contributions
are held to a high bar for correctness and clarity.

Please also read [`README.md`](README.md) for the product overview and
[`CLAUDE.md`](CLAUDE.md) for the architecture and invariants.

## Ground rules

- **By contributing, you agree that your contributions are licensed under the
  [Apache License 2.0](LICENSE)**, the same license as the project.
- Be respectful and constructive — see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- For security vulnerabilities, **do not open a public issue** — follow
  [`SECURITY.md`](SECURITY.md).

## Prerequisites

- **Node 22 LTS.**
- **pnpm 10** via Corepack (do not use `npm` or `yarn`):

  ```bash
  corepack enable
  ```

## Getting started

```bash
pnpm install       # install all workspace dependencies
pnpm dev           # boot the web app on http://localhost:3000
```

Common commands (run from the repo root):

| Command | What it does |
|---|---|
| `pnpm typecheck` | Run TypeScript across every workspace. |
| `pnpm lint` | Run Biome (lint + format check). |
| `pnpm lint:fix` | Apply Biome's safe fixes. |
| `pnpm format` | Apply formatting fixes only. |
| `pnpm test` | Run Vitest across every workspace. |
| `pnpm --filter <name> <script>` | Target a single workspace, e.g. `pnpm --filter @aesmsg/crypto test`. |

Tooling is fixed: **pnpm** (package manager), **Vitest** (tests), and **Biome** (lint +
format — there is no ESLint or Prettier config on purpose).

## Making a change

1. **Branch off `main`.** Keep changes focused; unrelated fixes belong in separate PRs.
2. **Write tests first** where practical, especially for anything in `packages/crypto`,
   `apps/api`, or key handling. New behavior should come with coverage.
3. **Run the gates locally before pushing** — CI runs the same:

   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```

4. **Use Conventional Commits** for commit messages and PR titles
   (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, …), matching the existing history.
5. **Open a pull request** describing the change and the reasoning. Link any related issue.

## Working on trust-critical code

`packages/crypto` (HPKE, key-wrap, fingerprints, wire formats) and the identity / key
handling in `apps/mobile` are trust-critical. When touching them:

- Do not change the wire or payload format without a versioning story — a frozen
  cross-backend interop vector guards byte-identical output.
- Never weaken the [invariants in `CLAUDE.md`](CLAUDE.md) (zero-knowledge backend, private
  keys never leave the device, links are pointers not secrets, safe public link previews).
- Keep crypto free of DOM, network, and storage concerns.

## Design and UI changes

Visual decisions follow the design system in
`all_design_screens/secure_message_design_system/DESIGN.md` and the tokens in
`@aesmsg/design-tokens`. Never hardcode colors or spacing. Copy must avoid "unbreakable",
"impossible to hack", and "military-grade"; prefer "end-to-end encrypted", "zero-knowledge
backend", and "private keys stay on your device".

## Questions

Open a regular GitHub issue for bugs and feature discussion (but not for security reports).
