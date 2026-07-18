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
  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    },
    [],
  );

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
        <Text style={styles.prompt}>Point at an aesmsg QR code</Text>
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

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: 32,
  },
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
