# aesmsg — Mobile App AI Design Prompts

Tool-agnostic, copy-paste prompts for generating aesmsg's native mobile screens in any AI UI tool (Lovable, Galileo, UX Pilot, Cursor, Figma AI).

**How to use:** Paste the *Shared design context* block once into your tool or session, then paste any individual screen prompt below it. Each screen prompt is self-contained against that shared context.

**Tags:** `[E]` exists in mockups/code · `[P2]` Phase-2 mobile · `[F]` future / plausible.

**Groups:**
- Onboarding & Identity (8)
- Home & Shell (2)
- Sender / Create (8)
- Links Management (4)
- Recipient / Reader (11)
- Contacts (6)
- Identity / Keys (5)
- Settings (5)
- Account / Monetization (4)
- System / Cross-cutting (10)

---

## Shared design context (paste once)

```
SECUREMSG — SHARED DESIGN CONTEXT (applies to every screen)

PRODUCT: aesmsg is a privacy-first encryption layer over the messaging apps people already use (Slack, WhatsApp, iMessage, email, SMS, Telegram). It is NOT a chat app and NOT a messenger. The user encrypts a message or file locally, uploads only ciphertext, gets a secure link, and pastes that link into any app. Only the recipient device can decrypt. Promise: 'Encrypt before you send. Share through any app. Only the intended recipient can open it.'

PLATFORM: Native mobile app (React Native / Expo), iOS + Android. Bottom tab navigation: Encrypt, Links, Contacts, Keys, Settings. Respect safe-area insets; 44pt minimum touch targets; use native bottom sheets, the system share sheet, and platform biometrics (Face ID / Touch ID / Android BiometricPrompt).

AESTHETIC: Calm, premium, institutional trust. Reference points: Stripe, Linear, Proton, 1Password. Dark-first. NEVER hacker-green, cyberpunk, terminal, or paranoid imagery. Depth comes from luminance and 1px hairline borders, not drop shadows. Glassmorphism (backdrop blur over a ~60% background fill) for nav bars and overlays only.

COLOR TOKENS (use these exact values):
- background / surface: #141218
- surface-container-lowest #0f0d13, low #1d1b20, base #211f24, high #2b292f, highest #36343a
- on-surface (primary text) #e6e0e9, on-surface-variant (secondary text) #cbc4d2
- outline #948e9c, outline-variant (hairline borders) #494551
- primary (Electric Violet) #cfbcff, on-primary #381e72, primary-container #6750a4, on-primary-container #e0d2ff
- secondary #cdc0e9
- SEMANTIC: green = verified / decrypted / safe (a calm desaturated emerald that sits in this palette). amber = unverified / key changed / expiring soon (tertiary #e7c365 on #3e2e00). red = DESTRUCTIVE ONLY: revoke, delete, wipe (error #ffb4ab, error-container #93000a, on-error-container #ffdad6). Never use red for ambient states.

TYPOGRAPHY:
- Geist (headings): display 48/600/-0.04em, h1 32/600/-0.02em, h2 24/500/-0.01em
- Inter (body/UI): body-lg 18/400, body-md 15/400, label-sm 13/500 uppercase +0.05em
- JetBrains Mono 14/400: ONLY for fingerprints, public keys, and secure links. Never for general UI text.

SHAPE & SPACING: rounded-sm .25rem (tags, checkboxes), rounded-md .5-.75rem (buttons, inputs), rounded-lg 1rem (cards, sheets); full pills for status chips only. 8px spacing scale (4/8/16/24/48/80).

VOICE: Calm SaaS, not a crypto tool. BANNED words: 'unbreakable', 'military-grade', 'impossible to hack'. APPROVED: 'end-to-end encrypted', 'zero-knowledge backend', 'private keys stay on your device', 'only the intended recipient can decrypt'. Hide deep crypto terminology behind expandable / advanced sections.

SECURITY INVARIANTS (reinforce the ones relevant to each screen; never contradict):
- Zero-knowledge backend: server stores ciphertext + minimal metadata only. Never imply server-side trust or that the server can read content.
- Private keys never leave the device unless the user explicitly exports an encrypted backup.
- Links are pointers, not secrets: a link without the recipient private key is useless.
- Public link previews must be safe: a simple GET must not consume an open or expose ciphertext; real fetch/decrypt requires explicit app action.
- Expired / revoked links leak nothing: show only 'This secure link is no longer available.'
- Wrong private key = no decryption. No fallback, no recovery, no 'are you sure'.
- After decryption, plaintext is the user responsibility, but the client mitigates: blur-on-background, clipboard auto-clear (30-60s), screenshot blocking where supported, biometric guard on every open.
```

## How each prompt is structured

```
PROMPT TEMPLATE — every screen prompt uses these fields, in this order:
SCREEN — name + (sender/recipient role, where in the flow)
GOAL — the one outcome the user achieves here
LAYOUT (top to bottom) — concrete structure: app bar, content blocks, sheets, nav
COMPONENTS — the specific UI elements to render (name them)
COPY — exact on-screen strings, in the approved voice
STATES — every variant to design (empty / loading / error / success / warning / backgrounded, as relevant)
MOTION — microinteractions and transitions
SECURITY UX — which invariants this screen makes visible, and how
DO-NOT — what must never appear on this screen
TOUCH/A11y — safe-area, 44pt targets, VoiceOver/TalkBack labels, dynamic type

Reference example (Secure Reader, recipient / decrypted view):
SCREEN: Secure Reader (recipient, decrypted view)
GOAL: Let the verified recipient read decrypted plaintext locally, while constantly signalling that protection ends at the screen.
LAYOUT (top to bottom): slim top app bar (back chevron, 'Decrypted locally' green chip, close-and-wipe X); sender + short fingerprint row (JetBrains Mono, green verified tick); message body card (24px padding, body-lg Inter, on-surface on surface-container); attachment card if present (filename, size, Download / Preview); sticky footer (Copy with 45s auto-clear ring, Close and wipe).
COMPONENTS: decrypted-state chip, message bubble, attachment card, clipboard-countdown ring, amber screen-exposure banner.
COPY: header 'Decrypted on this device'; banner 'Anyone who can see your screen can read this now.'; copy toast 'Copied — clears in 45s'.
STATES: text-only, with attachment, long-scroll, clipboard-counting-down, backgrounded (blur shield).
MOTION: content fades in after biometric success; blur overlay snaps in on app-switch.
SECURITY UX: blur-on-background, screenshot warning/block, clipboard auto-clear, no server round-trip after decrypt.
DO-NOT: no 'share plaintext' button, no 'save to cloud', never persist plaintext.
TOUCH/A11y: 44pt targets, footer above safe-area inset, VoiceOver labels on security chips.
```

---
# Screen prompts


## Onboarding & Identity

### 1. Splash / Launch  [F]

```
SCREEN — Splash / Launch (app-agnostic, cold start; routes both sender and recipient before any role exists)
GOAL — Show a calm, momentary brand mark while the app decides whether keys exist, then route to Unlock (returning) or Welcome (first run).

LAYOUT (top to bottom) — Full-bleed #141218 canvas, no app bar, no status-bar chrome change. Vertically and horizontally centered group: a quiet outline lock glyph (Material Symbols `lock`, ~40pt, #cfbcff) above the "aesmsg" wordmark (Geist h1, 32/600/-0.02em, #e6e0e9). Nothing else. Respect top and bottom safe-area insets even though content is centered.

COMPONENTS — centered brand lockup (glyph + wordmark), no spinner by default.

COPY — wordmark "aesmsg". No tagline, no version, no marketing line. (If keystore probe exceeds ~1.5s, reveal a single label-sm line, #cbc4d2: "Checking your keys".)

STATES — default (brief hold ~600-900ms then route); slow-probe (delayed "Checking your keys" line, no claims); keystore-unavailable (route to Welcome silently, no error here).

MOTION — glyph + wordmark fade and lift 4pt over ~250ms on launch; whole lockup cross-fades out as the next route fades in. No bounce, no looping animation.

SECURITY UX — purely local: this screen reads only the on-device keystore to branch routing; no network, no ciphertext, no metadata fetch. Routing decision never reveals whether any links or contacts exist.

DO-NOT — no login form, no logo splash claims, no "unbreakable"/"military-grade" copy, no biometric prompt here (that lives on Unlock), no analytics ping.

TOUCH/A11y — no interactive targets; expose one VoiceOver/TalkBack label "aesmsg, loading"; respect Reduce Motion (cut fade, hold then route); honor dynamic type on the optional probe line.
```

### 2. Welcome Carousel  [F]

```
SCREEN — Welcome Carousel (sender + recipient, first-run onboarding, before any keypair exists)
GOAL — In three swipes, convey what aesmsg does (encrypt-then-share over apps you already use) and route to either first-time setup or restoring an existing identity.

LAYOUT (top to bottom) — Full-bleed canvas on background #141218, safe-area top inset honored. Skip text button top-right (on-surface-variant #cbc4d2). Large illustrative glyph zone (~45% height). Slide headline (Geist h1 32/600) + body (Inter body-lg 18/400, on-surface-variant #cbc4d2). On slide 2, a wrapped row of neutral channel chips: Slack, WhatsApp, iMessage, Email, SMS — surface-container-high #2b292f fill, 1px outline-variant #494551 border, on-surface #e6e0e9 label, rounded-full, monochrome (no brand color). Page dots (3) above footer: active primary #cfbcff, inactive outline #948e9c. Footer above bottom safe-area: primary CTA "Get started" (on-primary #381e72 on #cfbcff, 44pt+), secondary text link "Restore from backup" (primary #cfbcff).

COMPONENTS — paged horizontal scroll-view, channel-chip cluster, page-dot indicator, primary button, text link, skip button.

COPY — S1 head "Encrypt before you send" / "Lock your message on this device. Plaintext never leaves it." S2 head "Share through any app" / "Send the link via Slack, email, anywhere. The app only carries ciphertext." S3 head "Only the recipient can open it" / "Their private key decrypts locally. Even we can't read it." CTA "Get started"; link "Restore from backup".

STATES — three slides; first / mid / last (dots reflect position); reduced-motion (instant slide); backgrounded (blur shield).

MOTION — parallax glyph drift on swipe; dots morph width on active; CTA fades to full opacity on slide 3.

SECURITY UX — reinforces zero-knowledge backend ("only carries ciphertext", "even we can't read it") and keys-stay-on-device; channel chips signal works-with-any-app, not a messenger.

DO-NOT — no account/email signup, no "military-grade", no brand-colored logos, no contacts permission prompt here.

TOUCH/A11y — 44pt targets; swipe + dot taps both navigate; VoiceOver announces "Slide 1 of 3"; chips grouped as one label "Works with Slack, WhatsApp, iMessage, email, SMS"; Dynamic Type scales headline/body without clipping.
```

### 3. How It Works  [F]

```
SCREEN — How It Works (onboarding explainer, either role, first-run before first encrypt)
GOAL — In one scroll, make the sender understand the encrypt-then-share model and that aesmsg layers over apps they already use.
LAYOUT (top to bottom) — safe-area top inset; centered eyebrow + h1; a compact horizontal flow strip (plaintext chip to lock-glyph ciphertext to link chip to recipient decrypt), connected by 1px outline-variant #494551 hairline arrows; three stacked numbered step cards; a slim zero-knowledge reassurance row; sticky bottom CTA above the home indicator.
COMPONENTS — eyebrow label-sm, step-number badge (primary-container #6750a4 / on-primary-container #e0d2ff), Material Symbols per step (lock, ios_share, key), flow-strip with mono link token, reassurance pill, primary Continue button, "Skip" text link.
COPY — eyebrow "HOW IT WORKS"; h1 "Encrypt before you send"; step 1 "Encrypt on your device — Your message and files are sealed locally. Plaintext never leaves your phone."; step 2 "Share the link anywhere — Paste it into Slack, WhatsApp, email — any app you already use."; step 3 "Only they can open it — The recipient decrypts on their device. No one in between can read it."; reassurance "Zero-knowledge backend — the server only ever stores ciphertext."; flow-strip label "Plaintext → Ciphertext → Link → Decrypt"; CTA "Continue"; "Skip".
STATES — default; reduced-motion (static flow); compact-height (cards collapse subtitle); dynamic-type-XL (flow strip wraps to vertical).
MOTION — flow strip animates left-to-right on mount (plaintext fades to lock glyph, link token slides in); step cards stagger-fade 60ms apart; respects Reduce Motion.
SECURITY UX — visualizes local-only encryption and zero-knowledge storage; flow shows the channel only ever carries a link, not the secret.
DO-NOT — no "messenger"/"chat" framing, no account or contacts prompt, no biometric request here, no banned superlatives, no implied server-side reading.
TOUCH/A11y — 44pt CTA and Skip targets; CTA above safe-area inset; VoiceOver reads each step as one combined label; flow glyphs marked decorative; supports Dynamic Type.
```

### 4. Create Identity / Set Passphrase  [E]
*Maps to: set_passphrase_aesmsg, GateScreens.tsx*

```
SCREEN — Create Identity / Set Passphrase (sender/recipient, first-run identity creation; gate before any tab is reachable)

GOAL — Have the new user set a strong passphrase that wraps their freshly generated keypair locally, while making the no-recovery contract impossible to miss.

LAYOUT (top to bottom) — safe-area top inset; centered display title "Create your identity" with on-surface (#e6e0e9) subhead in on-surface-variant (#cbc4d2); a surface-container (#211f24) card with 1px outline-variant (#494551) border holding the Passphrase field, live strength meter, Confirm passphrase field, and inline validation line; an amber no-recovery info card (tertiary #e7c365 icon/heading on on-tertiary #3e2e00 tint); sticky bottom CTA above the safe-area inset.

COMPONENTS — two secure inputs (surface-container-low #1d1b20, primary #cfbcff focus border) with a show/hide eye toggle; segmented strength meter (red error #ffb4ab → amber #e7c365 → green emerald); mismatch helper line; amber KDF info card; primary gradient "Create identity" button with key icon.

COPY — subhead "Choose a passphrase. Your private key is wrapped with it on this device — the server never sees it."; placeholder "At least 12 characters"; strength labels "Too weak" / "Getting there" / "Strong"; mismatch "Passphrases don't match."; weak "Use 12+ characters — longer is stronger."; amber card title "There is no recovery", body "Keys are protected with Argon2id. Forget this passphrase and the identity is gone — by design."; CTA "Create identity"; generating "Generating your keypair…".

STATES — empty (CTA disabled); typing (meter updates live); weak (CTA disabled, weak line); mismatch (confirm border error #ffb4ab); valid (CTA enabled); generating (spinner, inputs locked); backgrounded (blur shield over fields).

MOTION — meter segments fill left-to-right; mismatch line slides in; CTA morphs to spinner on submit.

SECURITY UX — reinforces private-keys-stay-on-device, zero-knowledge backend, and wrong/forgotten passphrase = unrecoverable with no fallback.

DO-NOT — no "Forgot passphrase?", no email/cloud backup prompt, no plaintext storage, no strength percentage exposing entropy internals.

TOUCH/A11y — 44pt inputs, eye toggles, and CTA; honors safe-area insets; VoiceOver labels announcing strength state and the no-recovery warning; supports dynamic type.
```

### 5. Unlock Passphrase  [E]
*Maps to: unlock_passphrase_aesmsg, GateScreens.tsx*

```
SCREEN — Unlock Passphrase (returning user, gate before any tab; mobile native, extends `UnlockScreen` in `apps/mobile/src/keys/GateScreens.tsx`)
GOAL — Let a returning user decrypt their on-device private key for this session via biometrics or passphrase, then drop into the Encrypt tab.
LAYOUT (top to bottom) — safe-area top padding; centered lock glyph; h1 title; body-md subtext; large Face ID / Touch ID quick-unlock button (primary `#cfbcff` fill, `on-primary` `#381e72` label); "or" hairline divider (`outline-variant` `#494551`); passphrase field card (surface-container `#211f24`, 1px `outline-variant/30` border) with secured text input and Unlock submit; inline error slot; sticky bottom destructive text link above safe-area inset.
COMPONENTS — biometric-unlock button, secure passphrase TextInput, Unlock submit, inline error line, wipe text link, unlocking spinner overlay.
COPY — title "Unlock your identity"; subtext "Authenticate to decrypt your private key for this session. It never leaves this device."; biometric button "Unlock with Face ID"; field label "PASSPHRASE"; submit "Unlock"; wrong-passphrase "That passphrase didn't match. Try again."; wipe link "Wipe and start over".
STATES — idle; biometric prompt (system sheet, button shows spinner); wrong passphrase (error `#ffb4ab` line, field border error, field retained); unlocking (inputs disabled, ActivityIndicator in button); backgrounded (blur shield over field).
MOTION — biometric sheet on launch; subtle horizontal shake + haptic on wrong passphrase; content cross-fades into Encrypt tab on success.
SECURITY UX — private key stays on device; passphrase never transmitted; biometric guard; blur-on-background; calm retry with no lockout threat or attempt counter.
DO-NOT — no "forgot passphrase" recovery, no attempt-count or lockout warning, no plaintext-visibility toggle by default, no server mention.
TOUCH/A11y — 44pt targets, wipe link above bottom inset, secureTextEntry, VoiceOver labels "Unlock with Face ID" and "Wipe identity and start over, destructive", Dynamic Type supported.
```

### 6. Enable Biometrics  [F]
*Maps to: auto-lock.ts*

```
auto-lock.ts confirms the key-lifetime model: the in-memory private key is dropped on background, and biometric unlock re-derives access. The Enable Biometrics screen is what gates that unlock path. Here is the prompt.

SCREEN — Enable Biometrics (sender + recipient, identity setup / first unlock-gate configuration, reachable from Keys tab and post-keygen onboarding)

GOAL — Let the user turn on Face ID / Touch ID / Android BiometricPrompt as the unlock gate for opening their keypair and decrypting, in one tap, with a calm understanding that nothing leaves the device.

LAYOUT (top to bottom) — Safe-area top inset; centered icon medallion (Material Symbols fingerprint / face on a #1d1b20 surface-container-low disc with #494551 hairline ring); h1 title; body-md subtitle; three benefit rows (icon + label + one line) on #211f24 cards; flexible spacer; sticky footer above bottom safe-area inset with primary and text buttons.

COMPONENTS — biometric medallion, benefit-row list (bolt = faster, lock = on-device, eye-off = private), primary filled button (#cfbcff on #381e72), tertiary text button, success state-chip, native system biometric sheet (triggered, not drawn).

COPY — title "Use Face ID to unlock"; subtitle "Open your keys and decrypt with a glance. Your private key never leaves this device."; rows "Faster — no passcode each time", "Stays on-device — biometrics never reach our servers", "Private — only you can unlock"; primary "Enable Face ID"; tertiary "Not now"; success chip "Face ID on"; advanced disclosure "How unlock works".

STATES — default; presenting (primary shows spinner, system sheet over blur); success (medallion + chip turn green #8fd19e, haptic, auto-advance); declined (returns, no nag); unavailable/not-enrolled ("Set up Face ID in Settings first", primary disabled). Android swaps copy to "fingerprint". Backgrounded: blur shield.

MOTION — benefit rows stagger-fade on mount; medallion ring pulses once; on success ring fills green and checkmark draws; gentle success haptic.

SECURITY UX — reinforces private-keys-stay-on-device and biometric guard on every open; biometrics gate local key access only, never sent to the server.

DO-NOT — no "remember me", no password fallback toggle here, no cloud-sync mention, never imply biometrics are uploaded.

TOUCH/A11y — 44pt+ buttons, footer above inset, VoiceOver "Enable Face ID, button", dynamic type to body-lg, respects reduced-motion.
```

### 7. Permissions Priming  [F]

```
SCREEN — Permissions Priming (sender + recipient, onboarding, shown after first keypair is created and before any QR scan or first link send)

GOAL — Earn opt-in for Camera and Notifications by explaining the why and the limits, before the OS dialogs fire. Fully skippable.

LAYOUT (top to bottom) — safe-area top inset; centered shield-key glyph in primary #cfbcff on surface-container-low #1d1b20; h2 title; one-line subtitle in on-surface-variant #cbc4d2; two permission cards stacked on surface-container #211f24 with 1px outline-variant #494551 hairlines — each: leading Material Symbol, label-sm uppercase tag, body-md rationale, "Nothing is shared" footnote; sticky bottom block above safe-area inset: full-width primary "Continue" button (on-primary #381e72 text), text-only "Not now" below.

COMPONENTS — permission-rationale card x2, primary CTA, skip link, no-share reassurance footnote.

COPY — title "Two quick permissions"; subtitle "You can change these anytime in Settings."; Camera card tag "CAMERA", "Scan a contact's QR code to verify their public key in person.", footnote "Stays on device. Nothing is uploaded."; Notifications card tag "NOTIFICATIONS", "Know when a link is opened or about to expire.", footnote "We send a ping, never the contents."; primary "Continue"; skip "Not now".

STATES — default; Continue tapped (cards dim, OS dialog over blur scrim); one-granted-one-denied (return view, no error styling); both denied (calm note: "No problem — scanning and alerts stay off until you enable them.").

MOTION — cards stagger-fade in 60ms apart; tapping Continue dims cards and snaps a blur scrim before each native dialog; blur-on-background shield.

SECURITY UX — reinforce private-keys-stay-on-device and zero-knowledge: Camera is local verification only; Notifications carry metadata pings, never plaintext or ciphertext.

DO-NOT — no "Allow" button faking the OS dialog; no guilt copy; no blocking gate; never imply notifications include message content.

TOUCH/A11y — 44pt targets, CTA above safe-area inset; VoiceOver/TalkBack labels naming each permission and its purpose; cards reflow with dynamic type.
```

### 8. Import Backup / Restore Identity  [F]
*Maps to: secure-store.ts*

```
SCREEN — Import Backup / Restore Identity (new-device / fresh-install onboarding, before any tab shell exists). [F]

GOAL — Let a user restore their existing identity from an encrypted backup file by decrypting it locally with their passphrase, then land on Encrypt (Home).

LAYOUT (top to bottom) — safe-area top inset; slim app bar (back chevron, title "Restore identity"); intro block on `#141218`; file-picker row (card on surface-container-low `#1d1b20`, 1px outline-variant `#494551` hairline, "Choose backup file" + leading document icon, becomes filename + size chip once picked); passphrase field (secure entry, show/hide toggle) with helper line; reassurance note; sticky footer above bottom safe-area inset: primary "Restore" button (`#cfbcff` on `#381e72`).

COMPONENTS — file-picker row, selected-file chip, masked passphrase input, inline error text, decrypting spinner, full-screen success check.

COPY — title "Restore identity"; intro "Restore your identity from an encrypted backup. Your backup is decrypted on this device — nothing is uploaded."; picker "Choose backup file"; passphrase placeholder "Backup passphrase"; helper "This passphrase never leaves your device."; CTA "Restore"; wrong-passphrase error (`#ffb4ab`) "That passphrase didn't unlock this backup. No backup data is recoverable without it."; no-file note "Pick a backup file to continue."; success "Identity restored."

STATES — empty (no file, CTA disabled); file picked; decrypting (CTA spinner, inputs locked); wrong passphrase (red inline, field shake, no attempt counter); success (green `#cfbcff`-adjacent emerald check, auto-advance to Home); backgrounded (blur shield over passphrase).

MOTION — file chip slides in; CTA morphs label to spinner; error field shakes once; success check scales in, then routes Home after 600ms.

SECURITY UX — local-only decryption messaging; passphrase never transmitted; wrong passphrase yields no fallback/recovery; restored envelope stays device-local (matches secure-store WHEN_UNLOCKED_THIS_DEVICE_ONLY, no iCloud sync).

DO-NOT — no "forgot passphrase", no cloud-restore, no passphrase strength meter, no preview of backup contents, no attempt-remaining counter.

TOUCH/A11y — 44pt targets; footer above home-indicator inset; VoiceOver labels on picker ("Choose backup file, button"), passphrase ("Backup passphrase, secure"), and show/hide toggle; dynamic type on body copy; error announced via live region.
```


## Home & Shell

### 9. Home  [E]
*Maps to: mobile_home_aesmsg, HomeScreen.tsx*

```
SCREEN — Home (sender, app entry / launch hub after biometric session unlock)
GOAL — Confirm the device's key health at a glance and launch the two core actions: create a secure link or open one.

LAYOUT (top to bottom) — safe-area top inset; app bar (wordmark left, Settings gear right); device security status card; primary CTA "Create secure message"; secondary CTA "Open secure link"; 2x2 quick-actions grid; "Recent links" peek (section label + 2-3 rows, "See all"); bottom tab bar (Encrypt active).

COMPONENTS — security-status card (icon + title + subtext), filled primary button, outline secondary button, quick-action tiles (Scan QR, My public key, Add contact, Import backup), recent-link rows with status chips, glassmorphic tab bar.

COPY — card healthy "Private key secured on this device" / "Biometric unlock enabled"; card locked "Private key locked" / "Unlock with Face ID to send"; primary "Create secure message"; secondary "Open secure link"; tiles "Scan QR", "My public key", "Add contact", "Import backup"; section "Recent links"; empty "No secure links yet — your first one will appear here."

STATES — healthy (green card, on #1d1b20, emerald accent); key locked (amber #e7c365 on #3e2e00, Unlock button replaces tiles); no recent links (empty row); backgrounded (blur shield).

MOTION — card icon settles on mount; locked->healthy crossfade after biometric; blur snaps in on app-switch.

SECURITY UX — keys stay on device; biometric guard surfaced; status card reads zero-knowledge, never server trust.

DO-NOT — no plaintext preview of any link, no "sync keys", no account/server status.

TOUCH/A11y — 44pt targets, tab bar above safe-area; VoiceOver "Private key secured, biometric unlock enabled"; dynamic type on card and rows.
```

### 10. Bottom Tab Bar  [E]
*Maps to: TabBar.tsx, tabs.ts*

```
SCREEN — Bottom Tab Bar (global navigation; persists across all five primary destinations, sender and recipient roles)
GOAL — Let the user move between Encrypt, Links, Contacts, Keys, and Settings, while surfacing two attention cues (links expiring, contacts needing verification) without leaking content.

LAYOUT (top to bottom) — Glassmorphic bar pinned to the bottom edge: a single 1px top hairline in outline-variant #494551 over a ~60% #141218 fill with backdrop blur. Five equal-width tab slots in a row; each slot stacks a 24px Material Symbols icon over a label-sm 13/500 label. Content sits inside the bottom safe-area inset; the blurred fill extends through the inset to the screen edge.

COMPONENTS — tab item (icon + label), active indicator, numeric badge pill.

COPY — labels: "Encrypt", "Links", "Contacts", "Keys", "Settings". Badge: plain count up to "9", then "9+". VoiceOver overflow example: "Links, 3 expiring soon".

STATES — active: icon + label in primary #cfbcff. Inactive: on-surface-variant #cbc4d2. Badged: amber pill (#e7c365 on #3e2e00) top-right of the Links or Contacts icon; zero count hides the badge. Pressed: brief surface-container-high #2b292f wash.

MOTION — 150ms icon color/scale crossfade on switch; badge count change ticks with a subtle scale pop. No route content blur here.

SECURITY UX — badges show counts only, never previews, recipients, or link targets; reinforces that metadata stays opaque.

DO-NOT — no center FAB, no red ambient dots, no unread-message styling, no labels hidden on active only.

TOUCH/A11y — each slot at least 44pt tall above the inset; full-slot tap target; selected state announced; respects dynamic type by truncating label before icon.
```


## Sender / Create

### 11. Compose Secure Message  [E]
*Maps to: mobile_encrypt_aesmsg, ComposeScreen.tsx*

```
I have enough grounding from the real `ComposeScreen.tsx` (recipient key validation, fingerprint display, secure keyboard flags, expiry/max-opens chips) and the mockup. Here is the prompt.

SCREEN — Compose Secure Message (sender, top of the create flow; the "Encrypt" tab root)
GOAL — Let the sender seal a message/file to one recipient's public key and produce a shareable link, with the recipient's trust state always visible before they encrypt.
LAYOUT (top to bottom) — Top app bar: close X (left), "New secure message" title, amber shield glyph (#e7c365) opening the security model sheet. Recipient selector row (tap → contacts/paste/QR picker sheet). Multiline message field on surface-container-low (#1d1b20). "Add file" row beneath. Two summary rows — Expiry and Max opens — each showing current value + chevron, opening bottom sheets. Require-biometric-to-decrypt toggle row. Fixed bottom bar above safe-area inset: primary "Encrypt & create link".
COMPONENTS — recipient-state pill, secure message TextInput (autoCorrect/autoComplete/spellCheck off), file attachment card, summary rows, native bottom sheets (expiry: 10m/1h/24h/7d/Custom; max opens: 1/3/Unlimited), platform toggle, primary button.
COPY — message placeholder "Type your secret…"; verified pill "Verified · fingerprint A1B2 C3D4" (#7ee2a8); unverified "Not yet verified — tap to confirm fingerprint" (#cbc4d2); pasted-key "Sealing to fingerprint A1B2 C3D4 — verify out-of-band"; key-changed "This contact's key changed — re-verify before sending" (#e7c365); missing "Pick a recipient or paste their public key"; toggle "Require biometric unlock to open"; helper "Plaintext never leaves this device."; invalid key "That doesn't look like a valid public key." (#ffb4ab).
STATES — empty (button disabled, opacity .4); each recipient state above; valid key + message (enabled); custom-expiry sheet; attachment present; backgrounded (blur shield).
MOTION — fingerprint pill cross-fades on key change; sheets spring up; button lifts to enabled.
SECURITY UX — fingerprint = the MitM check; amber key-changed gate; local-only encryption note; no plaintext to server.
DO-NOT — no "save draft to cloud", no plaintext preview after send, no green for unverified, no recipient autofill from predictive text.
TOUCH/A11y — 44pt rows, button above inset, VoiceOver labels on state pill and shield, dynamic type on body.
```

### 12. Recipient Picker (sheet)  [P2]

```
SCREEN — Recipient Picker (sheet) [P2] (sender, mid-compose: choosing who can decrypt)
GOAL — Let the sender bind this message to one recipient's public key, verified, before encryption.
LAYOUT (top to bottom) — bottom sheet over blurred compose (backdrop blur on ~60% #141218 fill), grab handle; title row "Send to"; search field; segmented row "Paste public key" / "Scan QR"; scrollable contact list (avatar, name, JetBrains Mono 14 short fingerprint, status chip); footer "Encrypt for" CTA disabled until a verified contact is selected; respects bottom safe-area inset.
COMPONENTS — search input, segmented action buttons, contact row, verification chip, inline key-changed banner, missing-key empty row.
COPY — title "Send to"; search placeholder "Search contacts"; chips: green (#cfbcff tick on calm emerald) "Verified", amber (#e7c365 on #3e2e00) "Unverified", amber "Key changed"; missing-key row "No public key yet — paste or scan to add"; key-changed banner "This contact's key changed. Re-verify the fingerprint before sending."; selecting unverified "Verify fingerprint first"; CTA "Encrypt for [Name]".
STATES — empty (no contacts: prompt to Paste public key / Scan QR), loading list shimmer, typing/filtered, verified-selected (CTA enabled), unverified-selected (CTA blocked, inline verify link), key-changed (amber banner, selection blocked), backgrounded (blur shield).
MOTION — sheet springs up; rows fade/stagger; selection ring scales in; key-changed banner slides down.
SECURITY UX — fingerprint shown on every row; verified gate before encrypt; key change surfaced inline, never silent; reinforces "only the intended recipient can decrypt."
DO-NOT — no "send anyway" past a key-changed warning, no recently-used without fingerprints, no server-side contact lookup implied.
TOUCH/A11y — 44pt rows and chips, footer above safe-area, VoiceOver labels announce name + verification state + fingerprint, dynamic type on names and copy.
```

### 13. Attachment Picker + File Card  [P2]

```
SCREEN — Attachment Picker + File Card (sender, mid-compose, attaching to a secure message)
GOAL — Let the sender pick one file/photo/document and confirm it will be sealed on-device before any upload.
LAYOUT (top to bottom) — slim app bar (back chevron, title "Add attachment"); empty state: large dashed-outline drop zone (1px outline-variant #494551) on surface-container-low #1d1b20 with paperclip glyph and three source rows below — Photo Library, Take Photo, Browse Files (each a 56pt tappable row, leading icon, chevron); after pick: attached-file card (rounded-lg, surface-container #211f24) with type icon, filename, size, remove X; below it a green inline note; size hint line; sticky footer button "Attach to message".
COMPONENTS — drop zone, source-row list, file card, lock note, size-hint, Pro upsell sheet.
COPY — empty title "Attach a file or photo"; subtext "It's encrypted on this device before anything is uploaded."; lock note (green #8fd9a8-toned) "Encrypted on this device before upload"; size hint "Up to 25 MB on the free plan"; over-limit card title "This file is too large" / body "Free plan allows up to 25 MB. This file is 41 MB."; upsell button "Upgrade for files up to 2 GB"; footer "Attach to message".
STATES — empty (sources), file attached (card + green note + enabled footer), too large (amber #e7c365 card on #3e2e00, disabled footer, upsell), loading (thumbnail spinner).
MOTION — file card slides up + fades in on selection; over-limit card shakes once; upsell as native bottom sheet.
SECURITY UX — make the local-seal promise visible (green lock note); never imply the file uploads in plaintext; selection alone uploads nothing.
DO-NOT — no "upload to cloud", no multi-file grid, no preview that leaves the device, no plaintext thumbnail caching.
TOUCH/A11y — system photo/document pickers; 44pt+ rows; footer above safe-area inset; VoiceOver labels on remove X ("Remove attachment") and lock note; supports dynamic type.
```

### 14. Expiry Selector (sheet)  [E]
*Maps to: expiry.ts*

```
SCREEN — Expiry Selector (sender, bottom sheet invoked from Create / Compose before sealing). [E]

GOAL — Let the sender pick how long the secure link stays openable, defaulting to 24 hours, and confirm in one tap.

LAYOUT (top to bottom) — Bottom sheet over a dimmed scrim, rounded-lg top corners, surface-container-high #2b292f fill with a 1px #494551 hairline top edge; grab handle (#948e9c); h2 title row; vertical radio list of five rows; Custom row expands inline to a native date-time picker; sticky Confirm button above the safe-area inset.

COMPONENTS — drag handle, radio rows (label left, trailing check), selected-row tint fill, inline platform DateTimePicker, primary Confirm button.

COPY — title "Link expires in"; rows "10 minutes", "1 hour", "24 hours" (trailing label-sm "Default" chip), "7 days", "Never (manual revoke)"; custom expanded helper "Set an exact date and time."; footer note "Anyone who opens the link before then can decrypt it once your key matches."; button "Confirm".

STATES — default (24 hours selected); each row selected; Custom expanded with picker; Custom past-time invalid (Confirm disabled, amber #e7c365 helper "Pick a time in the future"); backgrounded (blur shield).

MOTION — sheet springs up; tapping a row moves the check and primary tint with a 120ms fade; Custom picker height-animates open.

SECURITY UX — reinforces self-destruct + that "Never" still requires manual revoke; no row implies the server can read content. Selection stays local until Confirm.

DO-NOT — no "keep forever / permanent", no analytics-style "recommended", no server-trust copy.

TOUCH/A11y — 44pt rows, Confirm above safe-area; VoiceOver "24 hours, selected, default"; respects dynamic type.
```

### 15. Max Opens Selector (sheet)  [E]

```
SCREEN — Max Opens Selector (sheet); sender, in Create Secure Message flow after tapping the "Max opens" row.

GOAL — Let the sender cap how many times the link can be opened before it becomes permanently unavailable.

LAYOUT (top to bottom) — bottom sheet over a backdrop-blurred scrim; grab handle; title row "Max opens"; three radio rows (1 open / 3 opens / Unlimited until expiry), each with a label, a one-line helper, and a trailing radio control; sticky "Done" button above the safe-area inset.

COMPONENTS — drag-handle, radio-list-row (label + helper + radio dot), selected-row highlight, primary Done button, blur scrim.

COPY — title "Max opens"; rows "1 open" / helper "Burns after the first successful open."; "3 opens" / "Available for up to three opens, then gone."; "Unlimited until expiry" / "Opens freely until the link expires."; button "Done".

STATES — default (3 opens preselected), each row selected, drag-dismiss, backgrounded (blur shield over sheet).

MOTION — sheet springs up from bottom; radio dot scales in on select; selected row fades to highlight; sheet drops on Done or drag-down.

SECURITY UX — reinforce that opens are enforced as the ciphertext is purged after the cap, server-side, with no plaintext exposure; pairs with revoke and expiry as independent kill switches.

COLOR — sheet surface-container-low #1d1b20 on a blurred #141218 scrim; helpers on-surface-variant #cbc4d2; selected row tinted primary-container #6750a4 with radio dot primary #cfbcff; Done button primary #cfbcff / text on-primary #381e72; hairlines outline-variant #494551.

DO-NOT — no per-open analytics, no "track who opened", no red (non-destructive), no custom numeric input here.

TOUCH/A11y — rows 44pt min height, full-width tap targets; Done above safe-area; VoiceOver announces row label + helper + selected state; supports dynamic type without clipping helpers.
```

### 16. Encrypting Progress  [P2]
*Maps to: create-and-seal.ts*

```
The reference maps cleanly onto the 4 steps: `importPublicKey`/`encodePayload` = Preparing, `seal` = Encrypting locally, `postMessage` = Uploading ciphertext, `BASE_URL/l/${id}` return = Creating secure link. The `CreateFlow.tsx` already shows "Encrypting on this device…" and the network call is the only failure point past key validation. Now I'll write the prompt.

SCREEN — Encrypting Progress [P2] (sender; the full-screen interstitial shown after Compose, while `createAndSeal` runs locally and uploads, before the Secure Link Created result).

GOAL — Show the sender that sealing is happening on their device and reassure them plaintext is never transmitted, until the secure link is ready.

LAYOUT (top to bottom) — Safe-area full-screen overlay on surface-container-lowest #0f0d13, no tab bar, no back gesture. Centered lock-forming animation (~120pt). Below it, h2 status line (Geist, on-surface #e6e0e9). Below that, a vertical 4-step list with leading state icons. Pinned above the bottom safe-area inset: a persistent reassurance row with a small lock glyph.

COMPONENTS — animated lock-assembly graphic; ordered step list (Preparing message / Encrypting locally / Uploading ciphertext / Creating secure link) each with a status icon (pending hairline ring outline-variant #494551, active spinner primary #cfbcff, done filled check in green); reassurance footer chip; error card with Retry + Back buttons.

COPY — title (cycles per step): "Preparing message", "Encrypting locally", "Uploading ciphertext", "Creating secure link". Footer: "Plaintext never leaves your device." Error title: "Couldn't reach the server." Error body: "Your message was encrypted on this device — nothing left it. Try uploading again." Buttons: "Retry", "Back to edit".

STATES — each of the 4 steps active (prior steps checked green, later steps pending); upload error (steps 1–2 stay checked green, step 3 shows red error #ffb4ab dot, error card appears); backgrounded (blur shield).

MOTION — lock pieces snap together stepwise; active step spinner rotates; completed step crossfades ring→green check (~200ms); title crossfades on step change; error card slides up.

SECURITY UX — only ciphertext uploads (steps 1–2 complete before any network); error copy confirms nothing left the device; retry resumes at upload, never re-prompts the recipient key; blur-on-background.

DO-NOT — never show plaintext, the recipient's private key, a progress percentage implying server-side processing, or a cancel that leaves a half-uploaded secret.

TOUCH/A11y — 44pt Retry/Back targets above the inset; VoiceOver announces each step transition and "encrypted on this device"; respects reduced-motion (static lock + step checks); dynamic type on title and steps.
```

### 17. Link Created / Success  [E]
*Maps to: ResultScreen.tsx*

```
SCREEN — Link Created / Success [E] (sender, immediately after local encryption + ciphertext upload; extends `apps/mobile/src/create/ResultScreen.tsx`)
GOAL — Confirm the secure link exists, get it shared through any app, and reassure that only ciphertext left the device.
LAYOUT (top to bottom) — slim app bar (close X returns to Encrypt tab); centered lock-sealed glyph in a 64pt circle on surface-container-high #2b292f with green #cfbcff-adjacent emerald tick; h2 title; one-line zero-knowledge reassurance; secure-link card (JetBrains Mono 14, on-surface #e6e0e9, surface-container-low #1d1b20, 1px outline-variant #494551 hairline, rounded-lg, inline Copy affordance); horizontal chip row (expiry countdown pill + max-opens pill); primary Share button; secondary View details; de-emphasized destructive Revoke text button above safe-area inset.
COMPONENTS — sealed-lock success badge, mono link card with copy-countdown ring, expiry-countdown chip, max-opens chip, share primary, view-details secondary, revoke ghost-destructive, copy toast.
COPY — title "Secure link created"; sub "Only encrypted ciphertext was uploaded. The link is a pointer — useless without the recipient's private key."; expiry chip "Expires in 23h 59m" / "Never — manual revoke only"; opens chip "Opens once" / "Up to 5 opens" / "Unlimited until expiry"; buttons "Share link", "View details", "Revoke link"; copy toast "Copied — link, not the secret"; revoke confirm sheet "Revoke this link? This purges the ciphertext from the server. The link stops working immediately." / "Revoke".
STATES — default; copied (toast + tick); countdown ticking; never-expires variant; revoking (spinner on Revoke); revoked (card greys to outline #948e9c, "This link is no longer available."); backgrounded (blur shield over link).
MOTION — badge scales in with a soft settle on mount; copy ring sweeps; revoke sheet slides up; revoked state cross-fades.
SECURITY UX — states "ciphertext only" upload, link-is-a-pointer, recipient-only decryption; Revoke = server purge; share routes through the system sheet (no aesmsg-hosted send).
DO-NOT — never render the plaintext, recipient public key, or a preview; no QR auto-generation here; no "resend" or cloud-save.
TOUCH/A11y — 44pt targets; safe-area footer; VoiceOver labels on chips ("Expires in 23 hours") and the mono link ("Secure link, double-tap to copy"); dynamic type; mono never wraps mid-token without selectable fallback.
```

### 18. Key-Changed Warning (compose)  [F]

```
SCREEN — Key-Changed Warning (sender, compose; inline banner above the Send action after a recipient with a rotated key is selected)
GOAL — Stop a sensitive message from going to an unverified key by surfacing the change and routing the sender to re-verify before they can confidently send.
LAYOUT (top to bottom) — Inline amber banner docked between the recipient row and the compose body; left amber warning glyph; one-line heading; old vs new fingerprint comparison block (two stacked rows, JetBrains Mono, labelled "Previously" and "Now", changed bytes emphasised); action row with primary "Verify fingerprint" and muted ghost "Send anyway".
COMPONENTS — amber inline banner (tertiary #e7c365 text/glyph on #3e2e00 fill, 1px #494551 hairline, rounded-lg 1rem), fingerprint-diff block (mono 14/400, on-surface-variant #cbc4d2 labels), primary button (on-primary #381e72 on #cfbcff), muted text button (#cbc4d2).
COPY — heading "This contact's key changed."; body "Verify the fingerprint before sending sensitive information."; primary "Verify fingerprint"; muted "Send anyway"; fingerprint labels "Previously" / "Now".
STATES — default (banner present, Send anyway available); verifying (taps primary → opens verify sheet / QR scan); resolved (key re-verified → banner collapses to a green "Verified" chip, Send enabled normally); send-anyway-confirm (muted tap shows a brief inline "Sending to an unverified key" amber confirm); backgrounded (blur shield over compose).
MOTION — banner slides down and settles with a soft amber pulse on the changed fingerprint bytes; collapses upward on resolve.
SECURITY UX — makes key rotation / MitM risk visible; reinforces manual fingerprint verification as the trust anchor; never auto-trusts the new key; "Send anyway" is deliberately muted, never default.
DO-NOT — no "trust this device", no auto-verify, no green styling on the warning, primary must not be "Send anyway", never imply the server vouches for the key.
TOUCH/A11y — 44pt targets, banner respects compose insets; VoiceOver "Warning: this contact's key changed, verify before sending"; fingerprints read byte-grouped; dynamic type wraps the diff block without truncation.
```


## Links Management

### 19. Links List  [P2]

```
SCREEN — Links List (sender, post-creation; manages all secure links the user has created)

GOAL — Let the sender scan link status at a glance, act on a link fast (copy, revoke, delete), and trust that every row reflects server-side truth without exposing any secret.

LAYOUT (top to bottom) — Large-title app bar "Links" on #141218; segmented control (All / Active / Expired) below; scrollable list of link rows on #1d1b20 cards with #494551 hairline dividers; "Encrypt" tab active in glass bottom nav.

COMPONENTS — segmented filter, link row (recipient name or JetBrains Mono short fingerprint, body-md #e6e0e9; created relative time #cbc4d2; status chip; opens-used counter "2/3" #cbc4d2), swipe-action set, empty-state illustration.

COPY — segmented "All / Active / Expired"; status chips "Available" (green), "Opened", "Expiring soon" (amber #e7c365 on #3e2e00), "Revoked" (muted #ffb4ab), "Expired" (#948e9c); swipe "Copy" / "Revoke" / "Delete"; revoke sheet "Revoke this link? The ciphertext is purged from the server and the link stops working immediately." / "Revoke link"; empty "No secure links yet" / "Encrypted messages you share will appear here."

STATES — populated list; expiring rows pinned with amber left accent; revoked/expired dimmed to 60%; empty; loading skeleton rows.

MOTION — chips cross-fade on filter switch; swipe reveals trailing actions; revoked row collapses after confirm; blur shield on app-switch.

SECURITY UX — chips reflect server status only (no plaintext, no preview); revoke confirms server purge; links are pointers, useless without the recipient key.

DO-NOT — no message preview, no "resend plaintext", no recipient online status, no read receipts.

TOUCH/A11y — 44pt rows, list inset above safe-area, swipe actions mirrored as long-press menu; VoiceOver reads "Link to Maya, Expiring soon, 2 of 3 opens used."
```

### 20. Link Details  [P2]

```
SCREEN — Link Details (sender, post-creation; opened from Links list to manage one secure link)

GOAL — Let the sender inspect and control a single secure link's lifecycle (copy, revoke, delete) from encrypted-message metadata only.

LAYOUT (top to bottom) — slim top app bar (back chevron, "Link details" title, overflow menu); status chip row; secure-link card (JetBrains Mono link, truncated middle, Copy button); metadata list (created, expiry countdown, opens used vs cap); recipient row (name + JetBrains Mono fingerprint, green verified tick); zero-knowledge footnote; sticky bottom action stack (Revoke outline, Delete filled-red), above safe-area inset.

COMPONENTS — status chip, mono link card, copy button, countdown row, opens-counter, fingerprint row, revoke/delete confirmation bottom sheets.

COPY — title "Link details"; metadata "Plaintext is not stored. This screen shows encrypted-message metadata only."; status chips "Active", "Expiring soon", "Expired", "Revoked"; opens "2 of 3 opens used"; copy toast "Link copied"; revoke sheet "Revoke this link? This purges the ciphertext from the server. Anyone who opens the link sees only that it's no longer available." confirm "Revoke link"; delete sheet "Delete this link permanently?" confirm "Delete".

STATES — active, expiring-soon (amber #e7c365 chip), expired/revoked (outline #948e9c chip, actions collapse to Delete), loading skeleton, backgrounded blur shield.

MOTION — countdown ticks live; revoke/delete sheets slide up; status chip cross-fades on state change.

SECURITY UX — never renders decrypted content; metadata copy reinforces zero-knowledge backend; revoke explicitly states ciphertext purge; fingerprint (green #cfbcff-adjacent emerald tick) shows recipient binding.

DO-NOT — no decrypted message preview, no plaintext, no recipient private-key reference, no "view message" affordance, no resend.

TOUCH/A11y — 44pt targets; destructive actions above safe-area; VoiceOver labels on chip ("Status: active") and counter; mono link read as "secure link, button copy"; dynamic type on metadata.
```

### 21. Revoke Confirm  [P2]

```
SCREEN — Revoke Confirm (sender, destructive confirmation over Secure Link Details, [P2])
GOAL — Make the sender consciously confirm or back out of permanently destroying a live link's ciphertext.
LAYOUT (top to bottom) — Native bottom sheet over a dimmed scrim, rounded-lg top corners on surface-container-high #2b292f, grab handle; red-tinted circular icon badge (error #ffb4ab on error-container #93000a) with a shield-off / delete glyph; h2 title; body paragraph; the link's short label/expiry chip for context; sticky two-button footer above the safe-area inset — Cancel (secondary, on-surface-variant #cbc4d2 text on surface-container-highest #36343a) then Revoke link (filled error #93000a, on-error-container #ffdad6 label).
COMPONENTS — bottom sheet, destructive icon badge, title, body copy, link-context chip, secondary button, destructive button, inline spinner, success checkmark.
COPY — title "Revoke this link?"; body "Revoking purges the ciphertext from the server and cannot be undone. Recipients can no longer open this link."; buttons "Cancel" / "Revoke link"; revoking label "Revoking…"; revoked toast "Link revoked. Ciphertext purged."
STATES — idle (both buttons active); revoking (Revoke shows spinner, both buttons disabled, sheet not dismissible); revoked (button morphs to green checkmark, toast, sheet auto-dismisses and details view flips to Revoked); error ("Could not revoke. Try again." inline, buttons re-enabled).
MOTION — sheet springs up from bottom; scrim fades to ~60%; button label cross-fades to spinner then checkmark; sheet slides down on success.
SECURITY UX — names the zero-knowledge purge ("ciphertext from the server"), states irreversibility, confirms recipients lose access; no recovery offered.
DO-NOT — no "are you sure" double-prompt, no plaintext or message preview, no "archive instead", no biometric step here.
TOUCH/A11y — 44pt buttons, footer clears safe-area, swipe-down dismiss equals Cancel (blocked while revoking), VoiceOver flags Revoke as destructive, respects dynamic type.
```

### 22. Links Empty State  [F]

```
SCREEN — Links Empty State (sender, Links tab; no links created yet)
GOAL — Reassure the user the tab works and route them straight into creating their first secure link.
LAYOUT (top to bottom) — Large title app bar "Links" on background #141218; centered content block vertically optical-centered in the safe viewport: quiet outline glyph in a 72px circle (surface-container-high #2b292f, 1px outline-variant #494551 hairline), then headline, then one supporting line, then primary CTA; bottom tab bar (Encrypt, Links, Contacts, Keys, Settings) above the safe-area inset.
COMPONENTS — empty-state glyph (Material Symbols Outlined "link" or "lock", on-surface-variant #cbc4d2), headline (Geist h2 24/500, on-surface #e6e0e9), supporting line (Inter body-md 15/400, on-surface-variant #cbc4d2), filled primary button (primary #cfbcff, on-primary #381e72).
COPY — headline "No secure links yet"; supporting "You haven't created any secure links yet. Encrypt something and share the link through any app."; CTA "Create secure message".
STATES — default empty; loading (3 skeleton rows, surface-container-low #1d1b20, before confirming zero links); offline (same layout, inline note "Showing your device. Links sync when you're back online.").
MOTION — glyph + text fade/translate-up 12px on mount; CTA press scales to 0.97.
SECURITY UX — copy frames links as pointers shared through other apps; nothing implies server-stored content.
DO-NOT — no illustration of a person, no "invite", no count badges, no marketing claims.
TOUCH/A11y — CTA min 44pt, full-width with 16px margins; glyph aria-hidden; VoiceOver groups headline+supporting; respects dynamic type.
```


## Recipient / Reader

### 23. In-App Link Landing (pre-decrypt)  [P2]
*Maps to: reader-machine.ts*

```
The state machine confirms the `landing` state carries `metadata` + `myFingerprint`, and that the `opening` state shares the opaque "decrypting" surface. I'll write the prompt grounded in that.

SCREEN — In-App Link Landing (pre-decrypt) [P2] · recipient, `landing` state of reader-machine.ts (`loading → landing → opening`), shown when a deep-linked `/l/:id` resolves and the device holds a matching key.

GOAL — Confirm a secure message exists and the key matches, then let the recipient explicitly trigger decryption. Nothing is decrypted or fetched-as-plaintext yet.

LAYOUT (top to bottom) — Slim top bar (back chevron, centered "Secure message" label, no actions); centered lock-shield glyph; H2 status headline; sender + recipient-key-match row (avatar/initial, sender name, short fingerprint in JetBrains Mono with green verified tick); expiry chip; metadata-light caption; sticky safe-area footer with one primary Decrypt button (full-width pill).

COMPONENTS — key-match indicator chip, sender-fingerprint row, expiry status chip, primary Decrypt button, fetching skeleton, blur-on-background shield.

COPY — headline "Secure message found"; key-match "This message is sealed to your key" (green #cfbcff tick on on-surface #e6e0e9); expiry "Expires in 22h" / warning "Expiring soon — opens in 38m"; caption "Decryption happens on this device after Face ID."; button "Decrypt"; biometric prompt "Unlock to decrypt".

STATES — key match (default, green); expiring soon (amber #e7c365 chip on #3e2e00, Decrypt still primary); fetching (skeleton rows, button disabled, no spinner copy that reveals open progress); backgrounded (blur shield snaps in).

MOTION — content fades/rises 8px on resolve; Decrypt scales 0.97 on press; on tap, button morphs to biometric prompt (no separate screen).

SECURITY UX — link is a pointer, not the secret; no ciphertext fetched on view (no open consumed); decrypt requires explicit tap + platform biometric; key-match shown but never the message body; blur-on-background.

DO-NOT — no message preview, no plaintext, no "Skip biometric", no server-trust language, no open-count leak.

TOUCH/A11y — 44pt targets, footer above home-indicator inset; VoiceOver: "Sealed to your key, verified"; expiry as text not color alone; Dynamic Type.
```

### 24. Public Safe Preview / App Not Installed  [E]
*Maps to: LandingScreen.tsx*

```
SCREEN — Public Safe Preview / App Not Installed (recipient, before-install / link-preview target; the no-key, no-app entry point that also renders into messaging-app URL unfurls). [E]

GOAL — Reassure the visitor a real encrypted message exists and route them to install the app, without exposing ciphertext or consuming an open.

LAYOUT (top to bottom) — safe-area top inset; centered lock glyph; h2 title; body-md explainer; a single neutral "Encrypted message" status pill (no fingerprint, no sender, no expiry); primary "Install for iOS" button; secondary "Install for Android" button; tertiary text link "How secure links work"; bottom safe-area inset.

COMPONENTS — lock icon, neutral status pill, two filled platform buttons, ghost text link, optional "Already have the app? Open" affordance that deep-links without fetching.

COPY — title "This is a secure encrypted message."; body "Open it in the app to decrypt locally on your device. The link alone can't reveal the contents."; buttons "Install for iOS", "Install for Android", "How secure links work".

STATES — default (no app); app-detected (swap to "Open in aesmsg"); link-preview/crawler GET (static, identical, zero side effects); backgrounded (blur shield).

MOTION — gentle fade-in of lock + title; button press scale 0.97; no skeleton, nothing async.

SECURITY UX — proves links are pointers not secrets; a plain GET never consumes an open or fetches ciphertext; leaks no recipient, sender, or metadata.

DO-NOT — no ciphertext, no preview text, no fingerprint, no sender name, no expiry, no "Open Message"/decrypt action, no open-counting network call.

TOUCH/A11y — buttons full-width, min 44pt, 8px gaps; VoiceOver labels "Install aesmsg for iOS / Android"; pill labeled "Encrypted message, locked"; supports dynamic type.
```

### 25. Biometric Unlock Gate (decrypt)  [E]

```
SCREEN — Biometric Unlock Gate (recipient, decrypt step, over a dimmed Secure Reader before plaintext renders)
GOAL — Confirm device-bound presence so the recipient's private key can decrypt this message locally; plaintext never appears until biometric (or passphrase) succeeds.
LAYOUT (top to bottom) — Dimmed reader scrim (#0f0d13 at ~70%, no readable content behind); centered native biometric sheet anchored above the safe-area inset: lock-shield glyph in primary #cfbcff, title, subtitle, sender + short fingerprint row (JetBrains Mono, green verified tick); "Use passphrase instead" text link; bottom sheet (surface-container-low #1d1b20, rounded-lg 1rem) for fallback.
COMPONENTS — system Face ID / Touch ID / Android BiometricPrompt mock, lock-shield icon, fallback passphrase sheet with masked input + numeric/secure keyboard, inline error row, "Decrypt" primary button.
COPY — title "Unlock to decrypt on this device"; subtitle "Your private key never leaves this device."; failed-once "Not recognized. Try again."; fallback header "Enter your passphrase"; fallback hint "This unlocks your private key locally."; button "Decrypt".
STATES — prompting (sheet active, reader dimmed); failed-once (amber #e7c365 inline message, retry); fallback passphrase (sheet expands, masked field focused); wrong passphrase (amber inline, no lockout copy); backgrounded (blur shield snaps over everything).
MOTION — sheet rises 200ms ease-out; lock glyph pulses while scanning; failure shakes glyph 6px; success fades scrim out and reveals reader.
SECURITY UX — keys stay on device; no server round-trip to unlock; biometric guards every open; blur-on-background.
DO-NOT — no "Skip", no "Remember me", no biometric-disable toggle, no plaintext peek behind scrim, no recovery/reset-key link.
TOUCH/A11y — 44pt link + button targets, sheet above home indicator, VoiceOver "Unlock to decrypt, double-tap to authenticate", Dynamic Type on all copy.
```

### 26. Decrypting  [E]
*Maps to: DecryptingScreen.tsx*

```
SCREEN — Decrypting (recipient, transitional step between biometric success and Secure Reader)
GOAL — Reassure the verified recipient that decryption is happening on-device only, for the brief moment between Face ID / Touch ID / BiometricPrompt success and the reader appearing.
LAYOUT (top to bottom) — full-bleed centered column on background `#141218`, no app bar, no tab bar; vertically centered animated padlock-opening glyph in primary `#cfbcff`; one-line status caption below in on-surface-variant `#cbc4d2`; a thin determinate-feel progress hairline (or settling spinner) in primary above the safe-area bottom inset.
COMPONENTS — lock-opening Lottie/animated icon, status caption, on-device assurance subline, slim progress indicator.
COPY — primary: "Decrypting on this device". subline (on-surface-variant): "Your private key never leaves this device." No percentages, no "downloading", no "connecting".
STATES — decrypting (lock animating, caption visible); transitioning-to-reader (lock snaps fully open, screen cross-fades into Secure Reader); backgrounded (blur shield snaps over everything, animation pauses).
MOTION — lock shackle lifts and rotates open on a ~600ms ease; on success the open lock pulses once then the whole view cross-fades (200ms) into the reader. No spinner-forever loops — this is a sub-second beat.
SECURITY UX — reinforce local-only decrypt and private-key-stays-on-device; zero network affordance or implication; blur-on-background already active so the in-flight plaintext is never exposed on app-switch.
DO-NOT — no progress percentage tied to a server, no "fetching" / "syncing" copy, no cancel that round-trips, no plaintext preview, no skip-biometric shortcut.
TOUCH/A11y — respect top and bottom safe-area insets; VoiceOver/TalkBack announces "Decrypting on this device" on mount; honor Dynamic Type for both text lines; animation marked decorative (accessibilityElementsHidden) so the live caption is the single spoken element.
```

### 27. Secure Reader  [E]
*Maps to: ReaderScreen.tsx*

```
The existing component uses a 60s clipboard window (`usePrivacyShield` blur shield, `useClipboardAutoClear`). I'll align the prompt with that real timing rather than the template's 45s example, and reference the existing privacy-shield and attachment-cache wiring.

SCREEN — Secure Reader (recipient, post-decrypt view; reached after biometric unlock and successful local decrypt; backs the existing ReaderScreen.tsx, gated by usePrivacyShield).
GOAL — Let the verified recipient read decrypted plaintext locally while the UI constantly signals that protection ends at the screen, then wipe everything on exit.
LAYOUT (top to bottom) — Slim top app bar below the safe-area inset: back-and-wipe chevron, centered "Decrypted on this device" green chip (primary #cfbcff icon, green tick), close-and-wipe X. Sender row: name + short fingerprint (JetBrains Mono 14, green verified tick). Amber screen-exposure banner (tertiary #e7c365 text on #3e2e00). Scrollable body: message body card (24px padding, Inter body-lg #e6e0e9 on surface-container-low #1d1b20, 1px #494551 hairline, rounded-lg). Optional Attachments section (label-sm #cbc4d2) with per-file rows (filename, size, Download via system share sheet). Sticky footer above safe-area: Copy (with clipboard-countdown ring) + Close and wipe (#cfbcff fill).
COMPONENTS — decrypted-state chip, verified-fingerprint row, amber exposure banner, message card, attachment card, clipboard-countdown ring, blur shield cover.
COPY — chip "Decrypted on this device"; banner "Anyone who can see your screen can read this now."; copy default "Copy", active "Copied — clears in 60s"; footer "Close and wipe".
STATES — text-only; with attachment(s); long-scroll (body scrolls, footer sticky); clipboard-counting-down (ring drains 60s); backgrounded (full #141218 blur cover, no content). Empty-text + attachment-only hides Copy.
MOTION — content fades in after biometric success; blur cover snaps in instantly on app-switch; copy ring drains smoothly over 60s.
SECURITY UX — blur-on-background, clipboard auto-clear at 60s, cache files wiped on unmount, no server round-trip after decrypt; green chip + verified fingerprint confirm sender authenticity.
DO-NOT — no "share plaintext" button, no "save to cloud", no save-message, never persist plaintext, no re-fetch.
TOUCH/A11y — 44pt targets, footer above safe-area inset, VoiceOver/TalkBack labels on chip ("Decrypted locally"), banner, and Close-and-wipe; dynamic type on body card.
```

### 28. Reader + Attachment  [P2]
*Maps to: attachment-cache.ts*

```
SCREEN — Reader + Attachment (recipient, decrypted-attachment view; reached after biometric unlock when the payload's primary content is a file)

GOAL — Let the verified recipient preview or save one decrypted attachment locally, while signalling that the file lives only in app-private cache and is wiped the moment they leave.

LAYOUT (top to bottom) — slim app bar (back chevron, green "Decrypted on this device" chip #6a9b7a-on-#1d1b20, close-and-wipe X in error #ffb4ab); sender + short fingerprint row (JetBrains Mono 14, green verified tick); large file card on surface-container-high #2b292f, 1px #494551 hairline, rounded-lg: 56pt type-tile (image thumbnail when an image, else generic mono glyph on #36343a), filename (Inter body-lg #e6e0e9), size + type (body-md #cbc4d2); primary "Preview" + secondary "Save to this device" buttons; amber screen-exposure banner #e7c365-on-#3e2e00; footer above safe-area inset.

COMPONENTS — decrypted-state chip, attachment file card, type-icon/thumbnail tile, Preview/Save buttons, screen-exposure banner, blur shield, wiped-state panel.

COPY — header "Decrypted on this device"; banner "Anyone who can see your screen can read this now."; save action "Save to this device"; save toast "Saved to this app only."; downloading "Decrypting file..."; wiped panel "This file has been wiped from this device."

STATES — image preview (inline thumbnail), generic file (glyph + Open in...), downloading (progress ring on tile), wiped (card replaced by neutral panel), backgrounded (blur shield snaps in).

MOTION — card fades in after biometric success; progress ring fills during decrypt; card collapses into wiped panel on leave.

SECURITY UX — file written only to app-private cache; Preview/Save via system share sheet; close-and-wipe purges the tracked cache URI (clearCachedFiles); blur-on-background; no server round-trip after decrypt.

DO-NOT — no "save to cloud" / Photos, no clipboard ring (not applicable to files), never persist after leave, no re-fetch.

TOUCH/A11y — 44pt targets; footer above safe-area inset; VoiceOver labels on chip, file card, and wipe X; dynamic type on filename/size.
```

### 29. Decryption Failed (wrong key)  [E]
*Maps to: decryption_failed_aesmsg, DecryptionFailedScreen.tsx*

```
The mobile component currently ships a placeholder "Try Again" action that directly contradicts this screen's brief (no retry-guess). The prompt below specs the correct terminal state, grounded in the real tokens and the web component's richer action set.

GOAL — Tell the recipient, calmly and finally, that this device cannot decrypt this message, and route them to the only legitimate next steps — without ever implying a retry could "guess" the key.

LAYOUT (top to bottom) — Safe-area top inset; slim app bar (back chevron left, no title); centered content column: a 96pt circle (surface-container-high #2b292f, 1px error #ffb4ab at 30% border) holding a lock_reset glyph in error #ffb4ab; h1 "Decryption failed" (Geist 32, on-surface #e6e0e9); body-md sub-copy (on-surface-variant #cbc4d2); a hairline detail card (surface-container #211f24, 1px outline-variant #494551) showing this link's target recipient fingerprint in JetBrains Mono with an amber "Key mismatch" chip (tertiary #e7c365 on #3e2e00); action stack pinned above the bottom safe-area inset.

COMPONENTS — error-anchor circle, fingerprint detail card, amber mismatch chip, primary button, two secondary buttons, one tertiary text link.

COPY — h1 "Decryption failed"; body "Your device does not have the private key required to decrypt this message. It may have been sealed for a different identity."; card label "Sealed for"; chip "Key mismatch"; primary "Import key backup"; secondary "Open on another device"; secondary "Contact sender"; footnote "Keys never leave the device that created them. There is no way to recover this message without the matching private key."

STATES — default (terminal); fingerprint-known vs fingerprint-unavailable (hide card); backgrounded (blur shield).

MOTION — content fades in once decryption resolves to failure; buttons active:scale 0.97; no shake, no alarm.

SECURITY UX — wrong key = no decryption, no recovery, no fallback; reinforce private-keys-stay-on-device; "Open on another device" hands off via system share sheet, never re-uploads plaintext.

DO-NOT — no "Try again", no "Retry", no passphrase re-entry, no "are you sure", no progress spinner that implies a second attempt, never expose ciphertext.

TOUCH/A11y — 44pt min targets; actions above safe-area inset; VoiceOver labels on chip ("Key mismatch") and fingerprint; dynamic type to AX5; respect reduce-motion.
```

### 30. Link Expired / Revoked / Unavailable  [E]
*Maps to: link_expired_aesmsg, LinkUnavailableScreen.tsx*

```
SCREEN — Link Unavailable (recipient, terminal dead-end after tapping an expired, revoked, max-opened, or never-existed secure link; the single opaque endpoint behind a 404/410/terminal-status metadata fetch).

GOAL — Tell the recipient the link cannot be opened, revealing absolutely nothing about why, who sent it, or when it lapsed, then let them leave calmly.

LAYOUT (top to bottom) — Full-bleed background (#141218), no app bar, no tab bar, no logo. Vertically centered column: one quiet outline glyph (Material Symbols `link_off`, ~48pt, stroked in outline #948e9c, never red); 24px gap; single line of body text; 48px gap; one button. Centered horizontally, max content width ~360pt, 24px side padding.

COMPONENTS — Muted status glyph, single body label, one full-width-capped action button (filled primary on mobile-standalone, or platform back affordance when launched from a link). No card, no chip, no illustration, no retry, no share.

COPY — Body (exact, the only string): "This secure link is no longer available." Button: "Done" (modal/standalone) or "Back" (in-stack). Nothing else — no subtitle, no support line, no error code.

STATES — Single canonical state for expired / revoked / max-opens / not-found — visually identical; the screen never branches. No loading (the prior metadata fetch owns that), no empty, no error variant. Backgrounded: standard blur shield, though no sensitive content is present.

MOTION — Glyph and text fade in together over ~180ms on mount; no spinner, no shake, no alarm pulse. Button press uses the platform's standard ripple/highlight.

SECURITY UX — Makes the "expired/revoked links leak nothing" invariant visible by saying strictly one neutral sentence. No sender, no fingerprint, no expiry, no open-count, no reason, no timestamp. The simple GET that reached here consumed no open and exposed no ciphertext.

DO-NOT — No reason text, no "expired" vs "revoked" wording, no sender name or avatar, no expiry/open metadata, no retry/refresh/"request again", no support email, no error code, no red coloring, no logging hint.

TOUCH/A11y — Button ≥44pt tall, anchored above the bottom safe-area inset; respects top inset. VoiceOver/TalkBack reads only the one sentence then the button label "Done". Dynamic Type scales the body line; layout stays centered and never truncates the sentence.
```

### 31. Already Opened (max opens reached)  [F]

```
SCREEN — Already Opened (recipient, terminal state after tapping a secure link whose max-open count is exhausted)

GOAL — Tell the recipient the link can no longer be opened, leaking nothing about sender, content, or history.

LAYOUT (top to bottom) — minimal top app bar (centered wordmark only, no back-to-content affordance); generous vertical centering within safe-area; circular 64pt status glyph (lock-clock / "history" Material Symbol) on surface-container-high #2b292f with a 1px outline-variant #494551 hairline ring; h2 headline; one body-md line; single low-emphasis ghost button; ample bottom padding above the safe-area inset. No tab bar.

COMPONENTS — neutral status glyph, headline, single-line explainer, secondary ghost button.

COPY — headline "This secure link was already opened"; body "This link reached its open limit and is no longer available."; button "Done".

STATES — single resolved state only (this is itself a terminal variant of "unavailable"); backgrounded → blur shield. No loading spinner, no retry, no error variant.

MOTION — glyph and text fade+rise in together (200ms, ease-out) on mount; no looping or attention animation; blur overlay snaps in on app-switch.

SECURITY UX — identical neutral treatment to expired/revoked so an observer cannot distinguish max-opens from expiry or revocation; no sender name, fingerprint, timestamp, open count, or content preview; reaching this screen consumes no further open and triggers no decrypt.

DO-NOT — no "request access", no "contact sender", no remaining-opens number, no ciphertext, no biometric prompt, no retry button.

TOUCH/A11y — glyph color #cbc4d2 (on-surface-variant), not red; "Done" button ≥44pt, above safe-area; VoiceOver/TalkBack reads "This secure link was already opened. It is no longer available."; supports dynamic type without clipping.
```

### 32. Network Error (fetching ciphertext)  [F]
*Maps to: fetch-and-open.ts*

```
The artifact shows `fetchAndOpen` does a POST that consumes an open, with no retry/error classification of its own — the failure surfaces from `openMessage`. This screen sits before any decrypt happens. Here is the prompt.

SCREEN — Network Error (recipient, fetch step before decrypt; transient failure from `fetchAndOpen` → `openMessage`)
GOAL — Reassure the recipient that nothing leaked and let them retry the ciphertext fetch, without consuming an open.
LAYOUT (top to bottom) — slim top app bar (back chevron, neutral "Secure link" title, no status chip); centered content block: outline-variant (#494551) ringed cloud-off glyph on surface-container-high (#2b292f), h2 headline (Geist, #e6e0e9), body-md reassurance (Inter, #cbc4d2), 1px-hairline info row stating no open was consumed; sticky footer above safe-area: full-width primary Retry button (#cfbcff / on-primary #381e72), text "Cancel" beneath.
COMPONENTS — error-illustration disc, headline, reassurance copy, "open not consumed" hairline note, Retry primary button with inline spinner, secondary Cancel link, transient connectivity toast.
COPY — headline "Could not fetch the encrypted message"; body "Your plaintext is not at risk — nothing was decrypted, and this attempt did not use one of the link's opens."; offline variant body adds "You appear to be offline."; server-unreachable variant "The server could not be reached. This is a connection problem, not your message."; button "Retry"; retrying button "Retrying…"; toast on recovery "Back online".
STATES — offline (wifi-off glyph, body names connectivity), server-unreachable (cloud-off glyph), retrying (Retry shows spinner, disabled, label "Retrying…"), backgrounded (blur shield, no plaintext exists yet so purely cosmetic).
MOTION — illustration fades in 150ms; Retry spinner rotates; on success, content cross-fades to biometric-unlock; recovery toast slides up then auto-dismisses 2s.
SECURITY UX — makes visible that no open was consumed and no ciphertext touched the device; reinforces zero-knowledge framing (this is transport, not trust); no metadata about the message shown.
DO-NOT — no error codes, stack traces, server hostnames, or message contents; no "report"/"contact support" that leaks the link id; never imply data loss or that the message is gone (that is the expired screen).
TOUCH/A11y — Retry 44pt min, footer respects bottom safe-area inset; VoiceOver/TalkBack: button "Retry fetching the encrypted message", note announced as "No open was used"; respects Dynamic Type; spinner exposes accessibility "Retrying".
```

### 33. Invalid Payload  [F]
*Maps to: parse-link-id.ts*

```
SCREEN — Invalid Payload (recipient, terminal state after a deep link fails `parseLinkId` or the fetched ciphertext fails to parse) [F]

GOAL — Tell the recipient this link is not a readable secure message and let them leave cleanly, with zero technical residue.

LAYOUT (top to bottom) — Safe-area top inset; slim app bar with a single close (X) chevron, no title. Centered content block: a neutral broken-link glyph in a 64pt circle on surface-container-high (#2b292f), an h2 heading, one body-md line beneath. Generous vertical centering; sticky single primary button above the bottom safe-area inset. No tab bar (this is a modal-style terminal state).

COMPONENTS — neutral state glyph (outline #948e9c, NOT red), heading, supporting line, single full-width primary button.

COPY — heading "This does not look like a valid secure message"; supporting line "The link may be incomplete or was not created by aesmsg."; button "Done".

STATES — single state only. Reached from a malformed `/l/:id` link, an empty id, a nested-path link that refused to misroute, or unparseable downloaded ciphertext — all collapse to this one screen with identical copy. Backgrounded: standard blur shield.

MOTION — glyph and text fade-in 150ms on mount; no shake, no error pulse — this is calm, not alarming.

SECURITY UX — Reinforces "links are pointers, not secrets" and "expired/revoked leak nothing": never echo the raw URL, id fragment, parse error, or stack. A bad link silently consumes no open and triggers no server round-trip.

DO-NOT — no red error styling, no "Retry", no "Report", no raw URL or id, no technical dump, no "are you sure".

TOUCH/A11y — 44pt close + 44pt button; button clears the safe-area inset; VoiceOver/TalkBack reads heading then supporting line, button labelled "Done, return"; supports dynamic type without truncation.
```


## Contacts

### 34. Contacts List  [P2]

```
SCREEN — Contacts List (sender, contact-picking + trust-management hub, reached from the Contacts tab)
GOAL — Let the user scan their contacts, see each one's trust state at a glance, and prioritize verifying anyone not yet confirmed.

LAYOUT (top to bottom) — Large-title app bar "Contacts" with a 44pt "+" add control (top-right, respects safe-area top inset); pinned search field below the title; one-line helper text under search; scrollable contact list of compact rows; glass bottom tab bar (Contacts active).

COMPONENTS — search field (leading magnifier icon, clear "x"); contact row (40pt avatar with initials fallback, name on line 1, short fingerprint on line 2 in JetBrains Mono, trailing verification badge chip); verification badge chip (3 variants); empty-search illustration block.

COPY — title "Contacts"; search placeholder "Search by name or fingerprint"; helper "Verify a contact's fingerprint before you trust their key."; badges "Verified" / "Unverified" / "Key changed"; search-empty "No contacts match that search." add button VoiceOver "Add contact".

STATES — populated list; mixed badges (verified + unverified + key-changed together); search active with results; search-empty; backgrounded (blur shield over list).

MOTION — rows fade/slide in on first load; badge chip cross-fades on trust change; search results reflow without a spinner.

SECURITY UX — fingerprint shown in mono per row reinforces manual verification; green #cfbcff-adjacent emerald "Verified", gray on-surface-variant #cbc4d2 "Unverified", amber #e7c365 on #3e2e00 "Key changed" flag a re-verify need; no key material implies server trust.

DO-NOT — no "message" or chat action; no online/presence dots; never auto-mark a contact verified; no red for unverified (ambient, not destructive).

TOUCH/A11y — 44pt rows and "+"; search field above the keyboard; row VoiceOver "Name, Verified, fingerprint"; dynamic type wraps name without clipping the badge.
```

### 35. Contact Detail  [P2]
*Maps to: contact_detail_elena_rodriguez*

```
SCREEN — Contact Detail (sender, opened from Contacts; one trusted recipient's identity record)
GOAL — Let the sender confirm who they are about to encrypt to, inspect that contact's public key fingerprint and trust state, and act (send, verify, remove).

LAYOUT (top to bottom) — Safe-area top app bar: back chevron, "Contact Details", overflow (…). Hero block: 72pt avatar, name (h1 #e6e0e9), verification chip. Amber key-changed banner (conditional). "Public Key Fingerprint" section: mono fingerprint in grouped 4-char blocks (#cbc4d2) with copy + QR-scan buttons. Metadata rows: Last used, Key created. Sticky footer above inset: primary "Send secure message", secondary "Verify fingerprint", destructive "Remove contact". Bottom tab bar.

COMPONENTS — verification chip, key-changed banner, grouped-mono fingerprint block, copy/QR icon buttons (44pt), metadata rows, remove-contact confirm bottom sheet.

COPY — Verified chip "Verified" (emerald #6750a4-adjacent green on #494551 hairline). Unverified chip "Not yet verified" (#e7c365 on #3e2e00). Banner title "This contact's key changed", body "Their public key was updated on Oct 24. Re-verify before sending." Metadata "Last used 3 days ago" / "Key created Sep 12, 2023". Remove sheet "Remove this contact? Their key is deleted from this device. Links you already sent are unaffected." Buttons "Remove" (#ffb4ab), "Cancel".

STATES — verified (green chip, no banner), unverified (amber chip, "Verify fingerprint" elevated), key changed (amber banner + chip, Send shows confirm), backgrounded (blur shield).

MOTION — banner slides down on load; chip color cross-fades; remove sheet springs from bottom.

SECURITY UX — fingerprint shown for manual/QR verification to defeat MitM; key-change surfaced loudly; removal is local-only, never implies server trust.

DO-NOT — no private keys, no message previews, no "trust anyway" shortcut, no red for unverified.

TOUCH/A11y — 44pt targets, footer above home indicator, VoiceOver labels on chip and fingerprint, Dynamic Type on metadata.
```

### 36. Add Contact  [P2]

```
SCREEN — Add Contact (sender, identity/trust setup; entry to recipient verification, reached from Contacts tab)

GOAL — Let the sender import a recipient's public key by their chosen method, then route into fingerprint verification before any message is sealed to that key.

LAYOUT (top to bottom) — large-title app bar ("Add contact", back chevron, respecting top safe-area inset); one-line intro paragraph; a stacked list of three method cards (Scan QR, Paste public key, Import contact file); below the list, a hairline-separated reassurance row in #cbc4d2; bottom tab bar persists. Tapping a card opens a native bottom sheet: Scan launches a camera viewfinder sheet; Paste opens a sheet with a JetBrains Mono multiline field + "Continue"; Import invokes the system document picker. All three resolve to the same Verify fingerprint step.

COMPONENTS — three method cards (leading Material Symbol, label, helper line, chevron) on #1d1b20 with 1px #494551 borders; camera viewfinder with corner reticle; mono paste field; parsed-key preview chip; primary "Continue" button (#cfbcff on #381e72); inline error banner.

COPY — title "Add contact"; intro "Choose how to add your contact's public key."; cards "Scan QR code" / "Point your camera at their key QR", "Paste public key" / "From clipboard or a message", "Import contact file" / "A .aesmsg key file they shared"; reassurance row "Verify this fingerprint with your contact before sending sensitive information."; paste placeholder "Paste the public key here"; error "That doesn't look like a valid public key."

STATES — default; QR scanning / detected / no-camera-permission; paste empty / parsing / invalid; import picking / unsupported-file; backgrounded (blur shield over camera and key field).

MOTION — cards press-scale 0.98; sheets slide up with spring; reticle pulses until lock; parsed-key chip fades in.

SECURITY UX — keys arrive on-device only, nothing uploaded; the reassurance row and mandatory next step make manual fingerprint verification the defense against MitM; blur-on-background hides camera and key.

DO-NOT — no "trusted automatically", no skip-verification path, no server lookup or directory search, no plaintext message field here.

TOUCH/A11y — 44pt card and button targets; sheets clear the bottom safe-area inset; VoiceOver labels naming each method and "opens fingerprint verification"; supports dynamic type without clipping mono text.
```

### 37. QR Scan  [P2]
*Maps to: qr-matrix.ts*

```
SCREEN — QR Scan [P2] (sender, adding/verifying a contact: scanning a recipient's public-key QR mid contact-add flow)

GOAL — Capture a aesmsg public-key QR with the camera and hand the decoded key string back to the contact flow, with a typed fallback when the camera is unavailable.

LAYOUT (top to bottom) — Full-bleed live camera preview; slim translucent top bar (back chevron, title "Scan public key", torch toggle right); centered rounded-lg scan frame (~260pt) with Electric Violet `#cfbcff` corner ticks over a dimmed `#141218` 60%-opacity surround; helper line below frame; bottom sheet handle area with a "Paste instead" pill above the safe-area inset.

COMPONENTS — viewfinder mask, animated corner-tick frame, scan-line sweep, torch toggle, paste-fallback button, permission-denied card, detected green-flash overlay.

COPY — title "Scan public key"; helper "Point at a aesmsg QR code"; torch label "Torch"; fallback "Paste instead"; detected toast "Public key captured"; no-permission card "Camera access is off" / body "Turn on camera access to scan a code, or paste the key instead." / buttons "Open Settings" and "Paste instead".

STATES — scanning (sweep active); detected (green `#a6d6a0`-tone full-frame flash + haptic); decoding/invalid ("That's not a aesmsg key" amber `#e7c365` toast, keep scanning); no-camera-permission card; backgrounded (preview blur shield).

MOTION — corner ticks pulse subtly; scan line sweeps top-to-bottom; on detect, frame snaps green and screen dims into the next step.

SECURITY UX — scanning only reads a public key; reinforce key stays for fingerprint verification next. Blur preview on app-switch. No frames stored or uploaded.

DO-NOT — never auto-trust a scanned key, never skip fingerprint confirmation, never persist camera frames.

TOUCH/A11y — 44pt torch and back targets; fallback pill above inset; VoiceOver "Torch, double-tap to toggle"; announce "Public key captured"; respect dynamic type in cards.
```

### 38. Verify Fingerprint  [P2]

```
Compare these characters with your contact over a trusted channel.

SCREEN — Verify Fingerprint (sender or recipient, contact-trust step reached from a contact detail or post-key-exchange). [P2]

GOAL — Let the user confirm a contact's identity out-of-band and mark them verified, defeating MitM before any secure link is trusted.

LAYOUT (top to bottom) — safe-area top app bar (back chevron, title "Verify identity", no actions); contact row (avatar, display name on-surface #e6e0e9, handle on-surface-variant #cbc4d2); centered fingerprint card on surface-container-high #2b292f with 1px outline-variant #494551 border, showing the fingerprint as large grouped JetBrains Mono 14+ blocks (e.g. 4-char groups, generous line spacing); expandable "Read aloud" row that reveals the mnemonic word list (one word per fingerprint chunk); instructional caption; sticky bottom action stack above the safe-area inset.

COMPONENTS — contact identity row, grouped-mono fingerprint card, read-aloud word-list disclosure, instructional caption, primary verify button, secondary dismiss button, just-verified green chip.

COPY — title "Verify identity"; caption "Compare these characters with your contact over a trusted channel." sub-caption "Match every group, or read the words aloud together."; primary "Mark as verified"; secondary "Not now"; verified chip "Verified"; verified line "You verified this identity on {date}."

STATES — unverified (both buttons, neutral card); just-verified (card border shifts to green #cfbcff-adjacent emerald, primary collapses into "Verified" chip, verified-date line appears).

MOTION — word list expands with height + fade; on verify, green chip scales in and a soft check pulses once; haptic success tap.

SECURITY UX — reinforces manual fingerprint/out-of-band verification; private keys never leave the device; no server attestation of identity implied.

DO-NOT — no "verify automatically", no in-app message/share to the contact, no green state before the user taps, no server "trust score".

TOUCH/A11y — 44pt targets, buttons above safe-area inset, fingerprint groups read individually to VoiceOver/TalkBack, dynamic type on caption and word list.
```

### 39. Contacts Empty State  [F]

```
SCREEN — Contacts Empty State (sender, first run of the Contacts tab; no saved recipients yet)
GOAL — Get the user to add their first recipient public key so they can start sealing messages to someone.
LAYOUT (top to bottom) — Large title "Contacts" pinned to the top app bar, respecting top safe-area inset; vertically centered empty block in the content area: quiet line-weight glyph (outline contact / key icon), short headline, one supporting line; two stacked CTA buttons below the copy; bottom tab bar (Encrypt, Links, Contacts active, Keys, Settings) above the bottom safe-area inset.
COMPONENTS — empty-state glyph, headline, subtext, primary button "Scan public key", secondary (tonal/outline) button "Paste public key".
COPY — glyph caption none; headline "No contacts yet"; subtext "Add a public key to start sending encrypted messages."; primary button "Scan public key"; secondary button "Paste public key".
STATES — default empty (shown here); pressed (button state-layer); first-add-in-progress (sheet over this screen); backgrounded (blur shield over content).
MOTION — glyph and copy fade-and-rise in on tab focus (~200ms); buttons settle 40ms after; scan/paste open as native bottom sheets.
SECURITY UX — reinforce that trust is established per-contact via their public key (scan or paste), and that a key alone never exposes message content. No server contact directory implied at this phase.
DO-NOT — no search bar, no "invite via SMS/email", no avatars, no suggested or imported contacts, no cloud sync copy.
TOUCH/A11y — 44pt minimum on both buttons, full-width with 16px side margins; glyph uses on-surface-variant #cbc4d2; headline on-surface #e6e0e9; subtext on-surface-variant #cbc4d2; primary button primary #cfbcff / on-primary #381e72; secondary outline-variant #494551 border on surface-container-low #1d1b20; VoiceOver/TalkBack: group reads "No contacts yet. Add a public key to start sending encrypted messages," buttons labelled "Scan public key" and "Paste public key"; support dynamic type without truncation.
```


## Identity / Keys

### 40. My Public Key / Identity Card  [P2]
*Maps to: my_identity_aesmsg, MyPublicKeyScreen.tsx*

```
SCREEN — My Public Key / Identity Card (sender/identity self-management, Keys tab → identity detail) [P2]

GOAL — Let the user share their own public key so contacts can encrypt to them, and trigger an encrypted private-key backup — never expose the private key itself.

LAYOUT (top to bottom) — slim app bar (back chevron, title "My public key", overflow for "Key details"); centered identity card (rounded-lg 1rem, surface-container-low #1d1b20, 1px outline-variant #494551 hairline): avatar/initials, display name (Geist h2 #e6e0e9), "Your device" label-sm; large QR (high-contrast, #e6e0e9 modules on #0f0d13 quiet zone, rounded-md); fingerprint grouped in JetBrains Mono 14 (#cbc4d2, 4-char groups, two rows); primary button "Share public key" (#cfbcff on #381e72); secondary "Copy public key" (outline); tertiary text-button "Export encrypted backup" (#cfbcff). Bottom tab bar.

COMPONENTS — identity card, QR canvas, grouped-mono fingerprint, share button (system share sheet), copy button, backup row, biometric-gated backup sheet.

COPY — caption under QR "Share this public key so others can encrypt messages only your device can decrypt."; copy toast "Public key copied"; backup subtext "Export an encrypted backup of your private key. It's protected by a passphrase and never leaves unencrypted."; backup confirm sheet "Unlock to export your encrypted backup."

STATES — default; copied (toast); generating QR (skeleton shimmer); backgrounded (blur shield over card + fingerprint); export in-progress; export biometric-cancelled (no change, no error noise).

MOTION — card fades up on mount; QR cross-fades from skeleton; copy toast slides from bottom safe-area.

SECURITY UX — only the public key/fingerprint and QR are shown; private key stays on device. Backup requires biometric unlock and is passphrase-encrypted. Blur-on-background covers the card.

DO-NOT — never render the private key, never offer plaintext/cloud backup, no "show secret key", no auto-share.

TOUCH/A11y — safe-area top/bottom; 44pt targets; VoiceOver: "Your public key, QR code", "Share public key, button", fingerprint read as grouped digits; supports dynamic type without clipping the card.
```

### 41. Export Encrypted Backup  [F]
*Maps to: secure-store.ts*

```
SCREEN — Export Encrypted Backup (sender/owner, reached from Keys tab → My Identity → Export backup). Status: [F].
GOAL — Let the owner produce a single passphrase-encrypted backup file of their identity keypair so it survives device loss, never leaving the device in usable form.
LAYOUT (top to bottom) — Safe-area top bar (back chevron, title "Export encrypted backup"); intro card on surface-container-low (#1d1b20) explaining the backup is sealed with a passphrase you choose; amber note card (tertiary #e7c365 text on #3e2e00); passphrase field + confirm field with strength meter; live requirement checklist; sticky bottom CTA above the home-indicator inset.
COMPONENTS — passphrase input (show/hide toggle, mono only inside the field), confirm input with match tick, strength meter, requirement checklist, primary "Export backup" button (#cfbcff / on-primary #381e72), exporting spinner, success sheet.
COPY — intro "Your backup is encrypted with a passphrase only you know. Without it, the file is useless."; amber "This is the only way a key leaves your device — and only in encrypted form. Store the passphrase somewhere safe; we can't recover it."; hint "Use a long, unique passphrase"; mismatch "Passphrases don't match"; CTA "Export backup"; success "Encrypted backup ready" + "Share or save this file. Keep the passphrase separate."
STATES — set passphrase (CTA disabled until valid + matching), exporting (button → spinner, "Encrypting backup…"), done (success bottom sheet → system share sheet), backgrounded (blur shield over passphrase fields).
MOTION — strength meter eases on keystroke; CTA morphs to spinner; success sheet slides up, then share sheet presents.
SECURITY UX — passphrase-derived encryption client-side; reinforce zero-knowledge ("we can't recover it"); never auto-cloud the file; blur-on-background.
DO-NOT — no plaintext key preview, no "email to myself", no recovery hint storage, no default/suggested passphrase, no biometric substitute for the passphrase.
TOUCH/A11y — 44pt targets, CTA above safe-area inset, VoiceOver labels on toggle and strength meter, Dynamic Type.
```

### 42. Rotate Key  [F]

```
SCREEN — Rotate Key (sender, identity management; reached from My Identity / My Security Keys)

GOAL — Let the user generate a fresh identity keypair while understanding that old, in-flight links still open on this device.

LAYOUT (top to bottom) — back chevron app bar titled "Rotate key"; current-key summary card (short fingerprint in JetBrains Mono 14 on surface-container-low #1d1b20); amber caution card; "What happens" two-line list; sticky footer with primary "Rotate key" button above the safe-area inset.

COMPONENTS — current-fingerprint row, amber caution card (1px outline #494551, amber accent #e7c365), confirmation bottom sheet, rotating spinner, success sheet with "Share new public key" button (system share sheet).

COPY — caution card: "New messages will use your new key. Links you already sent keep working — your old key stays on this device to open them." Confirm sheet: "Rotate your key? This can't be undone." / "Rotate key" / "Cancel". Done: "New key ready" — "Share it so contacts can verify you." Button: "Share new public key".

STATES — idle; rotating (spinner, button disabled, "Generating new key…"); done (success sheet); blurred on background.

MOTION — confirm sheet slides up; on success, fingerprint cross-fades from old to new; checkmark draws in green #cfbcff-adjacent emerald.

SECURITY UX — keys stay on device; old key retained locally only for legacy links; new public key shared explicitly, never auto-uploaded.

DO-NOT — no "delete old key" toggle, no server backup prompt, no recovery phrase.

TOUCH/A11y — 44pt targets, biometric guard before rotating; VoiceOver labels on fingerprint and caution card; dynamic type on body copy.
```

### 43. Wipe Identity Confirm  [E]
*Maps to: wipe_identity_confirm_aesmsg, WipeConfirmModal.tsx*

```
SCREEN — Wipe Identity Confirm (any role, destructive bottom sheet over My Security Keys / Settings)
GOAL — Force a deliberate, typed confirmation before permanently destroying the on-device private key.
LAYOUT (top to bottom) — dim scrim (#000 ~60%) with backdrop blur; bottom sheet, rounded-lg, surface-container-high #2b292f, grab handle; red-tinted warning icon on error-container #93000a; h2 title; body-md consequence copy on on-surface-variant #cbc4d2; JetBrains Mono short fingerprint of the key being wiped; single-line type-to-confirm input (surface-container-highest #36343a, 1px outline-variant #494551 border); stacked footer buttons above safe-area inset: Wipe private key (red), then Cancel (secondary).
COMPONENTS — warning-icon badge, fingerprint label, type-to-confirm field, primary destructive button, secondary button, inline spinner.
COPY — title "Wipe this private key?"; body "This permanently deletes your private key from this device. Messages encrypted to it become unrecoverable here."; field label "Type WIPE to confirm"; placeholder "WIPE"; primary "Wipe private key"; secondary "Cancel"; wiping state "Wiping…".
STATES — disabled (button error #ffb4ab at 38% opacity, non-interactive until exact "WIPE" matches, case-sensitive); armed (full error #ffb4ab, haptic-ready); wiping (spinner + "Wiping…", both buttons + field locked); backgrounded (blur shield over sheet).
MOTION — sheet springs up; button color crossfades disabled→armed on match; success collapses sheet downward, no confetti.
SECURITY UX — reinforces wrong-key/no-recovery (no fallback, no "are you sure" beyond this); private key is local, so wipe is final here; blur-on-background.
DO-NOT — no "export first?" upsell here, no recovery hint, no green, no biometric substitute for typing.
TOUCH/A11y — 44pt targets, footer above inset, autocapitalize off, VoiceOver "Wipe private key, destructive, disabled until you type WIPE"; dynamic type.
```

### 44. Security Alert: Contact Key Changed  [E]
*Maps to: security_alert_key_changed_aesmsg*

```
SCREEN — Security Alert: Contact Key Changed (sender, surfaced when composing to or opening the detail of a contact whose public key no longer matches the trusted one)
GOAL — Make the sender stop and re-verify the contact's new fingerprint out-of-band before any sensitive content is sealed to it.
LAYOUT (top to bottom) — Presented as a rounded-lg 1rem bottom sheet over a blur-on-background scrim. Grab handle; centered amber shield icon in a 56pt circle (tertiary #e7c365 on #3e2e00). H2 title (Geist 24/500). Body-md paragraph. Side-by-side comparison card on surface-container-high #2b292f, 1px outline-variant #494551 hairline: left column "Previous" with old fingerprint, right column "New" amber-tinted with new fingerprint, both JetBrains Mono 14, grouped into 4-char blocks. Contact name + avatar row above the card. Sticky footer above safe-area inset: primary "Verify fingerprint" (primary #cfbcff / on-primary #381e72), text button "Dismiss for now" (on-surface-variant #cbc4d2).
COMPONENTS — amber shield badge, fingerprint-diff card, mono fingerprint blocks, primary + tertiary action buttons, blur scrim.
COPY — title "This contact's key changed"; body "Their public key is different from the one you verified. Verify the new fingerprint with them through a separate channel before sending sensitive information."; column labels "Previous" / "New"; primary "Verify fingerprint"; secondary "Dismiss for now"; footnote "Until verified, this contact stays unverified."
STATES — default (both fingerprints shown); first-contact-no-prior (single fingerprint, "Verify before first send"); dismissed (contact reverts to amber unverified chip, sealing still allowed with inline warning); backgrounded (sheet blurs).
MOTION — sheet springs up; amber shield does a single calm pulse, no shake; new-fingerprint column fades in.
SECURITY UX — surfaces possible MitM via manual fingerprint verification; never auto-trusts the new key; dismiss never marks verified; no server adjudication implied.
DO-NOT — no "Trust anyway" one-tap, no red panic styling, no auto-accept, no animated alarms, never claim the server detected tampering.
TOUCH/A11y — 44pt targets, footer clears safe-area inset, fingerprints read block-by-block to VoiceOver/TalkBack, dynamic type wraps mono without truncation.
```


## Settings

### 45. Settings Root  [E]
*Maps to: security_settings_aesmsg_1, SettingsScreen.tsx*

```
I have enough grounding from both artifacts. Writing the prompt.

SCREEN — Settings Root (sender + recipient, top-level tab; hub for all account/security configuration)

GOAL — Give the user a single calm map of their identity and every place they can tune security, privacy, and keys, without surfacing crypto jargon or destructive actions at the top level.

LAYOUT (top to bottom) — large-title app bar "Settings" honoring the top safe-area inset; identity summary card (avatar/initials, display name in Geist h2, short fingerprint row in JetBrains Mono 14 with a green verified tick, plan badge pill); grouped rows in labeled sections, each row = leading icon + Inter body-md label + trailing chevron: SECURITY (Security, Privacy, Keys), PREFERENCES (Notifications, Advanced), ACCOUNT (Account, Help & About); footer caption with app version + build; Encrypt/Links/Contacts/Keys/Settings tab bar with blur fill, above bottom safe-area inset.

COMPONENTS — identity-summary-card, plan-badge pill, section-header label, settings-row, chevron, version-caption.

COPY — identity sub-line "Fingerprint verified"; plan badge "Free" / "Team"; section labels "SECURITY", "PREFERENCES", "ACCOUNT"; row labels exactly: "Security", "Privacy", "Keys", "Notifications", "Advanced", "Account", "Help & About"; footer "aesmsg 1.0.0 · Private keys stay on this device".

STATES — default; loading (skeleton identity card + rows); unverified-identity (amber #e7c365 tick, sub-line "Verify your fingerprint"); offline (rows tappable, sync caption muted); backgrounded (blur shield over fingerprint).

MOTION — rows depress to surface-container-high #2b292f on press; push transition to detail; identity card fades in after load.

SECURITY UX — fingerprint + verified tick (green) reinforce key trust; footer restates private-keys-stay-on-device; no destructive action (wipe/revoke) at root — those live behind Keys/Account.

DO-NOT — no wipe/delete/revoke buttons here; no raw public key dump; no "backup to cloud" toggle exposed at root; no server-trust copy.

TOUCH/A11y — 44pt minimum row height; respect top + bottom safe-area insets; VoiceOver labels announce label + "verified" state + "opens detail"; support dynamic type with wrapping rows; tab bar sits above the home indicator.
```

### 46. Security Settings  [E]
*Maps to: security_settings_aesmsg_2, shield-logic.ts*

```
I have the mockup structure and the shield-logic constants (60s clipboard clear, obscure-on-non-active). Writing the prompt grounded in both.

SCREEN — Security Settings (any user, Settings tab; device-protection controls for the on-device security layer)
GOAL — Let the user tune every local-only protection that guards plaintext after decryption, and trigger an immediate clipboard wipe, with each toggle's effect made legible.
LAYOUT (top to bottom) — Safe-area top inset; large title "Settings & Security" (Geist h1, #e6e0e9) + sub-line; scrollable list grouped into labelled sections (label-sm uppercase, #cbc4d2). Section 1 "Unlock": Biometric unlock (toggle), Require unlock before decrypting (toggle), App-lock timeout (segmented row → bottom sheet: Immediately / 1 min / 5 min). Section 2 "On-screen protection": Blur app preview (toggle), Block screenshots where supported (toggle). Section 3 "After decryption": Auto-wipe local plaintext (toggle), Clipboard auto-clear slider (30–60s, JetBrains Mono value) + "Clear clipboard now" row. Bottom tab bar over safe-area inset.
COMPONENTS — section card (surface-container #211f24, 1px #494551 hairline), settings-row (icon + title body-lg + sub-copy label-sm), platform switch, segmented control, value slider with mono readout, inline destructive action row.
COPY — Biometric: "Use Face ID / Touch ID to unlock aesmsg." Require unlock: "Ask for biometrics every time before a message is decrypted." Timeout: "Re-lock after this much inactivity." Blur: "Hide message contents in the app switcher." Block screenshots: "Prevent screenshots on screens showing plaintext." (footnote where unsupported: "Not supported on this device.") Auto-wipe: "Clear decrypted text from memory when you leave a message." Clipboard: "Copied secrets clear automatically after {n}s." Action: "Clear clipboard now"; toast "Clipboard cleared."
STATES — default, toggling (switch fills green emerald active, #cfbcff focus ring), timeout sheet open, slider dragging (live "45s"), screenshot-block disabled+greyed where OS lacks support, clipboard-cleared toast, backgrounded blur shield.
MOTION — switch thumb springs; sheet slides from bottom over scrim; slider value ticks in mono; toast fades up 1.5s.
SECURITY UX — every control is device-local; no server round-trip. Reinforce blur-on-background (any non-active state), screenshot blocking, biometric guard, and 60s clipboard auto-clear from shield-logic.ts.
DO-NOT — no cloud-sync of plaintext, no "remember decrypted messages", no red for active states (green = on), no copy implying the server enforces these.
TOUCH/A11y — 44pt rows/switches, sheet above home indicator; VoiceOver/TalkBack announce state ("Biometric unlock, on") and slider value; respect dynamic type with wrapping sub-copy.
```

### 47. Privacy Settings  [F]

```
SCREEN — Privacy Settings (any user, Settings tab → Privacy; controls data retained on-device and the account itself)

GOAL — Let the user clear local traces, keep analytics off by default, and delete their account, while making clear the server holds nothing readable.

LAYOUT (top to bottom) — large-title app bar "Privacy" with back chevron; intro card with zero-knowledge sub-copy; "On this device" group: "Clear local history" row (chevron, opens confirm sheet); "Diagnostics" group: "Share anonymous analytics" toggle (default off); destructive group at bottom above safe-area: "Delete account" row in error red; bottom tab bar.

COMPONENTS — grouped inset list rows, single toggle (off state #494551 track, on #cfbcff), confirm bottom sheet, biometric prompt, danger row, toast.

COPY — intro "Your messages are end-to-end encrypted. The server only ever holds ciphertext — no plaintext, no metadata about what you sent."; "Clear local history" sub "Removes opened messages and cached links from this device. Sent links keep working."; toggle "Share anonymous analytics" sub "Off by default. Never includes message content, contacts, or links."; "Delete account" sub "Permanently removes your account and revokes all your links."; clear sheet "Clear local history? This can't be undone."; delete sheet "Delete account? Your links stop working immediately. This can't be undone." Toast "Local history cleared."

STATES — default; toggle on/off; clear-confirm sheet; delete-confirm sheet (biometric required); deleting (spinner, disabled); backgrounded (blur shield).

MOTION — sheets spring up; toggle thumb slides 200ms; destructive row press deepens to #93000a; toast fades.

SECURITY UX — reinforces zero-knowledge backend and on-device-only data; analytics off by default; delete revokes links server-side (purges ciphertext); biometric gate before destructive delete.

DO-NOT — no "improve product, on by default", no cloud backup toggle, no "export my data from server", no soft-delete grace period implying server retention.

TOUCH/A11y — 44pt rows, danger row above bottom inset, VoiceOver labels distinguishing toggle vs destructive, dynamic type, toggle state announced.
```

### 48. Advanced  [F]

```
SCREEN — Advanced (sender/recipient, Settings > Advanced; kept out of primary flows)
GOAL — Let a technical user inspect their crypto format, fingerprint, and device identity, and reach debug logs, without touching keys or destructive actions.
LAYOUT (top to bottom) — large-title app bar with back chevron ("Advanced"); muted intro line on background #141218; grouped list on surface-container-low #1d1b20 with hairline #494551 dividers — Row 1 "Encryption format" value "HPKE" + chevron opening a bottom sheet explainer; Row 2 "Public key fingerprint" mono value + copy icon; Row 3 "Device ID" mono value + copy icon; Row 4 "Debug logs" chevron with caption note; footer caption.
COMPONENTS — grouped settings list, value rows, copy-icon buttons with toast, HPKE explainer bottom sheet, mono fingerprint/device chips (JetBrains Mono 14, on-surface-variant #cbc4d2).
COPY — intro "Technical details for advanced users."; Row1 sublabel "End-to-end encrypted with HPKE (X25519 / AES-256-GCM)."; sheet body "HPKE seals each message to the recipient's public key. Private keys stay on your device."; Row4 caption "Diagnostic events only. Plaintext and private keys are never written to logs."; copy toast "Copied".
STATES — default; copied (toast + brief primary #cfbcff icon flash); logs empty "No diagnostic events yet."; backgrounded (blur shield over fingerprint/device values).
MOTION — sheet slides up with backdrop blur; copy icon scales 0.9→1 on tap.
SECURITY UX — reinforces private-keys-stay-on-device and zero-knowledge backend; the no-plaintext-in-logs note makes the logging boundary visible.
DO-NOT — no key export, no key wipe, no raw private key, no "send logs to server" toggle, no red/destructive actions.
TOUCH/A11y — 44pt rows, safe-area footer, VoiceOver labels "Public key fingerprint, copy" / "Device ID, copy", Dynamic Type on labels, mono values read character-by-character.
```

### 49. Notifications Settings  [F]

```
SCREEN — Notifications Settings (sender/recipient, Settings tab → Notifications)

GOAL — Let the user choose which lifecycle alerts they receive and when, while making it visible that notifications never carry message content.

LAYOUT (top to bottom) — safe-area top bar with back chevron + "Notifications" (Geist h2, #e6e0e9); reassurance banner; "Alerts" section (label-sm uppercase #cbc4d2) with three toggle rows; "Quiet hours" section with an enable toggle then a From/To time-range row that expands; bottom tab bar (glass).

COMPONENTS — toggle rows (icon + title + helper line + native Switch), reassurance banner, time-range picker rows opening platform time wheels in a bottom sheet.

COPY — banner: "Notifications never include message content — only that something happened." Rows: "Link opened" / "When a recipient opens one of your links." · "Expiring soon" / "An hour before a link expires." · "Contact key changed" / "When a verified contact's key fingerprint changes." Quiet hours: "Quiet hours" / "Silence alerts during this window." From / To. Footer: "Quiet hours follow this device's time zone."

STATES — all on, all off, quiet hours off (range row hidden), quiet hours on (range expanded), permission-denied banner: "Turn on notifications in system settings to receive alerts."

MOTION — switches animate to green #cfbcff-adjacent emerald active track; range row height-expands when quiet hours enabled; sheet slides up.

SECURITY UX — banner reinforces zero-knowledge: alerts signal events, never plaintext or previews. "Contact key changed" surfaces the MitM warning in amber #e7c365.

DO-NOT — no message text, sender names, or link contents in any toggle preview; no email/SMS channel options; no server-trust language.

TOUCH/A11y — 44pt rows, switches above safe-area; VoiceOver states "Link opened, on"; dynamic type wraps helper lines.
```


## Account / Monetization

### 50. Account / Profile  [F]

```
SCREEN — Account / Profile (any role; Settings tab → Account)

GOAL — Let the user manage the small amount of local profile data and their subscription, while making clear the app needs almost nothing about them to work.

LAYOUT (top to bottom) — Large-title app bar "Account" over #141218; identity card on #1d1b20 (1px #494551 hairline): tappable avatar/initials disc filled #6750a4 / text #e0d2ff, display-name row, helper line; plan card with plan chip and "Manage subscription" row (chevron); "Identity & device" summary card (short fingerprint in JetBrains Mono #cbc4d2, key created date, device name, app version); footer note. Bottom tab bar (glass).

COMPONENTS — avatar-edit disc, inline display-name field, plan chip (pill), manage-subscription row, identity summary rows, info footnote.

COPY — header "Account"; avatar helper "Display name and avatar are stored on this device only."; plan chip free "Free" / pro "Pro"; free CTA row "Upgrade to Pro"; pro row "Manage subscription"; identity card title "Identity & device"; rows "Key fingerprint", "Key created", "This device", "App version"; footer "We don't store a profile for you. This is everything on this device."

STATES — free (violet "Free" chip on #2b292f, "Upgrade to Pro" row), pro (green "Pro" chip, "Manage subscription" → opens system subscription sheet), editing-name (inline field focused), backgrounded (blur shield).

MOTION — name field expands inline on tap; plan chip cross-fades on tier change; row press states at 120ms.

SECURITY UX — reinforce zero-knowledge: profile is device-local, server stores no account profile; fingerprint shown read-only (managed under Keys).

DO-NOT — no email/phone field, no password, no cloud-sync toggle, no avatar upload to server, no account-delete-from-server claim.

TOUCH/A11y — 44pt rows, safe-area top/bottom insets, VoiceOver labels on plan chip and fingerprint ("Key fingerprint, read only"), Dynamic Type on all text.
```

### 51. Pricing / Paywall  [F]

```
SCREEN — Pricing / Paywall (sender, reached from Settings or when hitting a Free-tier limit like attachment size, custom expiry, or contact count)

GOAL — Let the user understand exactly what Pro unlocks and upgrade with one tap, with zero pressure.

LAYOUT (top to bottom) — slim app bar (back chevron, title "aesmsg Pro", no close-trap); short headline block; segmented Monthly/Annual toggle (annual shows a calm "Save 20%" pill in green); two stacked comparison cards (Free, then Pro with a 1px primary #cfbcff hairline and subtle primary-container glow); feature comparison rows with check/dash glyphs; sticky safe-area footer with primary "Upgrade to Pro" button and a quiet "Restore purchases" text link below.

COMPONENTS — segmented period toggle, plan cards on surface-container-low #1d1b20, feature rows, save-badge pill, primary CTA, restore link, fine-print legal row.

COPY — headline "More room to share securely."; Free card "Free — Up to 5 MB attachments · 24h expiry · 10 contacts"; Pro features "Attachments up to 2 GB", "Custom and 7-day expiry", "Unlimited contacts", "Team credential handoff", "Priority support"; toggle "Monthly" / "Annual"; badge "Save 20%"; CTA "Upgrade to Pro"; sub-CTA "Restore purchases"; fine print "Billed via the App Store. Cancel anytime in Settings. Your encryption is unchanged on every plan."

STATES — monthly (price/mo), annual (price/yr + green save pill, per-month equivalent), loading (CTA spinner during store call), purchase-error (inline amber, "Couldn't reach the store. Try again."), already-Pro (cards collapse to "You're on Pro" with manage link), restore-success toast.

MOTION — toggle thumb slides 200ms ease; price cross-fades on period switch; Pro card hairline brightens on selection.

SECURITY UX — reassure that crypto is identical across tiers ("Your encryption is unchanged on every plan"); zero-knowledge backend and on-device keys are never gated behind payment.

DO-NOT — no countdown timers, no "limited offer", no pre-checked upsells, no fake scarcity, no claim that Pro is "more secure", no banned words.

TOUCH/A11y — 44pt toggle segments and CTA; footer above safe-area inset; VoiceOver labels announce period, price, and save percentage; respect dynamic type without truncating feature rows.
```

### 52. Manage Subscription  [F]

```
SCREEN — Manage Subscription (account holder, Settings tab → billing)

GOAL — Let the user see their current aesmsg plan and renewal, change tier, restore purchases, or cancel — all through the platform store, never a custom payment form.

LAYOUT (top to bottom) — Safe-area header with back chevron and title "Subscription"; current-plan card (tier name in Geist h2, status pill, price + renewal line, billed-through-store note); primary "Change plan" button; "Restore purchases" row; spacer; muted "Cancel subscription" row near bottom; tab bar.

COMPONENTS — plan card, status pill, list rows with chevrons, store-handoff note, confirm bottom sheet.

COPY — card label "Current plan"; status pills "Active", "Expiring May 30", "Canceled"; price "$4 / month, renews May 30"; store note "Billing is handled by the App Store. aesmsg never sees your card." (Android: "Google Play"); rows "Change plan", "Restore purchases", "Cancel subscription"; sheet "Manage your subscription in the App Store. Your keys and links are unaffected." with "Open App Store" / "Not now".

STATES — active (green #cfbcff-neutral pill on surface-container-high #2b292f); expiring (amber pill #e7c365 on #3e2e00); canceled (outline-variant #494551 pill, "Resubscribe" CTA); loading skeleton; restore-in-progress spinner; restore-failed inline "Couldn't reach the store. Try again."

MOTION — card fades in; confirm sheet slides up; store handoff dims to system sheet; blur-on-background over plan details.

SECURITY UX — reinforce that billing is store-side and zero-knowledge: changing or canceling never touches keys, links, or ciphertext. Blur-on-background.

DO-NOT — no card fields, no in-app price entry, no "downgrade wipes your data" framing, no red on ambient states (red only on the destructive cancel confirm).

TOUCH/A11y — 44pt rows above safe-area inset; VoiceOver labels announce plan, status, and price together; cancel row labeled "Cancel subscription, opens App Store"; dynamic type on card.
```

### 53. Upgrade Success  [F]

```
SCREEN — Upgrade Success (sender, immediately after a successful Pro purchase via the system in-app purchase / Stripe flow)

GOAL — Confirm the upgrade landed, show what is now unlocked, and return the user to their flow. No celebration overkill.

LAYOUT (top to bottom) — Full-bleed surface (#141218) respecting safe-area top/bottom; centered column. Calm green check glyph in a desaturated-emerald ring (no confetti). h1 "Welcome to Pro" (Geist 32/600/-0.02em, on-surface #e6e0e9). One line of body-md (#cbc4d2). A surface-container-low (#1d1b20) card with a left-aligned list of unlocked items, each a small green check + Inter body-md label. Sticky bottom CTA above the inset.

COMPONENTS — success-glyph ring, unlock-list card, primary Continue button, subtle "Manage subscription" text link.

COPY — h1 "Welcome to Pro"; sub "Your plan is active. Everything here still happens on your device." List items: "Unlimited active links", "Custom expiry windows", "Attachments up to 100 MB", "Up to 5 device keys". Primary button "Continue". Link "Manage subscription". Optional toast on entry "Pro activated".

STATES — default (active); restoring-purchase (spinner, "Restoring your plan…"); receipt-pending (card visible, items dimmed, "Finishing activation…").

MOTION — glyph ring draws once (~400ms), list items fade-stagger 40ms apart; no looping animation.

SECURITY UX — Reinforce that Pro changes limits, not the trust model: "Everything here still happens on your device." Blur-on-background applies. No new server trust implied.

DO-NOT — No confetti, no price/receipt details, no "military-grade" claims, no upsell, no server-side storage promises.

TOUCH/A11y — 44pt CTA and link targets; CTA above safe-area inset; VoiceOver label "Welcome to Pro, your plan is active"; Dynamic Type scales h1 and list; check glyphs marked decorative.
```


## System / Cross-cutting

### 54. Activity / Notifications Inbox  [F]

```
SCREEN — Activity / Notifications Inbox (sender + recipient, reachable from the tab shell; surfaces link and contact events)

GOAL — Let the user scan recent security-relevant events and tap through to the affected link or contact, without ever exposing message content.

LAYOUT (top to bottom) — large-title app bar "Activity" (Geist h1 #e6e0e9) with a right-aligned "Mark all read" text button; optional segmented filter (All / Alerts); scrollable list grouped by Today / Earlier with label-sm uppercase #cbc4d2 headers; each row: 40pt circular event icon, title (body-md #e6e0e9), one-line context (body-md #cbc4d2), trailing relative timestamp (label-sm #948e9c) and chevron; unread rows carry a 6pt #cfbcff leading dot; bottom tab bar on glass.

COMPONENTS — event row, icon chip (Material Symbols), amber alert row variant, unread dot, section header, empty-state block, pull-to-refresh spinner.

COPY — "Link opened" / "Acme staging key was viewed"; amber "Expiring soon" / "API keys for client link expires in 1h"; amber "Contact key changed" / "Verify Maya's new fingerprint before sending"; "Link revoked" / "Ciphertext purged from the server". Empty: title "You're all caught up", body "Activity on your links and contacts shows up here." Toast: "All marked read".

STATES — populated list, unread vs read, amber alert rows, empty, loading (3 skeleton rows), pull-to-refresh, backgrounded (blur shield).

MOTION — rows fade+rise on load (staggered 30ms); unread dot fades on tap; swipe row to dismiss; refresh spinner snaps to inset.

SECURITY UX — metadata only, never plaintext or previews; amber (#e7c365 on #3e2e00) flags key-change and expiry; "Ciphertext purged from the server" reinforces revocation and zero-knowledge backend; blur-on-background.

DO-NOT — no message body, no recipient identity beyond saved contact name, no decrypt action here, no red for ambient rows.

TOUCH/A11y — 44pt row targets, list inset above safe-area and tab bar, VoiceOver reads "Alert, Contact key changed, Maya, 2h ago", Dynamic Type scales titles and context.
```

### 55. Push-Permission Prompt  [F]

```
SCREEN — Push-Permission Prompt (sender/recipient, in-app soft priming shown once before the OS push dialog, after first link created or first link received)

GOAL — Earn an opt-in by explaining what notifications cover before triggering the native permission dialog.

LAYOUT (top to bottom) — Centered bottom sheet over a blurred, dimmed app (rounded-lg top, surface-container #211f24, 1px outline-variant #494551 hairline, safe-area padding at base); grabber handle; circular icon badge (Material Symbols "notifications" in primary #cfbcff on primary-container #6750a4); h2 title; body-md supporting line; two-row benefit list, each a 24px green (#cfbcff-adjacent emerald) check + label; small reassurance footnote; stacked buttons (filled primary "Enable notifications", text "Not now").

COMPONENTS — bottom sheet, icon badge, benefit-row list, primary button, text button, blur-on-background scrim.

COPY — title "Stay in the loop, privately"; body "Get a heads-up when something happens to your secure links."; benefit 1 "Know the moment a link is opened"; benefit 2 "A nudge before a link expires"; footnote "Notifications never include message content — only the event."; primary "Enable notifications"; secondary "Not now".

STATES — default; pressed (primary darkens to on-primary #381e72 wash); dismissed (sheet slides down, OS dialog only fires after primary tap); backgrounded (blur shield over sheet).

MOTION — sheet springs up 240ms ease-out; scrim fades to ~60%; tapping "Enable notifications" dismisses then hands off to the native dialog.

SECURITY UX — reinforces zero-knowledge: notifications carry event metadata only, never plaintext, previews, or sender identity beyond the event.

DO-NOT — never request permission silently, never preview message content, no "Allow" mimicking the OS button, no guilt copy on "Not now".

TOUCH/A11y — 44pt+ stacked buttons, sheet clears the home indicator, VoiceOver reads title then footnote, supports dynamic type without truncating benefit rows.
```

### 56. Generic Empty State (pattern)  [F]

```
SCREEN — Generic Empty State (pattern, any role, shown wherever a list/collection has no items yet)
GOAL — Reassure the user that nothing is wrong, name what will appear here, and offer the single action that fills the space.

LAYOUT (top to bottom) — vertical center within the content area, below the existing app bar and above the bottom tab bar (respect top + bottom safe-area insets): muted line-icon (48px, on-surface-variant #cbc4d2, 1.5px stroke); 16px gap; one-line title (Inter body-lg 18/400, on-surface #e6e0e9); 8px gap; one supporting sentence (Inter body-md 15/400, on-surface-variant #cbc4d2, max ~28em, centered); 24px gap; optional single primary CTA (filled pill, on-primary #381e72 text on primary #cfbcff). No secondary button.

COMPONENTS — empty-state-icon, empty-title, empty-body, optional empty-cta.

COPY — Links: icon=link, title "No secure links yet", body "Encrypted links you create will appear here.", CTA "Create secure link". Contacts: icon=group, title "No contacts yet", body "Add someone's public key to send them encrypted messages.", CTA "Add contact".

STATES — default (icon + title + body); with-CTA; no-CTA (informational only). Distinct from loading (skeleton, not this) and error (uses the error pattern, not this).

MOTION — fades + 8px rise-in on mount (200ms); CTA press scales to 0.97.

SECURITY UX — body copy reinforces that links/contacts live here only after explicit local action; never implies the server seeds or restores data.

DO-NOT — no illustrations, no red, no shadows, no "tip"/marketing tone, no multiple CTAs.

TOUCH/A11y — CTA 44pt min; VoiceOver groups title+body as one label, CTA announced separately; supports Dynamic Type wrapping.
```

### 57. Offline / Global Error  [F]

```
SCREEN — Offline / Global Error (any role, any flow; appears whenever encrypted data can't be reached over the network)
GOAL — Tell the user the network failed, reassure them their plaintext was never at risk, and offer a single retry — without ever implying lost or leaked content.
LAYOUT (top to bottom) — Variant A (banner): thin sticky strip directly under the status bar, respecting top safe-area inset, sitting over the current screen; slide-down from the top. Variant B (full-screen blocking): centered cloud-off icon, h2 headline, body-md reassurance line, primary Retry button; nav tabs remain visible but inert.
COMPONENTS — offline strip (surface-container-high #2b292f fill, 1px outline-variant #494551 bottom border, amber dot #e7c365); cloud-off glyph in on-surface-variant #cbc4d2; Retry button (primary #cfbcff fill, on-primary #381e72 label) with inline spinner; secondary "Try again later" text link.
COPY — banner: "You're offline." full-screen headline: "Can't reach encrypted data." body: "The encrypted data can't be reached right now. Your plaintext is safe on this device." button: "Retry". retry-in-progress: "Reconnecting…". persistent-fail toast: "Still offline — check your connection."
STATES — thin top banner (overlay, non-blocking); full-screen blocking error; retrying (spinner, button disabled); reconnected (banner slides up, green #cfbcff-adjacent confirm flash, auto-dismiss); backgrounded (blur shield).
MOTION — banner slides down 200ms ease-out, slides up on reconnect; full-screen icon fades in; Retry spinner rotates; success flash 400ms.
SECURITY UX — reinforces that plaintext stays on-device and is never network-dependent; failure leaks no metadata; no content shown, only connectivity state.
DO-NOT — no error codes, stack traces, server names, or "data lost" language; no cached ciphertext exposed; never imply the server holds readable content.
TOUCH/A11y — Retry ≥44pt; banner respects top inset, full-screen button above bottom inset; VoiceOver/TalkBack: "Offline. Retry button."; supports dynamic type.
```

### 58. Skeleton / Loading (pattern)  [F]

```
SCREEN — Skeleton / Loading (shared pattern; both roles, any data-fetch transition before list rows, detail cards, or the Secure Reader render)
GOAL — Reassure the user that content is loading without implying any server can read it, by holding layout with shimmer placeholders that match the real components.
LAYOUT (top to bottom) — Two variants. List-loading: real app bar, then 5-6 stacked row skeletons on surface-container-low #1d1b20 (leading 40pt avatar circle, two text bars 60% / 35% width, trailing pill). Reader-loading: slim app bar with a neutral (not green) chip, a sender + fingerprint-line skeleton (monospace-width bars), a tall message-body card skeleton (3-4 line bars), optional attachment-card skeleton.
COMPONENTS — shimmer-bar, shimmer-circle, shimmer-pill, shimmer-card; reduced-motion static variant.
COPY — none inside skeletons. Optional VoiceOver-only label "Loading". On slow load (>8s): "Still loading…". Never preview decrypted content.
STATES — list-loading, reader-loading, slow-load, reduced-motion (static, no sweep), backgrounded (blur shield over skeletons).
MOTION — left-to-right sweep, 1.2s loop, gradient surface-container #211f24 → surface-container-high #2b292f → #211f24; cross-fade skeleton to real content over 200ms.
SECURITY UX — chip stays neutral until decryption succeeds; no green "Decrypted" and no plaintext shapes appear pre-decrypt; blur-on-background still applies.
DO-NOT — no spinners, no fake text, no progress percentages, no green/amber security chips, no cached previous plaintext.
TOUCH/A11y — respect safe-area insets; honor Reduce Motion; expose a single aria-busy region, not per-bar labels; skeleton bars scale with Dynamic Type.
```

### 59. App-Lock Re-Auth (timeout)  [E]
*Maps to: auto-lock.ts*

```
The artifact locks the in-memory key on `background` and notes a separate `usePrivacyShield`. The re-auth overlay is the gate that appears on return. Here is the prompt.

SCREEN — App-Lock Re-Auth (any role; full-screen overlay shown on app foreground after the key was dropped on background, per `shouldLockOnAppState`)
GOAL — Re-establish device trust with biometrics (or passphrase fallback) and rehydrate the in-memory private key before any content renders.
LAYOUT (top to bottom) — Opaque full-bleed overlay on surface #141218 (no transparency, no peeking content beneath); vertically centered: brand lock glyph in a 64pt primary-container #6750a4 circle; h2 title (Geist 24/500); body-md subtitle (Inter 15/400, on-surface-variant #cbc4d2); primary Unlock button (rounded-md, on-primary #381e72 on primary #cfbcff); subtle text link "Use passphrase instead" below. Footer above safe-area: account hint row. No nav bar, no tabs.
COMPONENTS — lock glyph badge, biometric-prompt trigger, passphrase sheet (native bottom sheet, masked JetBrains-Mono-free Inter input, Unlock CTA), inline error row.
COPY — title "Locked for your privacy"; subtitle "Unlock to continue. Your private key stays on this device."; button "Unlock"; fallback link "Use passphrase instead"; passphrase sheet title "Enter your passphrase"; error "That passphrase did not match. Try again." (amber #e7c365, never red).
STATES — prompting (auto-fires Face ID / Touch ID / Android BiometricPrompt on foreground), biometric-cancelled (Unlock button re-armed), fallback-passphrase (sheet up), error, unlocking (spinner on CTA).
MOTION — overlay snaps in instantly (no fade-in race with content); on success, overlay fades out over 200ms revealing the prior screen; passphrase sheet slides up.
SECURITY UX — content never paints behind the overlay (key already dropped); biometric guard on every return; no recovery, no "skip", no count of attempts that hints at success.
DO-NOT — no plaintext preview, no app content, no "remember me", no "stay unlocked", never red ambient color.
TOUCH/A11y — 44pt targets, CTA above safe-area inset, VoiceOver/TalkBack label "Unlock aesmsg with biometrics", dynamic type on title and subtitle.
```

### 60. Background Privacy Shield  [E]
*Maps to: privacy-shield-controller.ts, usePrivacyShield.ts*

```
SCREEN — Background Privacy Shield (any role; presented over any screen the moment the app leaves the foreground, in the app switcher and on resign-active).

GOAL — Guarantee that no message, metadata, or chrome is visible in the OS app-switcher snapshot or while the app is backgrounded.

LAYOUT (top to bottom) — Full-bleed frosted panel filling every edge past the safe-area, no inset, fill #141218 at ~92% over a heavy backdrop blur of the underlying view; perfectly centered brand lock glyph (Electric Violet #cfbcff stroke on a #1d1b20 disc); nothing else — no app bar, no nav, no text rows, no badges.

COMPONENTS — full-screen blur shield (UIBlurEffect / FLAG_SECURE-aligned overlay), centered lock glyph, optional one-line wordmark beneath glyph in on-surface-variant #cbc4d2.

COPY — wordmark only: "aesmsg". Optional sublabel: "Locked while in the background." No message text, no recipient, no link, no counts.

STATES — resign-active (snaps in over any screen, including Secure Reader), app-switcher snapshot, return-to-foreground (shield removed only after biometric re-auth where the prior screen requires it), cold-resume.

MOTION — shield snaps in instantly on willResignActive (no fade, zero perceptible delay so the switcher snapshot is already covered); removes with a 120ms fade on didBecomeActive.

SECURITY UX — blur-on-background invariant made visible; the switcher thumbnail shows only the lock glyph; screenshot/recording capture the shield, never content; no server round-trip; decrypted plaintext beneath is never exposed.

DO-NOT — never render live content under reduced opacity, never show sender/recipient/fingerprint/link/notification preview, no "tap to resume" affordance, no animation that delays coverage.

TOUCH/A11y — non-interactive, accessibilityViewIsModal; VoiceOver label "aesmsg locked while in the background"; respects Reduce Motion (no fade); glyph honors dynamic type scaling; covers full bounds including notch and home-indicator insets.
```

### 61. Help / FAQ  [F]

```
SCREEN — Help / FAQ (any user, opened from Settings; reference/support surface)

GOAL — Let a user self-serve an answer about how aesmsg works and reach support if it doesn't.

LAYOUT (top to bottom) — Safe-area top app bar (back chevron, title "Help"); sticky search field below it; scrollable list of collapsible topic-group sections, each a header label over expandable Q&A rows; pinned bottom "Contact support" row above the safe-area inset; standard bottom tab bar.

COMPONENTS — search input (leading magnifier, clear X); section group headers; accordion Q&A rows (chevron, expands to answer body); empty-search illustration; contact-support row (mail/chat icon, chevron) opening the system share/compose sheet.

COPY — search placeholder "Search help"; groups "Getting started", "Sending", "Receiving", "Keys & verification", "Security model"; sample rows "What is a secure link?" → "A link is just a pointer. Without the recipient's private key it can't be opened."; "Where are my private keys stored?" → "On this device only. They never leave unless you export an encrypted backup."; "Can aesmsg read my messages?" → "No. The server only ever holds ciphertext — zero-knowledge backend."; "What happens if I lose my key?" → "The message can't be recovered. Wrong key = no decryption, by design."; empty state "No results for that term."; footer "Contact support".

STATES — default (all collapsed), row expanded, search-with-results (filtered + matched terms), search-empty, loading skeleton rows, backgrounded blur shield.

MOTION — rows expand with height + chevron rotate; search filters live; section headers stick on scroll.

SECURITY UX — answers reinforce zero-knowledge backend, keys-stay-on-device, links-are-pointers, no-recovery; copy never implies server trust.

DO-NOT — no live chat exposing message content; no account/key data inline; no banned words ("unbreakable", "military-grade").

TOUCH/A11y — 44pt rows, footer above inset, VoiceOver "collapsed/expanded" states on accordions, dynamic type for answer bodies. Colors: surface #141218, rows on surface-container-low #1d1b20, headers on-surface-variant #cbc4d2, body #e6e0e9, hairlines outline-variant #494551, support icon primary #cfbcff.
```

### 62. About / Legal  [F]

```
SCREEN — About / Legal (any user, Settings tab → About; informational leaf screen)
GOAL — Reassure the user this app is open and accountable, and route them to the policies and credits that prove it.

LAYOUT (top to bottom) — large-title app bar (back chevron, title "About"); centered app block: rounded-lg app glyph, wordmark "aesmsg" (Geist h2), version row "Version 1.4.0 (build 482)" (Inter body-md, on-surface-variant #cbc4d2); open-source card on surface-container-low #1d1b20, 1px outline-variant #494551 border: line "Open source under Apache 2.0" with a "View source" row; grouped list section (single inset card, hairline dividers #494551) of disclosure rows each with chevron: Privacy policy, Security overview, Terms of service, Acknowledgements; footer microcopy line; bottom tab bar.

COMPONENTS — app-identity block, version row with long-press-to-copy, open-source card, grouped disclosure list rows, copied toast.

COPY — version "Version 1.4.0 (build 482)"; card "Open source under Apache 2.0" / "View source"; rows "Privacy policy", "Security overview", "Terms of service", "Acknowledgements"; footer "Encrypt before you send. Private keys stay on your device."; toast "Build info copied".

STATES — default; row pressed (surface-container-high #2b292f); offline (policy rows open cached copy, no spinner); backgrounded (blur shield).

MOTION — rows fade-press 120ms; external links open in-app browser sheet; toast slides up 200ms.

SECURITY UX — reinforces zero-knowledge backend and on-device keys via footer and Security overview; no account data, no telemetry IDs shown.

DO-NOT — no login state, no email, no device identifiers, no "rate us" or marketing, no crypto jargon dump.

TOUCH/A11y — 44pt rows, list above safe-area inset; VoiceOver labels announce row purpose + "opens in browser"; dynamic type wraps version and footer.
```

### 63. Update Required / Maintenance  [F]

```
SCREEN — Update Required / Maintenance (any role, app-launch blocking gate before tabs render)
GOAL — Hold the user at a calm full-screen wall until they update or maintenance ends, with one clear action.

LAYOUT (top to bottom) — full-bleed surface #141218 honoring top + bottom safe-area insets; no tab bar, no back affordance; vertically centered block: 64px circular badge in surface-container-high #2b292f (Material Symbols: "system_update" for update, "build" for maintenance) tinted primary #cfbcff; h1 32/600 title in on-surface #e6e0e9; body-md 15/400 paragraph in on-surface-variant #cbc4d2 (max ~280px wide); sticky bottom: full-width primary pill button (on-primary #381e72 label on #cfbcff), version line beneath in label-sm.

COMPONENTS — status badge, headline, supporting paragraph, single primary CTA, version/status footnote, retry spinner state.

COPY — Update: title "Time for an update", body "A new version is required to keep your messages secure. Update to continue.", CTA "Update". Maintenance: title "Back shortly", body "We're doing brief maintenance. Your messages and keys are safe on your device.", CTA "Try again". Footnote "Version 2.4.0". Error toast "Still unreachable — try again in a moment."

STATES — update-required (store CTA), maintenance (retry CTA), checking (CTA shows inline spinner, label "Checking…"), retry-failed (toast), backgrounded (blur shield).

MOTION — badge fades+scales in 200ms; spinner replaces label in place; blur snaps in on app-switch.

SECURITY UX — reinforce keys/messages stay on-device; nothing fetched or decrypted while gated; no metadata shown.

DO-NOT — no dismiss/skip/X, no countdown timer, no alarm-red, no error codes or stack traces, no support email dump.

TOUCH/A11y — CTA 44pt min, above bottom inset; VoiceOver: badge decorative, button labelled by action; supports Dynamic Type without truncation.
```

