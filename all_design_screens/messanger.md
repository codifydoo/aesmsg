# Secure Encrypted Message Links App — AI Design Plan

## Product Summary

Design a modern web and mobile app for creating encrypted messages and files that can be shared through existing communication channels such as Slack, WhatsApp, iMessage, email, SMS, Telegram, or any other app.

This product is **not a chat app**.

It is a privacy-first encryption layer that lets users:

1. Create a private message or attach a file.
2. Encrypt it locally using the recipient's public key.
3. Upload only encrypted ciphertext to a backend.
4. Generate a secure public link.
5. Share that link through any existing communication channel.
6. Let only the recipient's device decrypt it locally using the correct private key.

The server may store and expose encrypted messages publicly, but the plaintext must never be visible to the server, the transport channel, or anyone without the recipient's private key.

---

## Core Product Promise

> Encrypt before you send. Share through any app. Only the intended recipient can open it.

The UI should clearly communicate:

- Messages are encrypted locally before upload.
- Secure links point only to encrypted ciphertext.
- Existing messaging apps only transport the link.
- The backend never sees plaintext.
- Private keys never leave the user's device.
- Only the recipient's private key can decrypt the message.

Avoid claims like:

- “Unbreakable”
- “Impossible to hack”
- “Military-grade encryption”

Use calm, trustworthy language instead:

- “End-to-end encrypted”
- “Zero-knowledge backend”
- “Private keys stay on your device”
- “Only the intended recipient can decrypt”

---

## Target Users

### Primary Users

- Developers sharing API keys, secrets, credentials, environment variables, or private notes.
- Business users sending sensitive files or confidential messages through Slack, WhatsApp, iMessage, or email.
- Agencies sharing temporary credentials with clients.
- Teams that want secure handoff without adopting a new chat tool.

### Example Use Cases

- Send an API key through Slack without exposing it to Slack.
- Send a private note through WhatsApp.
- Share client credentials through email.
- Send an encrypted file link through iMessage.
- Send a temporary secure document link to a contractor.

---

## Product Positioning

Recommended positioning:

> Secure encrypted links for private messages and files.

Alternative positioning:

> A zero-knowledge secure-link service for encrypted messages and files.

> Send private data through any app without exposing the contents to that app.

> Encrypt locally. Share anywhere. Decrypt only on the intended device.

---

## Visual Style Direction

Design a premium, modern, trustworthy security product.

The app should feel:

- Calm
- Professional
- Privacy-first
- Simple
- Premium
- Reliable
- Non-technical enough for normal users
- Powerful enough for developers and business teams

Avoid:

- Hacker green terminal aesthetics
- Cyberpunk visuals
- Scary security imagery
- Overly technical crypto-first UI
- Dark, aggressive, paranoid tone

Good inspiration direction:

- Apple-like simplicity
- Linear/Vercel-style product clarity
- Proton/1Password-style trust
- Stripe-like polish
- Clean SaaS dashboard layout

---

## Color Palette

Use a dark-mode-first design with optional light mode.

Suggested dark palette:

- Background: `#070A12` or `#0B1020`
- Main surface: `#111827`
- Elevated surface: `#151B2D`
- Border: `rgba(255,255,255,0.08)`
- Primary text: `#F8FAFC`
- Secondary text: `#94A3B8`
- Muted text: `#64748B`
- Primary accent: electric blue / violet / cyan
- Success: muted emerald
- Warning: soft amber
- Danger: clean red

Use green only for verified, decrypted, successful, or safe states.

Use amber for warnings such as:

- Unverified key
- Key changed
- Expiring soon

Use red only for destructive states:

- Revoke
- Delete
- Wipe private key
- Expired due to security policy

---

## Typography

Use modern, highly readable typography.

Guidelines:

- Large confident headings.
- Clear labels.
- Generous line height.
- Monospace only for fingerprints, public keys, encrypted payload snippets, and technical identifiers.
- Avoid overly technical crypto language in primary flows.
- Hide advanced details behind expandable sections.

---

## Information Architecture

### Web App Navigation

Use a left sidebar with:

- Dashboard
- New Secure Message
- Secure Links
- Contacts
- My Keys
- Security
- Settings

### Mobile App Navigation

Use bottom tabs:

- Encrypt
- Links
- Contacts
- Keys
- Settings

Mobile home screen should also expose primary actions:

- Create Secure Message
- Open Secure Link
- Scan Public Key
- My Public Key

---

## Main User Flow

### Sender Flow

1. User opens the app.
2. User chooses “Create Secure Message”.
3. User selects a recipient from verified contacts or pastes/scans a public key.
4. User writes a message and/or attaches a file.
5. User chooses expiration and max opens.
6. App encrypts the content locally.
7. App uploads only ciphertext to the backend.
8. Backend returns a secure link.
9. User shares the link through Slack, WhatsApp, iMessage, email, SMS, etc.

### Recipient Flow

1. Recipient receives a secure link in any messaging app.
2. Recipient taps the link.
3. If the mobile app is installed, universal link opens the app.
4. App downloads encrypted ciphertext.
5. App checks whether the device has the correct private key.
6. User confirms biometric unlock.
7. App decrypts locally.
8. Plaintext is shown in a secure viewer.

---

## Web Screens

## 1. Landing Page

Purpose: Explain the product quickly and build trust.

### Hero Section

Headline:

> Encrypted links for private messages and files

Alternative headline:

> Encrypt before you send. Share through any app.

Subheadline:

> Create secure messages that can be shared over Slack, WhatsApp, iMessage, email, or SMS. Only the intended recipient's private key can decrypt them.

Primary CTA:

> Create secure message

Secondary CTA:

> See how it works

### Hero Visual

Show a clean three-step visual:

1. Encrypt locally
2. Share link anywhere
3. Recipient decrypts privately

Show channel icons or abstract cards for:

- Slack
- WhatsApp
- iMessage
- Email
- SMS

Make it clear that the product works with existing apps but is not a messenger.

### Trust Section

Show security principles as cards:

- End-to-end encrypted
- Zero-knowledge backend
- Private keys stay on device
- Public links contain ciphertext only
- Optional expiry and revoke
- Biometric unlock on mobile

### How It Works Section

Use this flow diagram:

```text
Plaintext message
      ↓
Encrypted locally
      ↓
Ciphertext stored on server
      ↓
Secure link shared anywhere
      ↓
Recipient decrypts locally
```

### Final CTA

> Start encrypting private messages

---

## 2. Web Dashboard

Purpose: Give users overview of secure links, contacts, and device security.

Layout:

- Left sidebar navigation
- Top bar with account/device status
- Main content grid

Dashboard cards:

- Create encrypted message
- Recent secure links
- Expiring soon
- Revoked messages
- Verified contacts
- Device security status

Security status examples:

- “Private key available on this device”
- “Biometric lock enabled”
- “3 verified contacts”
- “No plaintext stored”

---

## 3. Create Secure Message Screen

This is the most important product screen.

Use a clean composer layout.

### Fields

- Recipient selector
- Message textarea
- Attachment dropzone
- Expiry selector
- Max opens selector
- Require biometric decrypt toggle
- Encrypt button

### Recipient States

- Verified contact
- Unverified contact
- Public key pasted manually
- Key changed warning
- Missing public key

### Expiry Options

- 10 minutes
- 1 hour
- 24 hours
- 7 days
- Custom

### Max Opens Options

- 1 open
- 3 opens
- Unlimited until expiry

### Primary Action

> Encrypt & create link

### Encryption State

Show a polished animation or progress state:

1. Preparing message
2. Encrypting locally
3. Uploading ciphertext
4. Creating secure link

Make it visually clear that encryption happens before upload.

### Success State

After encryption, show:

- Secure link
- Copy link button
- Share button
- Revoke button
- Expiry countdown
- Message status: “Encrypted and stored as ciphertext”

Do not show plaintext in this success state by default.

---

## 4. Secure Link Details Screen

Purpose: Manage a generated encrypted link.

Show:

- Link URL
- Status: Available / Opened / Revoked / Expired
- Created time
- Expiry time
- Max opens
- Current opens
- Recipient key fingerprint
- Revoke button
- Delete button

Important copy:

> Plaintext is not stored. This screen can only show encrypted message metadata.

Do not display decrypted content here.

---

## 5. Secure Links List

Purpose: Manage all generated secure links.

Show each link as a card or table row:

- Status badge
- Created date
- Expiry date
- Recipient fingerprint or contact name
- Opens used
- Actions: Copy, Details, Revoke, Delete

Statuses:

- Available
- Opened
- Expiring soon
- Revoked
- Expired

Empty state:

> You have not created any secure links yet.

CTA:

> Create secure message

---

## 6. Contacts Screen

Purpose: Manage recipient public keys.

Show contact cards with:

- Name
- Avatar or initials
- Verification status
- Public key fingerprint
- Last key update
- Key trust status

States:

- Verified
- Unverified
- Key changed
- Expired key
- Needs verification

Actions:

- Add contact
- Scan QR
- Paste public key
- Verify fingerprint
- Remove contact

Fingerprint UI:

```text
A91C 22F0 78BB 19D2
```

Helper copy:

> Verify this fingerprint with your contact before sending sensitive information.

---

## 7. Contact Detail Screen

Show:

- Contact name
- Public key fingerprint
- Verification status
- Last used date
- Key created date
- Key changed warning, if relevant
- Send secure message button
- Verify fingerprint button
- Remove contact button

Key changed warning:

> This contact's public key has changed. Verify the fingerprint before sending sensitive information.

---

## 8. My Keys Screen

Purpose: Manage user identity and keys.

Show:

- Current public key
- QR code for public key
- Copy public key
- Share public key
- Device fingerprint
- Backup status
- Key creation date

Security actions:

- Export encrypted backup
- Import backup
- Rotate key
- Revoke device
- Wipe private key

Important copy:

> Your private key never leaves this device unless you export an encrypted backup.

Danger zone:

- Wipe private key
- Rotate identity key
- Delete local encrypted database

Danger actions must use red styling and confirmation modals.

---

## 9. Open Secure Link Screen

This screen appears when someone opens a secure link.

### State: App Installed / Key Available

Show:

- “Secure message found”
- Recipient key match
- Expiry info
- Decrypt button
- Biometric prompt before decrypting

After decrypting, show plaintext in a secure viewer.

Secure viewer features:

- Blur when app goes to background
- Copy button with clipboard auto-clear
- Download attachment button
- Delete local copy button
- Warning: “Anyone who can see your screen can read this after decryption.”

### State: App Not Installed

Show landing page:

> This secure message requires the app to decrypt.

Actions:

- Install for iOS
- Install for Android
- Learn how secure links work

Explanation:

> The message is encrypted and cannot be read here without the recipient's private key.

### State: Wrong Private Key

Show:

> Your device does not have the private key required to decrypt this message.

Actions:

- Import key backup
- Open on another device
- Contact sender

### State: Expired / Revoked

Show:

> This secure link is no longer available.

Do not reveal sensitive metadata.

---

## 10. Security Settings Screen

Sections:

### Device Security

- Biometric unlock
- Require unlock before decrypting
- App lock timeout
- Blur app preview
- Block screenshots where supported

### Clipboard Protection

- Auto-clear clipboard after 30 seconds
- Warn before copying plaintext
- Clear clipboard now

### Key Management

- Export encrypted backup
- Import backup
- Rotate key
- Wipe private key

### Privacy

- Clear local history
- Disable analytics
- Delete account

### Advanced

- Encryption format
- Public key fingerprint
- Device ID
- Debug logs, with plaintext never included

---

# Mobile App Screens

## 1. Mobile Home

Show:

- App security status card
- Primary CTA: Create Secure Message
- Secondary CTA: Open Secure Link
- Quick actions:
  - Scan QR
  - Copy my public key
  - Add contact
  - Import backup

Security status card:

> Private key secured on this device

Subtext:

> Biometric unlock enabled

---

## 2. Mobile Create Secure Message

Mobile composer:

- Recipient selector at top
- Message field
- Add file button
- Expiry selector as bottom sheet
- Max opens selector
- Encrypt button fixed at bottom

After encryption:

Show generated link with actions:

- Copy link
- Share via system share sheet
- Revoke
- View details

Animation idea:

Plaintext card transforms into encrypted card, then into secure link.

---

## 3. Mobile Generated Link Success

Show:

- Success icon or lock animation
- Secure link card
- Copy link button
- Share link button
- Expiry countdown
- Revoke button

Copy:

> Your message was encrypted locally. Only encrypted ciphertext was uploaded.

---

## 4. Mobile Decrypt Secure Link

Input methods:

- Auto-open from universal link
- Paste link
- Paste encrypted payload
- Scan QR code
- Open `.aesmsg` file

Before decrypt:

Show:

- Secure message metadata
- Recipient key match
- Expiry status
- Decrypt button

Decrypt button should trigger Face ID / Touch ID / Android biometric prompt.

---

## 5. Mobile Secure Reader

After decrypt, show:

- Message content
- Attachments
- Copy button
- Download attachment button
- Close and wipe button

Security UI:

- Clipboard auto-clear countdown
- “Plaintext is only visible on this device” notice
- Screenshot warning or blocking where possible
- Blur content when app goes to background

Warning copy:

> After decryption, anyone who can see your screen can read this message.

---

## 6. Mobile Contacts

Show compact contact list:

- Name
- Verification badge
- Fingerprint short version
- Key status

Add contact flow:

1. Scan QR
2. Paste public key
3. Import contact file
4. Verify fingerprint

---

## 7. Mobile Contact Detail

Show:

- Contact name
- Public key fingerprint
- Verification status
- Last used
- Key changed warning
- Send secure message button
- Verify fingerprint button

---

## 8. Mobile My Public Key

Make this feel like an identity card.

Show:

- QR code
- Public key fingerprint
- Share public key button
- Copy public key button
- Export encrypted backup

Copy:

> Share this public key so others can encrypt messages only your device can decrypt.

---

## 9. Mobile Settings / Security

Sections:

### Security

- Biometric unlock
- Require unlock before decrypting
- Clipboard auto-clear
- Blur app preview
- Block screenshots
- Auto-wipe local plaintext

### Keys

- Export encrypted backup
- Import backup
- Rotate key
- Wipe private key

### Privacy

- Clear local history
- Disable analytics
- Delete account

### Advanced

- Encryption format
- Public key fingerprint
- Device ID
- Debug logs

---

# Core Components

Design a complete component system.

Required components:

- Button variants
- Input fields
- Message composer
- Recipient selector
- Contact card
- Contact verification badge
- Fingerprint card
- Public key QR card
- Secure link card
- Expiry selector
- Max opens selector
- Warning banner
- Decrypt modal
- Biometric prompt mock
- File attachment card
- Empty states
- Error states
- Loading states
- Status badges
- Danger confirmation modal

---

# Important UI States

### Verified Contact

Badge:

> Verified

Visual style:

- Calm green
- Shield/check icon

### Unverified Contact

Badge:

> Unverified

Visual style:

- Neutral gray
- Prompt to verify fingerprint

### Key Changed

Badge:

> Key changed

Visual style:

- Amber warning
- Strong but not panic-inducing

Copy:

> Verify this contact's fingerprint before sending sensitive information.

### Revoked Link

Badge:

> Revoked

Visual style:

- Muted red/gray
- Disabled actions except delete

### Expired Link

Badge:

> Expired

Visual style:

- Muted gray

### Decrypted Message

Badge:

> Decrypted locally

Visual style:

- Secure green/blue state

---

# Empty States

### Secure Links Empty State

Text:

> You have not created any secure links yet.

CTA:

> Create secure message

### Contacts Empty State

Text:

> Add a public key to start sending encrypted messages.

CTA:

> Scan public key

### Missing Key Empty State

Text:

> This device has no private key.

Actions:

- Generate new key
- Import backup

---

# Error States

### Wrong Key

> Your device does not have the private key required to decrypt this message.

Actions:

- Import backup
- Open on another device
- Contact sender

### Expired

> This secure link has expired.

### Revoked

> The sender revoked this secure link.

### Already Opened

> This secure link was already opened.

### Network Error

> Could not fetch encrypted message. Your plaintext is not at risk.

### Invalid Payload

> This does not look like a valid secure message.

---

# Interaction Details

Use subtle, polished microinteractions:

- Lock animation during encryption
- Encrypted card transformation after successful encryption
- Smooth progress state for creating secure link
- Expiry countdown timer
- Subtle warning animation when key changed
- Bottom sheets on mobile
- Swipe actions for revoke/delete
- Biometric unlock modal before decrypting

---

# Security UX Requirements

The design must make the following security principles visible without overwhelming the user:

- Plaintext is encrypted before upload.
- Server stores ciphertext only.
- Link is a pointer, not the secret.
- Private key stays on the recipient device.
- Wrong private key cannot decrypt.
- Expired or revoked links should not reveal sensitive details.
- Decrypted content is no longer protected from screenshots, cameras, or manual copying.

---

# Backend Concept To Reflect In UI

The backend acts as an encrypted object store.

It stores:

- Message ID
- Ciphertext
- Creation time
- Expiry time
- Max opens
- Status

It should not store:

- Plaintext
- Private keys
- Message preview
- Unencrypted attachments
- Sensitive metadata where avoidable

UI copy should reinforce:

> Secure links point to encrypted data only.

---

# Link Preview Protection

Messaging apps may generate link previews by opening the URL automatically.

The UI/UX should account for this:

- Public link page should show a harmless landing page.
- The ciphertext should not be consumed by simple GET preview requests.
- Actual fetch/decrypt should require explicit app action.

Landing page copy:

> This is a secure encrypted message. Open it in the app to decrypt locally.

---

# Responsive Requirements

Create designs for:

1. Desktop web dashboard
2. Mobile responsive web
3. Native mobile app screens

Desktop:

- Sidebar layout
- Large composer card
- Metadata panels
- Table/list for secure links

Mobile:

- Bottom tab navigation
- Full-screen composer
- Bottom sheets
- Large touch targets
- Native sharing flow

---

# Suggested Product Names

Optional naming directions:

- aesmsg
- LockNote
- CipherLink
- PrivateLink
- KeyDrop
- SecretLink
- CipherDrop
- VaultLink

Recommended neutral name for design mockups:

> aesmsg

---

# Final Design Output Required

Generate a polished UI/UX design system and complete screens for both web and mobile.

## Web Screens

- Landing page
- Dashboard
- Create secure message
- Generated link success
- Secure link details
- Secure links list
- Contacts
- Contact detail
- My keys
- Open secure link page
- Settings/security

## Mobile Screens

- Home
- Create secure message
- Generated link success
- Decrypt secure link
- Secure reader
- Contacts
- Contact detail
- My public key
- Settings/security

The final design should feel production-ready, trustworthy, privacy-focused, and simple enough for non-technical users.
