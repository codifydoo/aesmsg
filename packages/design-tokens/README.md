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
