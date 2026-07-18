# aesmsg Screen List

## Web Screens
1. **Landing Page**: Hero with "Encrypt before you send", 3-step visual, trust section.
2. **Dashboard**: Overview of secure links, recent activity, and device security status.
3. **Create Secure Message**: Main composer with recipient selector, message area, expiry/max opens.
4. **Secure Links List**: Management table for all generated links with status badges.
5. **My Keys**: User identity management, QR code for public key, and security actions.
6. **Open Secure Link (Public)**: Recipient landing page to decrypt or install app.
7. **Set Passphrase**: First-visit identity creation. Two-input passphrase form with confirmation, info card about Argon2id and no-recovery.
8. **Unlock Passphrase**: Returning-visit identity decrypt. Single-input passphrase form, wrong-passphrase error state, "Wipe and start over" destructive route.
9. **Wipe Identity Confirm**: Modal overlay before key wipe. Type-to-confirm "WIPE" input, two-button (cancel + wipe) footer.
10. **Documentation** (`docs_aesmsg`): Three-column docs layout — left grouped sidebar nav, scrollable prose content, right "On this page" table of contents — covering introduction, how it works, quickstart, encryption model, keys & identity, secure links, expiry & revocation, threat model, and zero-knowledge.

## Mobile Screens
1. **Mobile Home**: Security status card and quick actions (Create, Scan, Open).
2. **Mobile Create Message**: Full-screen composer with bottom sheet options.
3. **Mobile Secure Reader**: Secure viewer for decrypted content with blur-on-background protection.
4. **Mobile My Public Key**: "Identity card" style screen with QR and fingerprint.
5. **Mobile Contacts**: Compact list with verification badges and quick-add options.