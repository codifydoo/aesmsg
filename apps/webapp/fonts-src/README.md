# Self-hosted fonts (source + regeneration)

This directory (`apps/webapp/fonts-src/`) holds the **source + tooling** for the
vendored icon font. It is intentionally **outside `public/`** so the generator
script and this README are never copied into the static export (`out/`). Only the
built `material-symbols-outlined.woff2` is served, from `public/fonts/`.

## `material-symbols-outlined.woff2`

A **subset** of the [Material Symbols Outlined](https://fonts.google.com/icons)
variable font, self-hosted so the app makes **no runtime request to
`fonts.googleapis.com` / `fonts.gstatic.com`**. This keeps `app.aesmsg.com`
consistent with its strict CSP (`font-src 'self'`, no third-party origins) and
prevents visitor IPs from leaking to Google on every page load.

- **Upstream:** `google/material-design-icons`, variable font
  `MaterialSymbolsOutlined[FILL,GRAD,opsz,wght]`.
- **License:** Apache License 2.0 (vendoring is permitted).
- **Axes preserved:** `FILL`, `GRAD`, `opsz`, `wght` — required because
  `packages/ui/src/MaterialIcon.tsx` drives them via `font-variation-settings`.
- **Rendering:** icons render via **ligatures** (e.g. `<span
  class="material-symbols-outlined">lock</span>` → the lock glyph). The subset
  keeps the GSUB ligature table for the icons below and nothing else.

This is a **superset of the `apps/web` subset** — it keeps the 30 icons that app
uses (so the shared identity / reader / error screens migrated later have their
glyphs) and adds the six app-shell navigation icons the `dashboard_aesmsg`
mockup uses (`dashboard`, `add_box`, `group`, `settings`, `menu`, `close`).

### Icons included (36)

`add_box alternate_email arrow_forward chat check chevron_right close code
code_blocks content_copy dashboard dark_mode description devices
enhanced_encryption face fingerprint forum group info ios_share key link lock
mail menu schedule search send settings share shield_lock timer timer_off
verified_user vpn_key`

> If you add a new `MaterialIcon` / `.material-symbols-outlined` icon anywhere in
> `apps/webapp`, add its name to `NAMES` in
> `generate-material-symbols-subset.py` and regenerate, otherwise the new icon
> will not render.

### Regenerating

A naive `pyftsubset --text=...` over-retains (~5500 glyphs) because Material
Symbols icons share letter inputs, so ligature closure keeps every icon spelled
with those letters. `generate-material-symbols-subset.py` first prunes the GSUB
to exactly the wanted ligatures, then subsets — yielding ~87 glyphs / ~39 KB.

```sh
# run from apps/webapp/fonts-src/ ; needs: pip install fonttools brotli
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36"
curl -sS -A "$UA" \
  "https://fonts.gstatic.com/s/materialsymbolsoutlined/v361/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsI.woff2" \
  -o material-full.woff2
python3 generate-material-symbols-subset.py   # -> material-symbols-outlined.woff2 (in this dir)
mv material-symbols-outlined.woff2 ../public/fonts/   # publish only the built woff2
rm -f material-full.woff2 pruned.ttf
```
