# aesmsg — brand assets

## Mark (fully standalone vector — no fonts needed)
- `aesmsg-mark-violet.svg` — #cfbcff, transparent
- `aesmsg-mark-ink.svg` — near-white, for dark surfaces
- `aesmsg-mark-dark.svg` — #2a2533, for light surfaces
- `aesmsg-mark-currentcolor.svg` — inherits CSS `color`
- `aesmsg-mark-512.png` / `-1024.png` — violet, transparent

## Lockup (mark + wordmark; SVGs embed Inter via Google Fonts)
- `aesmsg-lockup-dark.svg` — primary, on #141218
- `aesmsg-lockup-ondark.svg` — violet mark + white wordmark, transparent
- `aesmsg-lockup-onlight.svg` — indigo mark + ink wordmark, transparent
- `aesmsg-lockup-mono.svg` — all violet
> Lockups fetch Inter at render time. For a fully self-contained file,
> outline the text in your vector editor (Type → Create Outlines).

## Favicons / app icons
- `favicon.svg` — scalable, dark rounded square + violet mark
- `favicon-16/32/48/192/512.png`
- `apple-touch-icon.png` (180×180)

### `<head>` snippet
```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

## Color
- Violet `#cfbcff` · Indigo `#6750a4` · Near-black `#141218` · Ink `#e9e6f0`
