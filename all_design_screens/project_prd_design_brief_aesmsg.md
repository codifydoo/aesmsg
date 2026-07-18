# aesmsg — Project Requirements Document (PRD) & Design Brief

## 1. Product Vision & Strategy
aesmsg is a privacy-first encryption layer designed to provide institutional-grade security for message and file sharing over any existing communication channel (Slack, WhatsApp, iMessage, Email, etc.). Unlike traditional chat apps, aesmsg is a **zero-knowledge transmission utility**.

### Core Promise
"Encrypt before you send. Share through any app. Only the intended recipient can open it."

### Target Audience
- **Developers & DevOps**: Sharing API keys, secrets, and environment variables.
- **Legal & Finance Professionals**: Sending confidential documents and PII.
- **Privacy-Conscious Teams**: Organizations requiring an extra layer of security beyond their primary communication tools.

---

## 2. Key Features & Functionality

### 2.1 Local Encryption Engine
- **Client-Side Processing**: All encryption (AES-256-GCM) occurs locally on the sender's device.
- **Zero-Knowledge Backend**: The server only stores encrypted ciphertext and metadata. Plaintext never touches the cloud.
- **Recipient-Specific Encryption**: Messages are sealed using the recipient's public key, ensuring only their private key can decrypt them.

### 2.2 Secure Link Management
- **Ephemeral Links**: Links that self-destruct after a set number of views or a time-based expiry (10m, 1h, 24h, 7d).
- **Manual Revocation**: Senders can revoke a link at any time, instantly purging the ciphertext from the server.
- **Access Tracking**: Dashboard views to monitor link status (Available, Opened, Revoked, Expired).

### 2.3 Cryptographic Identity
- **Public Key Infrastructure (PKI)**: Every user has a unique public/private key pair.
- **Verification Flow**: Manual fingerprint verification and QR code scanning to prevent Man-in-the-Middle (MitM) attacks.
- **Key Rotation**: Securely rotate identity keys while managing legacy link access.

### 2.4 Mobile Security (Native Features)
- **Biometric Guard**: FaceID/TouchID/Android Biometrics required before decryption.
- **Privacy Shield**: App preview blurring in multitasking mode and screenshot prevention.
- **Clipboard Protection**: Automatic clearing of copied plaintext after 30-60 seconds.

---

## 3. Design Principles & Visual Identity
The UI is designed to feel **professional, calm, and reliable**, avoiding "cyberpunk" tropes in favor of high-end SaaS clarity (Stripe/Proton-inspired).

- **Color Palette**: Dark-mode first (#141218 surface) with Electric Violet primary accents and Emerald Success states.
- **Typography**: Geist (Sans-serif) for high readability, with Monospace used exclusively for cryptographic fingerprints and technical identifiers.
- **Hierarchy**: Confidence-weighted headings and generous whitespace to reduce cognitive load in a complex security environment.

---

## 4. User Journeys

### Sender Journey
1. **Compose**: Input message/file and select recipient (Verified/Unverified).
2. **Seal**: Configure expiry/view limits and trigger local encryption.
3. **Distribute**: Copy the generated secure link and paste it into the preferred messaging app.

### Recipient Journey
1. **Access**: Tap link received in a third-party app.
2. **Authenticate**: Confirm identity via biometric prompt.
3. **View**: Read message in the Secure Reader with auto-destruct safeguards active.

---

## 5. Technical Requirements (High-Level)
- **Frontend**: React/Next.js for web; Swift (iOS) and Kotlin (Android) for native mobile.
- **Crypto Library**: Standard Web Crypto API or libsodium for consistent cross-platform implementation.
- **Storage**: Scalable object storage (S3/GCS) for ciphertext; Redis for ephemeral link metadata.
- **Protocol**: Universal Links (iOS) and App Links (Android) for seamless transition from shared URL to native app.

---

## 6. Project Roadmap (Phased Approach)
- **Phase 1 (MVP)**: Web dashboard, basic text encryption, 24h link expiry, and manual PKI management.
- **Phase 2 (Mobile)**: Native iOS/Android apps, biometric unlock, and secure file attachments.
- **Phase 3 (Enterprise)**: Admin controls, audit logs (metadata only), and team-shared contact directories.

---

*Prepared by Stitch AI Assistant | aesmsg Project Snapshot*