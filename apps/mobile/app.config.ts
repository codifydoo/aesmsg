import type { ExpoConfig } from "expo/config";

// aesmsg host the universal/app links resolve to. The mobile app intercepts
// https://<host>/l/:id; if the app isn't installed the link opens the web INSTALL page
// (the static bouncer), not a web reader.
const AESMSG_HOST = process.env.AESMSG_HOST ?? "aesmsg.com";

// The API base URL the app talks to — the standalone Fastify service. Override with
// AESMSG_API_BASE_URL for a local dev build (e.g. http://localhost:4000).
const AESMSG_API_BASE_URL = process.env.AESMSG_API_BASE_URL ?? "https://api.aesmsg.com";

// iOS App Transport Security blocks cleartext http by default. When the app is pointed at a
// cleartext http:// API (a local dev server), allow local networking so the dev build can reach
// it — derived from the URL so there is nothing to hand-edit. A release build uses https, so this
// exception is never enabled in production.
const allowsLocalNetworking = AESMSG_API_BASE_URL.startsWith("http://");

const config: ExpoConfig = {
  name: "aesmsg",
  slug: "aesmsg",
  scheme: "aesmsg",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  // OTA is disabled for this app: any module touching crypto or key material must
  // never be hot-swapped without app-store review (see README.md "OTA policy").
  updates: { enabled: false },
  runtimeVersion: { policy: "appVersion" },
  ios: {
    bundleIdentifier: "com.aesmsg.app",
    supportsTablet: false,
    associatedDomains: [`applinks:${AESMSG_HOST}`],
    infoPlist: {
      // Standard AES-256-GCM + X25519/HPKE, used solely for the app's own secure
      // messaging → qualifies for the US encryption export exemption. `false` means
      // App Store Connect / TestFlight will not block the build on the export-compliance
      // question and no per-build compliance docs are required. (If distributing from the
      // US, confirm with legal — an annual BIS self-classification report may still apply.)
      ITSAppUsesNonExemptEncryption: false,
      // Cleartext-http dev API only: allow local networking for that one build. A release
      // build uses https, so AESMSG_API_BASE_URL never starts with http:// and this stays
      // off in production — nothing to hand-edit.
      ...(allowsLocalNetworking
        ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }
        : {}),
    },
  },
  android: {
    package: "com.aesmsg.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#141218",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: AESMSG_HOST, pathPrefix: "/l/" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
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
        // QR-only scanner: explicitly opt OUT of the microphone. The plugin defaults
        // recordAudioAndroid to true, which would add RECORD_AUDIO to the Android manifest —
        // unacceptable for a zero-knowledge product that never records audio.
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
    [
      "expo-image-picker",
      {
        photosPermission:
          "aesmsg attaches a photo only after encrypting it on this device. Photos are never uploaded in the clear.",
        cameraPermission:
          "aesmsg attaches a photo only after encrypting it on this device. Photos are never uploaded in the clear.",
      },
    ],
    // In-app purchases (StoreKit 2 / Play Billing) for aesmsg Pro. Talks directly to the stores —
    // no third-party billing service. The plugin adds the Android BILLING permission + iOS StoreKit.
    "expo-iap",
    // Native date/time picker for the Pro-only custom expiry.
    "@react-native-community/datetimepicker",
    // Wires the local StoreKit config (storekit/aesmsg.storekit) into the generated iOS
    // scheme on prebuild, so simulator IAP testing works without the manual Edit-Scheme step.
    "./plugins/withStoreKitConfig",
  ],
  extra: {
    aesmsgApiBaseUrl: AESMSG_API_BASE_URL,
    // The origin used to build shareable /l/:id links. This MUST be the web/universal-link host
    // (the same AESMSG_HOST the app claims in associatedDomains/intentFilters above), NOT the API
    // base URL — otherwise minted links point at api.aesmsg.com and the app won't intercept them.
    aesmsgLinkOrigin: `https://${AESMSG_HOST}`,
    // EAS Build binds this project via `extra.eas.projectId` (printed by `eas init`).
    // If the project lives under an Expo organization, also set a config-root
    // `owner: "<org-slug>"` so CI/non-interactive builds resolve it — optional for
    // interactive builds by the owning account. See apps/mobile/README.md.
    eas: { projectId: "4922b7b9-46f4-4ff6-87ef-0abd75920fd3" },
  },
};

export default config;
