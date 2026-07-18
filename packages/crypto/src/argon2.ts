// Argon2id key-derivation backend selection. wrap.ts derives the AES-256-GCM wrap key from the
// user's passphrase with Argon2id (RFC 9106). The default implementation is hash-wasm, which is
// fast (WebAssembly) on web and Node. React Native / Hermes has no WebAssembly, so there we fall
// back to the pure-JS @noble/hashes Argon2id. For identical parameters (password, salt, m_kib,
// t, p, hashLength) both implement RFC 9106 and produce byte-identical output, so the
// "argon2id-aes256gcm" envelope is unchanged and wraps cross-decrypt between backends.
import { argon2id as nobleArgon2id } from "@noble/hashes/argon2";
import { argon2id as wasmArgon2id } from "hash-wasm";

type Argon2Backend = "wasm" | "noble";

// Test-only override; null means capability-based selection.
let forcedBackend: Argon2Backend | null = null;

function hasWebAssembly(): boolean {
  return typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
}

function selectBackend(): Argon2Backend {
  if (forcedBackend !== null) {
    return forcedBackend;
  }
  return hasWebAssembly() ? "wasm" : "noble";
}

/**
 * Derive `hashLength` bytes with Argon2id. Both backends are passed the same logical inputs:
 * - hash-wasm UTF-8 encodes the password string internally.
 * - @noble/hashes takes raw bytes, so we UTF-8 encode the password to match exactly.
 */
export async function deriveArgon2id(
  passphrase: string,
  salt: Uint8Array,
  mKib: number,
  t: number,
  p: number,
  hashLength: number,
): Promise<Uint8Array> {
  // Parallelism other than 1 is unsupported by the pure-JS (@noble/hashes) path used on Hermes, and
  // cross-backend byte-agreement is only ever tested at p=1. A p≠1 request would silently derive a
  // DIFFERENT key on the noble backend than on hash-wasm, so a mobile-wrapped envelope could become
  // undecryptable on web (or vice versa). Fail loudly instead of mis-deriving.
  if (p !== 1) {
    throw new Error(`deriveArgon2id: parallelism (p) must be 1, got ${p}`);
  }
  if (selectBackend() === "noble") {
    return nobleArgon2id(new TextEncoder().encode(passphrase), salt, {
      t,
      m: mKib,
      p,
      dkLen: hashLength,
    });
  }
  return wasmArgon2id({
    password: passphrase,
    salt,
    parallelism: p,
    iterations: t,
    memorySize: mKib,
    hashLength,
    outputType: "binary",
  });
}

// SEC-5: this override mutates module-global singleton state that would flip the WHOLE app to the
// pure-JS backend. It is pulled into the production bundle via wrap.ts, so gate it behind
// NODE_ENV === "test" (like test-only.ts) — outside test it must be inert (throw) so no code sharing
// the module realm can silently downgrade the KDF backend.
function assertTestEnv(fn: string): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(`${fn}: test-only helper`);
  }
}

/**
 * Test-only: force the Argon2id backend ("wasm" | "noble"). Node has WebAssembly, so forcing
 * "noble" is the only way to exercise the Hermes path under test. Not exported from the package
 * barrel — tests import it directly from this module. Throws unless NODE_ENV === "test".
 */
export function __setArgon2BackendForTests(backend: Argon2Backend): void {
  assertTestEnv("__setArgon2BackendForTests");
  forcedBackend = backend;
}

/** Test-only: restore capability-based Argon2id backend selection. Throws unless NODE_ENV === "test". */
export function __resetArgon2BackendForTests(): void {
  assertTestEnv("__resetArgon2BackendForTests");
  forcedBackend = null;
}
