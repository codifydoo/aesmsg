// Installs the Web Crypto surface (`globalThis.crypto` with `getRandomValues` + `subtle`)
// that @aesmsg/crypto and @hpke/core require. Hermes ships none of it, so this MUST be
// imported as the very first statement in the app entry, before any crypto-touching module.
//
// ⚠️ GATING RISK (plan Task 1): @hpke/core needs DHKEM(X25519) via `crypto.subtle`. Whether
// the chosen native backend exposes X25519 must be proven by the spike. If it does not, the
// fallback is a pure-JS X25519/HKDF/AES-GCM path inside @aesmsg/crypto (guarded by the
// RFC 9180 interop fixture, no wire-format change) — NOT a hack in this file.

import { polyfillWebCrypto } from "expo-standard-web-crypto";
import { install as installQuickCrypto } from "react-native-quick-crypto";

let installed = false;

export function installWebCrypto(): void {
  if (installed) return;
  // QuickCrypto (JSI-backed) provides crypto.subtle + getRandomValues.
  installQuickCrypto();
  // Belt-and-suspenders: ensure a spec-compliant getRandomValues exists even if a
  // backend only partially populates globalThis.crypto.
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    polyfillWebCrypto();
  }
  if (typeof globalThis.crypto?.subtle === "undefined") {
    throw new Error(
      "Web Crypto `subtle` is unavailable after polyfill install — crypto core cannot run on this device.",
    );
  }
  installed = true;
}
