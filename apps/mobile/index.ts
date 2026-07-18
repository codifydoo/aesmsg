// The Web Crypto polyfill MUST run before anything imports @aesmsg/crypto.
// This is a BARE SIDE-EFFECT import that self-installs at module-eval time, and it
// MUST stay ordered first. ES module imports are hoisted and fully evaluated before
// any statement body runs, so a post-import `installWebCrypto()` *statement* would
// execute AFTER `import { App }` has already evaluated App's transitive crypto subtree
// (@aesmsg/crypto -> @noble/hashes/crypto), which captures `globalThis.crypto` at
// eval time and freezes `undefined` on Hermes. See src/crypto/install.ts for the full
// rationale. Do NOT "simplify" this back into an import + statement.
import "@/src/crypto/install";

import { registerRootComponent } from "expo";
import { App } from "@/App";

registerRootComponent(App);
