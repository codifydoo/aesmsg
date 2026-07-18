# Bundled fonts (drop-in)

The design calls for three typefaces:

| Role                    | Family          | Used for                                            |
| ----------------------- | --------------- | --------------------------------------------------- |
| Display / headings      | **Geist**       | large titles, section headers, buttons              |
| Body / UI text          | **Inter**       | paragraphs, labels, list rows                       |
| Monospace               | **JetBrains Mono** | fingerprints, public keys, secure links **only** |

The font-loading path is already wired end-to-end — only the binary `.ttf` assets are missing
(they are not committed to this repo). Until they are added, the app falls back to the platform
system font for display/body and the platform **monospace** (Menlo on iOS, `monospace` on Android)
for mono content, so fingerprints/keys/links still render monospaced.

## Activation (3 steps)

1. **Add the assets.** Drop these files into this directory (`apps/mobile/assets/fonts/`):
   - `Geist-Regular.ttf` (and, optionally, `Geist-Medium.ttf`, `Geist-SemiBold.ttf`)
   - `Inter-Regular.ttf` (and, optionally, `Inter-Medium.ttf`)
   - `JetBrainsMono-Regular.ttf`

   Geist: <https://github.com/vercel/geist-font> · Inter: <https://github.com/rsms/inter> ·
   JetBrains Mono: <https://github.com/JetBrains/JetBrainsMono> (all OFL-licensed).

2. **Register them.** Uncomment the `require(...)` entries in
   [`src/theme/app-fonts.ts`](../../src/theme/app-fonts.ts) `FONT_ASSETS`, keyed by the
   `FONT_FAMILY` names.

3. **Flip the flag.** Set `FONTS_BUNDLED = true` in
   [`src/theme/typography.ts`](../../src/theme/typography.ts).

The `App` root already gates its first paint on `useAppFonts()`, so once the assets are present the
splash holds until they load and every screen picks up the real families with no per-screen change.

> Weights: the ramp uses `fontWeight` ("500"/"600"). If you only bundle the Regular weight, RN
> synthesises bolder weights; bundle the Medium/SemiBold files and register them under distinct family
> names if you want the true cut.
