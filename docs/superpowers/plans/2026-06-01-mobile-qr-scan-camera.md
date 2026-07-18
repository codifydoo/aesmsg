# Mobile QR Scan — Real Camera Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `QRScanScreen` placeholder in `apps/mobile` with a live `expo-camera` scanner that reads an `amk1:` public-key QR and routes the decoded key into the existing name → add contact flow.

**Architecture:** A new pure module (`scanned-key.ts`) decides whether a decoded barcode is worth accepting (reusing the tested `looksLikePublicKey`). `QRScanScreen` drives off `useCameraPermissions()` and renders a `CameraView` (granted), a "requesting" canvas (undetermined), or an inline rationale + Open Settings + Paste fallback (denied / mount error). On an acceptable scan it calls `onResult(key)`, which `ContactsFlow` wires to the `paste` route with a `prefillKey`, so `PasteKeyScreen` does the authoritative `importPublicKey` validation exactly as the paste flow does today.

**Tech Stack:** Expo SDK 56, `expo-camera` (`CameraView` + `useCameraPermissions`), React Native, TypeScript strict, Vitest (node env, no RN renderer), Biome.

---

## File Structure

- `apps/mobile/package.json` — add `expo-camera` dependency.
- `apps/mobile/app.config.ts` — add the `expo-camera` config plugin (permission strings + barcode scanning).
- `apps/mobile/src/contacts/scanned-key.ts` — **new** pure module: `normalizeScannedPayload`, `isAcceptableScan`.
- `apps/mobile/tests/scanned-key.test.ts` — **new** node test for the pure module.
- `apps/mobile/src/contacts/PasteKeyScreen.tsx` — add optional `initialKey` prop.
- `apps/mobile/src/contacts/ContactsFlow.tsx` — `paste` route gains `prefillKey`; pass `onResult` to `QRScanScreen`.
- `apps/mobile/src/contacts/QRScanScreen.tsx` — real camera + permission states (full rewrite).
- `apps/mobile/src/contacts/qr-viewfinder.ts` — remove dead `stripeOffsets` helper.
- `apps/mobile/tests/qr-viewfinder.test.ts` — drop `stripeOffsets` cases.

---

## Task 1: Add expo-camera dependency and config plugin

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`)
- Modify: `apps/mobile/app.config.ts:67-80` (the `plugins` array)

- [ ] **Step 1: Install expo-camera (pins the SDK-56-correct version)**

Run from the mobile app directory so it lands in the right workspace:

```bash
cd apps/mobile && npx expo install expo-camera
```

Then sync the workspace lockfile from the repo root:

```bash
cd ../.. && pnpm install
```

Expected: `expo-camera` appears under `dependencies` in `apps/mobile/package.json` with a `~56.0.x` version, and `pnpm-lock.yaml` updates with no errors.

- [ ] **Step 2: Register the config plugin**

In `apps/mobile/app.config.ts`, add the `expo-camera` entry to the `plugins` array (alongside the existing `expo-secure-store`, `expo-local-authentication`, `expo-notifications`, `expo-splash-screen` entries):

```ts
  plugins: [
    "expo-secure-store",
    "expo-local-authentication",
    "expo-notifications",
    [
      "expo-camera",
      {
        cameraPermission:
          "aesmsg uses the camera only to scan a contact's public-key QR. Nothing is uploaded.",
        barcodeScannerEnabled: true,
        // REQUIRED: the plugin defaults recordAudioAndroid to true, which would add RECORD_AUDIO
        // to the Android manifest. A QR-only scanner never records audio — opt out explicitly.
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-mark.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#141218",
      },
    ],
  ],
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck` (or `pnpm typecheck` from root)
Expected: PASS (config + new dep resolve; no app code uses the camera yet).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.config.ts pnpm-lock.yaml
git commit -m "feat(mobile): add expo-camera dependency and config plugin"
```

> Note: this is a native dependency. The app must be rebuilt from scratch (Task 7) — Metro fast-refresh will not pick up the new native module.

---

## Task 2: Pure scanned-key module (TDD)

**Files:**
- Create: `apps/mobile/src/contacts/scanned-key.ts`
- Test: `apps/mobile/tests/scanned-key.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/scanned-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAcceptableScan, normalizeScannedPayload } from "@/src/contacts/scanned-key";

describe("normalizeScannedPayload", () => {
  it("trims surrounding whitespace and newlines", () => {
    expect(normalizeScannedPayload("  amk1:abc \n")).toBe("amk1:abc");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(normalizeScannedPayload("   ")).toBe("");
    expect(normalizeScannedPayload("")).toBe("");
  });
});

describe("isAcceptableScan", () => {
  it("accepts something shaped like an aesmsg public key", () => {
    // A long amk1: payload — looksLikePublicKey checks the prefix + a plausible body length.
    expect(isAcceptableScan(`amk1:${"a".repeat(48)}`)).toBe(true);
  });

  it("rejects a non-aesmsg QR payload (URL, plain text)", () => {
    expect(isAcceptableScan("https://example.com")).toBe(false);
    expect(isAcceptableScan("hello world")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isAcceptableScan("")).toBe(false);
  });

  it("normalizes before checking (whitespace-wrapped key is accepted)", () => {
    expect(isAcceptableScan(`  amk1:${"a".repeat(48)}\n`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test scanned-key`
Expected: FAIL — `Cannot find module '@/src/contacts/scanned-key'`.

- [ ] **Step 3: Verify the reused helper's exact contract**

Before implementing, confirm the name and behavior of `looksLikePublicKey`:

Run: `grep -n "export function looksLikePublicKey" apps/mobile/src/create/recipient.ts`
Expected: a single exported `looksLikePublicKey(value: string): boolean`. (It is already covered by `apps/mobile/tests/recipient.test.ts`.) If the body-length threshold differs from 48 chars, adjust the test's `"a".repeat(48)` so the valid cases clear the threshold — the point is "long amk1: payload passes, junk fails".

- [ ] **Step 4: Write minimal implementation**

Create `apps/mobile/src/contacts/scanned-key.ts`:

```ts
import { looksLikePublicKey } from "@/src/create/recipient";

// Pure helpers for turning a scanned QR barcode into an add-contact candidate. Extracted
// (node-tested, no React) per the apps/mobile convention so QRScanScreen stays presentational.
// These are the *quick* scan-time gate only — the authoritative validation is importPublicKey(),
// which still runs on the paste screen's submit (identical to the paste flow).

// The aesmsg public-key prefix (mirrors PUBKEY_PREFIX in @aesmsg/crypto; kept as a local literal
// so this module stays free of crypto internals, matching PasteKeyScreen's "amk1:…" placeholder).
const AMK_PREFIX = "amk1:";

/** Trim surrounding whitespace/newlines a QR encoder or scanner may include. */
export function normalizeScannedPayload(raw: string): string {
  return raw.trim();
}

/** True when a decoded barcode looks enough like an aesmsg public key to route to add-contact. */
export function isAcceptableScan(raw: string): boolean {
  // The prefix gate is load-bearing: looksLikePublicKey is permissive (it allows ':' '/' '.'),
  // so a URL like "https://example.com" passes it. A camera scanner sees arbitrary QR codes
  // (URLs, vCards, Wi-Fi), so require the amk1: prefix before accepting — unlike the paste flow
  // where the user deliberately typed a key. Authoritative validation is still importPublicKey().
  const normalized = normalizeScannedPayload(raw);
  return normalized.startsWith(AMK_PREFIX) && looksLikePublicKey(normalized);
}
```

> Note: the prefix gate above was discovered necessary during implementation — without it the
> module's own shipped test (`isAcceptableScan("https://example.com") === false`) fails, because
> `looksLikePublicKey` permits URL characters. The shipped test also includes a boundary case
> `isAcceptableScan("amk1:abc") === false` (prefix present but body too short).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test scanned-key`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/contacts/scanned-key.ts apps/mobile/tests/scanned-key.test.ts
git commit -m "feat(mobile): add pure scanned-key gate for QR scanning"
```

---

## Task 3: Prefill support in PasteKeyScreen

**Files:**
- Modify: `apps/mobile/src/contacts/PasteKeyScreen.tsx:16-26` (props + initial state)

- [ ] **Step 1: Add the optional `initialKey` prop to the interface**

In `apps/mobile/src/contacts/PasteKeyScreen.tsx`, extend `PasteKeyScreenProps`:

```ts
export interface PasteKeyScreenProps {
  onBack: () => void;
  /** Called with the new contact's id after a successful add. */
  onAdded: (contactId: string) => void;
  /** Pre-populate the key field (e.g. handed in from the QR scanner). */
  initialKey?: string;
}
```

- [ ] **Step 2: Seed the key field from `initialKey`**

Change the component signature and the `key` state initializer:

```ts
export function PasteKeyScreen({ onBack, onAdded, initialKey }: PasteKeyScreenProps) {
  const [key, setKey] = useState(initialKey ?? "");
```

Leave the rest of the component unchanged — `canAddContact`, `importPublicKey` on submit, and `pasteContactError` already handle a prefilled key identically to a pasted one (a prefilled-but-strictly-invalid key surfaces the same `InvalidFormatError` copy on submit).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (the new prop is optional; existing callers are unaffected).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/contacts/PasteKeyScreen.tsx
git commit -m "feat(mobile): let PasteKeyScreen accept a prefilled key"
```

---

## Task 4: Wire the scan result through ContactsFlow

**Files:**
- Modify: `apps/mobile/src/contacts/ContactsFlow.tsx:29-36` (Route type)
- Modify: `apps/mobile/src/contacts/ContactsFlow.tsx:156-168` (scan + paste cases)

- [ ] **Step 1: Add `prefillKey` to the `paste` route**

In the `Route` union in `apps/mobile/src/contacts/ContactsFlow.tsx`, change the `paste` member:

```ts
type Route =
  | { name: "list" }
  | { name: "detail"; contactId: string }
  | { name: "add" }
  | { name: "verify"; contactId: string }
  | { name: "scan" }
  | { name: "paste"; prefillKey?: string }
  | { name: "import-soon" };
```

- [ ] **Step 2: Pass `onResult` from the scanner to the paste route**

Replace the `scan` case:

```ts
    case "scan":
      return (
        <QRScanScreen
          onBack={goList}
          onPaste={() => setRoute({ name: "paste" })}
          onResult={(key) => setRoute({ name: "paste", prefillKey: key })}
        />
      );
```

- [ ] **Step 3: Forward `prefillKey` into PasteKeyScreen**

Replace the `paste` case:

```ts
    case "paste":
      return (
        <PasteKeyScreen
          onBack={goList}
          initialKey={route.name === "paste" ? route.prefillKey : undefined}
          onAdded={async (id) => {
            await reload();
            setRoute({ name: "detail", contactId: id });
          }}
        />
      );
```

> Note: inside the `case "paste":` block `route` is already narrowed to the paste member, so `route.prefillKey` is directly accessible — the `route.name === "paste"` guard above is belt-and-suspenders for the narrowing; if your TypeScript version narrows cleanly you may write `initialKey={route.prefillKey}`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/contacts/ContactsFlow.tsx
git commit -m "feat(mobile): route scanned key into the name-and-add flow"
```

---

## Task 5: Rewrite QRScanScreen with a real camera

**Files:**
- Modify (full rewrite): `apps/mobile/src/contacts/QRScanScreen.tsx`

- [ ] **Step 1: Replace the file with the live-camera implementation**

Overwrite `apps/mobile/src/contacts/QRScanScreen.tsx` with:

```tsx
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/src/components";
import { bracketGeometry, CORNERS, type Corner } from "@/src/contacts/qr-viewfinder";
import { isAcceptableScan, normalizeScannedPayload } from "@/src/contacts/scanned-key";
import { colors } from "@/src/theme";

// 37 · QR Scan (grp-contacts.jsx · S_QRScan).
//
// A full-bleed dark scanning surface: a custom white-on-dark top bar (back + flashlight toggle),
// a centered viewfinder framed by four primary-colored corner brackets, the prompt, and a
// "Paste instead" pill. Now backed by a real expo-camera CameraView. On an acceptable scan it
// calls onResult(key); ContactsFlow routes that to the paste screen (key prefilled) for naming.
// The authoritative key validation still happens there (importPublicKey), exactly like a paste.
//
// This screen does NOT use the kit's Screen/AppBar containers: it owns a full-screen dark camera
// canvas with its own white foreground.

const ON_DARK = "#ffffff";
const SURFACE_DARK = "#16141b";

// Ignore repeat decodes of the same junk code for this long after showing the error banner.
const INVALID_COOLDOWN_MS = 2000;

export interface QRScanScreenProps {
  /** Leave the scanner (back chevron). */
  onBack: () => void;
  /** Switch to the clipboard / paste-public-key flow ("Paste instead"). */
  onPaste: () => void;
  /** Called once with a decoded payload that looks like an aesmsg public key. */
  onResult?: (payload: string) => void;
}

// One corner bracket. Geometry comes from the pure bracketGeometry() helper (tested in
// qr-viewfinder.test.ts); this maps it onto an RN <View>'s border styles.
function CornerBracket({ corner }: { corner: Corner }) {
  const { top, bottom, left, right } = bracketGeometry(corner);
  return (
    <View
      style={[
        styles.bracket,
        top ? styles.bracketTop : styles.bracketBottom,
        left ? styles.bracketLeft : styles.bracketRight,
        {
          borderTopWidth: top ? 3 : 0,
          borderBottomWidth: bottom ? 3 : 0,
          borderLeftWidth: left ? 3 : 0,
          borderRightWidth: right ? 3 : 0,
          borderTopLeftRadius: corner === "tl" ? 12 : 0,
          borderTopRightRadius: corner === "tr" ? 12 : 0,
          borderBottomLeftRadius: corner === "bl" ? 12 : 0,
          borderBottomRightRadius: corner === "br" ? 12 : 0,
        },
      ]}
    />
  );
}

// Top bar shared by every state. `onTorch` omitted ⇒ the flashlight slot is disabled (denied state).
function TopBar({
  onBack,
  torch,
  onTorch,
}: {
  onBack: () => void;
  torch?: boolean;
  onTorch?: () => void;
}) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onBack}
        style={styles.barSlot}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
      >
        <Icon name="arrow_back_ios_new" size={18} color={ON_DARK} />
      </Pressable>

      <Text style={styles.barTitle} numberOfLines={1}>
        Scan public key
      </Text>

      <Pressable
        onPress={onTorch}
        disabled={!onTorch}
        style={styles.barSlot}
        accessibilityRole="button"
        accessibilityLabel="Flashlight"
        accessibilityState={{ disabled: !onTorch, selected: !!torch }}
        hitSlop={8}
      >
        {/* Only `flashlight_on` is in the icon map; convey the on/off state via color
            (violet primary when lit) rather than a second glyph. */}
        <Icon name="flashlight_on" size={22} color={torch ? colors.primary : ON_DARK} />
      </Pressable>
    </View>
  );
}

function PastePill({ onPaste }: { onPaste: () => void }) {
  return (
    <View style={styles.footer}>
      <Pressable
        onPress={onPaste}
        style={styles.pastePill}
        accessibilityRole="button"
        accessibilityLabel="Paste instead"
      >
        <Text style={styles.pasteText}>Paste instead</Text>
      </Pressable>
    </View>
  );
}

export function QRScanScreen({ onBack, onPaste, onResult }: QRScanScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [mountFailed, setMountFailed] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Auto-request exactly once on first mount when the status is still undetermined. The ref guard
  // prevents a re-request loop on platforms where a denial can leave canAskAgain true.
  const requested = useRef(false);
  useEffect(() => {
    if (!requested.current && permission?.status === "undetermined" && permission.canAskAgain) {
      requested.current = true;
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Scan de-duplication: lock after the first acceptable scan; throttle the invalid banner.
  const handled = useRef(false);
  const cooldownUntil = useRef(0);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  function handleScan(result: { data: string }) {
    if (handled.current) return;
    const key = normalizeScannedPayload(result.data);
    if (isAcceptableScan(key)) {
      handled.current = true; // fire onResult once; navigation away happens next
      onResult?.(key);
      return;
    }
    const now = Date.now();
    if (now < cooldownUntil.current) return;
    cooldownUntil.current = now + INVALID_COOLDOWN_MS;
    setBanner("That's not an aesmsg public key");
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), INVALID_COOLDOWN_MS);
  }

  // ── Denied / unavailable: rationale + Open Settings + Paste instead. ───────────────────────
  if (mountFailed || permission?.status === "denied") {
    return (
      <View style={styles.root}>
        <TopBar onBack={onBack} />
        <View style={styles.center}>
          <Icon name="photo_camera" size={40} color={ON_DARK} />
          <Text style={styles.deniedTitle}>Camera access needed</Text>
          <Text style={styles.deniedBody}>
            Allow camera access to scan a contact's QR code. You can also paste their key instead.
          </Text>
          <Pressable
            onPress={() => Linking.openSettings()}
            style={styles.settingsBtn}
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
          >
            <Text style={styles.settingsText}>Open Settings</Text>
          </Pressable>
        </View>
        <PastePill onPaste={onPaste} />
      </View>
    );
  }

  // ── Undetermined / loading: neutral canvas while the OS prompt resolves. ───────────────────
  if (!permission || permission.status === "undetermined") {
    return (
      <View style={styles.root}>
        <TopBar onBack={onBack} />
        <View style={styles.center}>
          <Text style={styles.prompt}>Requesting camera access…</Text>
        </View>
        <PastePill onPaste={onPaste} />
      </View>
    );
  }

  // ── Granted: live camera with the viewfinder overlay. ──────────────────────────────────────
  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleScan}
        onMountError={() => setMountFailed(true)}
      />

      <TopBar onBack={onBack} torch={torch} onTorch={() => setTorch((t) => !t)} />

      <View style={styles.center}>
        <View
          style={styles.viewfinder}
          accessibilityRole="image"
          accessibilityLabel="Camera viewfinder"
        >
          {CORNERS.map((corner) => (
            <CornerBracket key={corner} corner={corner} />
          ))}
        </View>
        <Text style={styles.prompt}>Point at a aesmsg QR code</Text>
        {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      </View>

      <PastePill onPaste={onPaste} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DARK },

  bar: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    marginTop: 50,
  },
  barSlot: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  barTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: ON_DARK,
    fontSize: 17,
    fontWeight: "600",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 32 },
  viewfinder: { width: 220, height: 220, borderRadius: 16 },
  bracket: { position: "absolute", width: 34, height: 34, borderColor: colors.primary },
  bracketTop: { top: 0 },
  bracketBottom: { bottom: 0 },
  bracketLeft: { left: 0 },
  bracketRight: { right: 0 },
  prompt: { color: "rgba(255,255,255,0.8)", fontSize: 14, textAlign: "center" },
  banner: {
    color: ON_DARK,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    overflow: "hidden",
  },

  deniedTitle: { color: ON_DARK, fontSize: 18, fontWeight: "600", textAlign: "center" },
  deniedBody: { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 21, textAlign: "center" },
  settingsBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  settingsText: { color: ON_DARK, fontSize: 14, fontWeight: "600" },

  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 40, alignItems: "center" },
  pastePill: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  pasteText: { color: ON_DARK, fontSize: 14, fontWeight: "500" },
});
```

> Icon names (verified present in `apps/mobile/src/components/icon-map.ts`): `arrow_back_ios_new`, `flashlight_on`, `photo_camera`. Note `flashlight_off` is **not** mapped — that is why the torch button always renders `flashlight_on` and signals state via color (above). Do not introduce `flashlight_off` unless you also add it to the icon map.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS. (`stripeOffsets` is no longer imported here — it is removed from the helper in Task 6; until then it is simply unused, which is fine.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS, or auto-fixable formatting only — run `pnpm lint:fix` if Biome reports format-only diffs, then re-run.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/contacts/QRScanScreen.tsx
git commit -m "feat(mobile): real camera QR scanning with permission and error states"
```

---

## Task 6: Remove the dead stripeOffsets helper

**Files:**
- Modify: `apps/mobile/src/contacts/qr-viewfinder.ts` (remove `stripeOffsets`)
- Modify: `apps/mobile/tests/qr-viewfinder.test.ts` (remove its cases)

- [ ] **Step 1: Confirm `stripeOffsets` has no remaining callers**

Run: `grep -rn "stripeOffsets" apps/mobile/src apps/mobile/tests`
Expected: matches only in `qr-viewfinder.ts` (definition) and `qr-viewfinder.test.ts` (its tests) — the screen no longer imports it after Task 5. If any other caller appears, STOP and reassess (do not remove it).

- [ ] **Step 2: Remove the `stripeOffsets` export from the helper**

In `apps/mobile/src/contacts/qr-viewfinder.ts`, delete the `stripeOffsets` function and any constants used only by it. Keep `bracketGeometry`, `CORNERS`, and the `Corner` type (still used by `QRScanScreen`).

- [ ] **Step 3: Remove the `stripeOffsets` cases from the test**

In `apps/mobile/tests/qr-viewfinder.test.ts`, delete the `describe`/`it` block(s) that exercise `stripeOffsets` and remove `stripeOffsets` from the import. Leave the `bracketGeometry` / `CORNERS` cases intact.

- [ ] **Step 4: Run the viewfinder test**

Run: `pnpm --filter @aesmsg/mobile test qr-viewfinder`
Expected: PASS (remaining `bracketGeometry`/`CORNERS` cases pass; no reference errors).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (no dangling `stripeOffsets` reference anywhere).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/contacts/qr-viewfinder.ts apps/mobile/tests/qr-viewfinder.test.ts
git commit -m "refactor(mobile): drop dead stripeOffsets faux-preview helper"
```

---

## Task 7: Full gates + native rebuild + on-simulator verification

**Files:** none (verification only)

- [ ] **Step 1: Run all automated gates from the repo root**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all PASS. The new `scanned-key.test.ts` and the trimmed `qr-viewfinder.test.ts` are green; nothing else regressed.

- [ ] **Step 2: Clean native rebuild (required — native dependency added)**

A new native module (`expo-camera`) was added, so a Metro reload is insufficient. Rebuild from scratch following the project's documented iOS build recipe (Expo SDK 56 + Xcode 26.5 needs the `pod install` SDKROOT/LIBRARY_PATH workaround — see the `project_mobile_ios_build` memory note). High level:

```bash
cd apps/mobile
npx expo prebuild --clean
# then the recipe's pod install workaround, then:
npx expo run:ios   # or: pnpm --filter @aesmsg/mobile ios
```

Expected: the dev build launches on the simulator/device. (This step needs a real build host; if running headless, hand off to the user to run it interactively — e.g. `! npx expo run:ios`.)

- [ ] **Step 3: Manual verification checklist (on device/simulator)**

Confirm each:
- Contacts → Add contact → **Scan QR code** opens a **live camera preview** (no diagonal stripes), with the OS camera-permission prompt on first run.
- Point at the QR from another device's **My public key** screen (`MyPublicKeyScreen`) → lands on the **Paste public key** screen with the key **prefilled**; type a name → **Add contact** → contact detail.
- Point at a non-aesmsg QR (any URL) → brief "That's not an aesmsg public key" banner; camera stays live.
- Deny camera permission → "Camera access needed" + **Open Settings** (opens OS settings) + **Paste instead** (routes to paste screen).
- Flashlight button toggles the torch when permission is granted.

- [ ] **Step 4: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix(mobile): QR scanner adjustments from on-device verification"
```

---

## Notes for the implementer

- **Package filter name:** the mobile workspace is `@aesmsg/mobile` (confirmed in `apps/mobile/package.json`); all `pnpm --filter @aesmsg/mobile …` commands above use it. From the repo root, `pnpm typecheck` / `pnpm lint` / `pnpm test` run every workspace.
- **No RN renderer in tests:** per the `apps/mobile` convention, do NOT add a React-renderer test for `QRScanScreen`. Its behavior is covered by the pure `scanned-key` test plus manual on-device verification.
- **Crypto untouched:** this plan adds no crypto and changes no wire format. Validation reuses `importPublicKey` exactly as the paste flow does.
