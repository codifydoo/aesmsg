// Self-installing Web Crypto bootstrap. Import this for its SIDE EFFECT ONLY
// (`import "@/src/crypto/install"`) as the very first line of the app entry.
//
// WHY A SEPARATE MODULE INSTEAD OF A STATEMENT IN index.ts:
// ES module imports are hoisted and fully evaluated (depth-first, in source
// order) BEFORE any statement body in the importing module runs. So writing
//
//     import { installWebCrypto } from "...";
//     installWebCrypto();          // <-- a STATEMENT, runs AFTER all imports
//     import { App } from "@/App"; // <-- evaluates App's whole subtree first
//
// does NOT install crypto before App's transitive imports evaluate. `@/App`
// pulls in @aesmsg/crypto -> @noble/hashes -> @noble/hashes/crypto, and
// that module does `crypto = ('crypto' in globalThis) ? globalThis.crypto : undefined`
// at EVAL TIME, freezing `undefined` on Hermes (no global crypto yet). Every
// later noble randomBytes() (X25519 keygen in generateIdentity, salt in
// wrapPrivateKey) then throws "crypto.getRandomValues must be defined".
//
// Moving the install into this module's TOP-LEVEL side effect means a bare
// `import "@/src/crypto/install"` placed before `import { App }` is guaranteed
// by the module-eval order to run installWebCrypto() before App's subtree —
// and before noble captures globalThis.crypto.
//
// CRITICAL: this module (and webcrypto-polyfill.ts) must NOT transitively import
// @aesmsg/crypto / @noble/* — that would re-trigger the eval-time capture
// before the install runs. webcrypto-polyfill.ts only pulls in
// expo-standard-web-crypto + react-native-quick-crypto; keep it that way.
import { installWebCrypto } from "@/src/crypto/webcrypto-polyfill";

installWebCrypto();
