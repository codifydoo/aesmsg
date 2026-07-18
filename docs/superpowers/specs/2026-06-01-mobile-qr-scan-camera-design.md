# Mobile QR scan — real camera capture for Add Contact

**Date:** 2026-06-01
**Status:** Approved (design)
**Area:** `apps/mobile`

## Problem

When a user adds a contact and chooses **Scan QR code**, the camera never opens. The
behavior is correct for the current code state, not a regression: `QRScanScreen.tsx` is an
intentional presentational **placeholder**. Its own header comment states there is "no real
camera" and that real capture is a follow-up requiring `expo-camera`. Evidence:

- No camera library is installed in `apps/mobile/package.json` (no `expo-camera` /
  `expo-barcode-scanner`).
- The "camera preview" is a faux diagonal-stripe backdrop; the corner brackets are
  decorative; the flashlight button is hard-disabled.
- `onResult` (the decoded-payload callback) is never invoked, and `ContactsFlow.tsx` renders
  `QRScanScreen` without even passing `onResult`.
- `PermissionsPrimingScreen.tsx` is also a placeholder — it never requests OS camera
  permission.

## Goal

Replace the placeholder with a live `expo-camera` scanner that reads an `amk1:` public-key QR
and feeds it into the existing **name → add** contact flow, reusing the paste-key validation
path so no crypto/validation logic is duplicated.

The QR that contacts display (`MyPublicKeyScreen` → `toQrMatrix(publicKeyString)`) encodes the
raw `amk1:` public-key string, so the scanner only needs to decode the QR text and hand it to
the existing ingestion path (`importPublicKey` → `addContact`).

## Non-goals (out of scope)

- Wiring the onboarding `PermissionsPrimingScreen` "Continue" button to request OS permissions.
  The scanner requests camera permission on first open regardless; the priming screen remains a
  separate follow-up.
- `.aesmsg` contact-file import (still a `ComingSoonScreen`).
- Any change to the sender-side QR rendering or the crypto package.

## Design

### 1. Native dependency & app config

- Add `expo-camera` via `npx expo install expo-camera` so the SDK-56-correct version is pinned
  (not a hand-guessed version).
- `app.config.ts` — add to the `plugins` array:

  ```ts
  [
    "expo-camera",
    {
      cameraPermission:
        "aesmsg uses the camera only to scan a contact's public-key QR. Nothing is uploaded.",
      barcodeScannerEnabled: true,
    },
  ]
  ```

  This injects iOS `NSCameraUsageDescription` and the Android `CAMERA` permission. The
  permission copy stays on-message (zero-knowledge: nothing uploaded), per the design-system
  copy rules.

- Adding a native dependency requires a **clean rebuild** (Expo prebuild + `pod install` per the
  project iOS build recipe). The change is verified on the simulator before completion is claimed.

### 2. Pure, node-tested logic — `src/contacts/scanned-key.ts`

Keeps the camera component thin and presentational, per the `apps/mobile` test convention
(node-env Vitest, no React renderer; extract pure logic into testable modules):

- `normalizeScannedPayload(raw: string): string` — trims surrounding whitespace from the decoded
  barcode data.
- `isAcceptableScan(raw: string): boolean` — wraps the existing, already-tested
  `looksLikePublicKey` (from `@/src/create/recipient`). This is the **quick gate** that decides
  accept-vs-error-banner at scan time. It is deliberately NOT the authoritative validator: the
  strict, throwing `importPublicKey` check still runs later on the paste screen's submit, exactly
  as it does for the paste flow today. A scan that passes the quick gate but fails strict import
  surfaces the same paste-screen error as a bad paste.

### 3. `QRScanScreen` rewrite (same visual layout, real camera)

Drives off `useCameraPermissions()` from `expo-camera`. The existing layout (top bar, centered
corner-bracket viewfinder, prompt, "Paste instead" pill) is preserved; only the backdrop and
behavior change.

States:

- **Undetermined** — request permission on mount; show a neutral dark canvas while pending.
- **Granted** — render `<CameraView>` (facing `back`,
  `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`, `onBarcodeScanned`) as the full-bleed
  background, with the existing corner-bracket viewfinder + prompt overlaid on top. The
  flashlight button now toggles a real `enableTorch` instead of being decorative.
- **Denied / blocked** (or `onMountError` fires) — replace the viewfinder with an inline
  "Camera access needed" rationale, an **Open Settings** button (`Linking.openSettings()`), and
  the existing **Paste instead** action. No dead end.

Scan handling (`onBarcodeScanned`):

- Debounced so a single bad code does not spam the UI and a successful scan fires once.
- `const key = normalizeScannedPayload(result.data)`.
- `isAcceptableScan(key)` ? call `onResult(key)` : show a brief inline banner
  ("That's not an aesmsg public key") and keep the camera live for a retry.

Cleanup: the faux diagonal-stripe backdrop is removed (the real preview replaces it). The now-dead
`stripeOffsets` helper is dropped from `src/contacts/qr-viewfinder.ts` and its test, keeping
`bracketGeometry` / `CORNERS` (still used for the overlay).

### 4. Wiring the scanned key into name → add

- `PasteKeyScreen` gains an optional `initialKey?: string` prop that prefills the key field
  (name is still required; submit still runs `importPublicKey` → `addContact` unchanged).
- `ContactsFlow`:
  - The `paste` route gains an optional `prefillKey`.
  - `QRScanScreen` is passed `onResult={(key) => setRoute({ name: "paste", prefillKey: key })}`.

Data flow:

```
Add Contact → onPick("scan")
  → route: scan → QRScanScreen (live camera)
    → onBarcodeScanned → isAcceptableScan? yes
      → onResult(key) → route: paste { prefillKey: key }
        → PasteKeyScreen (key prefilled) → user types name → Add
          → importPublicKey + addContact → onAdded
            → route: detail (fingerprint verification lives here)
```

This realizes the chosen **Scan → name → add** UX.

### 5. Error / permission states (summary)

| State | Behavior |
|---|---|
| Permission undetermined | Request on mount; neutral dark canvas while pending. |
| Permission denied / blocked | Inline rationale + Open Settings + Paste instead. |
| Camera mount error | Same fallback as denied (treat camera as unavailable). |
| Invalid / non-aesmsg QR | Debounced inline banner; camera stays live for retry. |
| Valid `amk1:` QR | `onResult` fires once → name → add. |

### 6. Testing & verification

- New `tests/scanned-key.test.ts`: `normalizeScannedPayload` (trim, whitespace, empty) and
  `isAcceptableScan` (valid `amk1:` key, non-key string, empty). `looksLikePublicKey` itself is
  already covered by `tests/recipient.test.ts`.
- Camera/permission UI behavior is manual-verify on the simulator (node-env convention forbids a
  React renderer here).
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test` (all workspaces) must pass.
- Native: clean rebuild + on-simulator smoke test (open scanner, grant permission, scan a public
  key QR from `MyPublicKeyScreen`, land on prefilled paste screen, add, verify deny→Settings path).

## Files touched

- `apps/mobile/package.json` — add `expo-camera`.
- `apps/mobile/app.config.ts` — add the `expo-camera` config plugin.
- `apps/mobile/src/contacts/scanned-key.ts` — new pure module.
- `apps/mobile/src/contacts/QRScanScreen.tsx` — real camera + permission states.
- `apps/mobile/src/contacts/qr-viewfinder.ts` — remove dead `stripeOffsets`.
- `apps/mobile/src/contacts/PasteKeyScreen.tsx` — add `initialKey` prop.
- `apps/mobile/src/contacts/ContactsFlow.tsx` — wire `onResult` + `prefillKey`.
- `apps/mobile/tests/scanned-key.test.ts` — new test.
- `apps/mobile/tests/qr-viewfinder.test.ts` — drop `stripeOffsets` cases.
