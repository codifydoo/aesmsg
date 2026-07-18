# Self-hosted fonts

## `material-symbols-outlined.woff2`

A **subset** of the [Material Symbols Outlined](https://fonts.google.com/icons)
variable font, self-hosted so the site makes **no runtime request to
`fonts.googleapis.com` / `fonts.gstatic.com`**. This keeps the site consistent
with the privacy policy ("no third-party requests / tracking scripts") and
prevents visitor IPs from leaking to Google on every page load, including the
`/l/[id]` bouncer.

- **Upstream:** `google/material-design-icons`, variable font
  `MaterialSymbolsOutlined[FILL,GRAD,opsz,wght]`.
- **License:** Apache License 2.0 (vendoring is permitted).
- **Axes preserved:** `FILL`, `GRAD`, `opsz`, `wght` — required because
  `packages/ui/src/MaterialIcon.tsx` drives them via `font-variation-settings`.
- **Rendering:** icons render via **ligatures** (e.g. `<span
  class="material-symbols-outlined">lock</span>` → the lock glyph). The subset
  keeps the GSUB ligature table for the icons below and nothing else.

### Icons included (30)

`alternate_email arrow_forward chat check chevron_right code code_blocks
content_copy dark_mode description devices enhanced_encryption face fingerprint
forum info ios_share key link lock mail schedule search send share shield_lock
timer timer_off verified_user vpn_key`

> If you add a new `MaterialIcon` / `.material-symbols-outlined` icon anywhere in
> `apps/web`, add its name to `NAMES` in
> `generate-material-symbols-subset.py` and regenerate, otherwise the new icon
> will not render.

### Regenerating

A naive `pyftsubset --text=...` over-retains (~5500 glyphs) because Material
Symbols icons share letter inputs, so ligature closure keeps every icon spelled
with those letters. `generate-material-symbols-subset.py` first prunes the GSUB
to exactly the 30 wanted ligatures, then subsets — yielding ~76 glyphs / ~32 KB.

```sh
# needs: pip install fonttools brotli
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36"
curl -sS -A "$UA" \
  "https://fonts.gstatic.com/s/materialsymbolsoutlined/v361/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsI.woff2" \
  -o material-full.woff2
python3 generate-material-symbols-subset.py   # -> material-symbols-outlined.woff2
```
