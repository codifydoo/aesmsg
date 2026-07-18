import {
  Aes256Gcm,
  CipherSuite,
  DhkemX25519HkdfSha256,
  HkdfSha256,
  type KemInterface,
} from "@hpke/core";
import { NobleDhkemX25519HkdfSha256 } from "./kem-noble";

// The HPKE suite is built once and memoized. The KEM is selected by capability: web/Node have a
// Web Crypto SubtleCrypto that supports the X25519 group operation, so they keep the fast native
// DhkemX25519HkdfSha256. React Native / Hermes (via react-native-quick-crypto) ships a
// SubtleCrypto with X25519 commented out, so there we transparently fall back to a pure-JS
// noble-backed KEM that produces an identical HPKE wire format. KDF (HKDF-SHA256) and AEAD
// (AES-256-GCM) are supported on every target, so only the KEM varies.

export type KemBackend = "native" | "noble";

type ResolvedSuite = { suite: CipherSuite; backend: KemBackend };

let cachedSuitePromise: Promise<ResolvedSuite> | null = null;
// Test-only override; when set, getSuite() builds that backend instead of probing capabilities.
let forcedBackend: KemBackend | null = null;

async function supportsNativeX25519(): Promise<boolean> {
  try {
    if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
      return false;
    }
    // X25519 keys are for key agreement, so the usages MUST be a non-empty subset of
    // ["deriveKey", "deriveBits"]. Probing with an empty usages array throws a spec-mandated
    // SyntaxError on EVERY compliant runtime — including ones that fully support X25519 — which
    // silently forced the pure-JS noble fallback everywhere. "deriveBits" is the usage the KEM's
    // DH step actually needs, so it is the correct capability to probe.
    await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    return true;
  } catch {
    return false;
  }
}

function buildSuite(kem: KemInterface): CipherSuite {
  return new CipherSuite({
    kem,
    kdf: new HkdfSha256(),
    aead: new Aes256Gcm(),
  });
}

async function resolveBackend(): Promise<KemBackend> {
  if (forcedBackend !== null) {
    return forcedBackend;
  }
  return (await supportsNativeX25519()) ? "native" : "noble";
}

function kemForBackend(backend: KemBackend): KemInterface {
  return backend === "native" ? new DhkemX25519HkdfSha256() : new NobleDhkemX25519HkdfSha256();
}

async function resolveSuite(): Promise<ResolvedSuite> {
  const backend = await resolveBackend();
  return { suite: buildSuite(kemForBackend(backend)), backend };
}

function getResolvedSuite(): Promise<ResolvedSuite> {
  if (cachedSuitePromise === null) {
    cachedSuitePromise = resolveSuite();
  }
  return cachedSuitePromise;
}

async function getSuite(): Promise<CipherSuite> {
  return (await getResolvedSuite()).suite;
}

/**
 * Reports which KEM backend the (memoized) HPKE suite resolved to — "native" for the Web Crypto
 * X25519 primitive used on web/Node, "noble" for the pure-JS @noble/curves fallback used on
 * Hermes. Reflects exactly what getSuite() built, so it observes both the capability probe and any
 * test-only override. Primarily a diagnostic / test hook; safe to call in production.
 */
export async function getActiveKemBackend(): Promise<KemBackend> {
  return (await getResolvedSuite()).backend;
}

// SEC-5: these overrides mutate module-global singleton state (forcedBackend + the memoized suite)
// that would flip the WHOLE app to the pure-JS noble KEM. They are pulled into the production bundle
// via seal.ts, so gate them behind NODE_ENV === "test" (like test-only.ts) — outside test they must
// be inert (throw) so no code sharing the module realm can silently downgrade the KEM backend.
function assertTestEnv(fn: string): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(`${fn}: test-only helper`);
  }
}

/**
 * Test-only: force the KEM backend ("native" | "noble") and clear the memoized suite so the
 * next getSuite() rebuilds with that backend. Node has both native X25519 and WebAssembly, so
 * this is the only way to exercise the noble path under test. Not exported from the package
 * barrel — tests import it directly from this module. Throws unless NODE_ENV === "test".
 */
export function __setKemBackendForTests(backend: KemBackend): void {
  assertTestEnv("__setKemBackendForTests");
  forcedBackend = backend;
  cachedSuitePromise = null;
}

/**
 * Test-only: restore capability-based backend selection and clear the memoized suite. Throws
 * unless NODE_ENV === "test".
 */
export function __resetKemBackendForTests(): void {
  assertTestEnv("__resetKemBackendForTests");
  forcedBackend = null;
  cachedSuitePromise = null;
}

export type RawKeypair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export async function generateRawKeypair(): Promise<RawKeypair> {
  const suite = await getSuite();
  const kp = await suite.kem.generateKeyPair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

export async function exportRawPublicKey(publicKey: CryptoKey): Promise<Uint8Array> {
  const suite = await getSuite();
  const ab = await suite.kem.serializePublicKey(publicKey);
  return new Uint8Array(ab);
}

export async function exportRawPrivateKey(privateKey: CryptoKey): Promise<Uint8Array> {
  const suite = await getSuite();
  const ab = await suite.kem.serializePrivateKey(privateKey);
  return new Uint8Array(ab);
}

export async function importRawPublicKey(rawBytes: Uint8Array): Promise<CryptoKey> {
  const suite = await getSuite();
  return suite.kem.deserializePublicKey(rawBytes);
}

export async function importRawPrivateKey(rawBytes: Uint8Array): Promise<CryptoKey> {
  const suite = await getSuite();
  return suite.kem.deserializePrivateKey(rawBytes);
}

export async function deriveKeypairFromIkm(ikm: Uint8Array): Promise<RawKeypair> {
  const suite = await getSuite();
  const kp = await suite.kem.deriveKeyPair(ikm);
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

export async function sealHpke(
  recipientPubKey: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<{ enc: Uint8Array; aeadOutput: Uint8Array }> {
  const suite = await getSuite();
  const senderCtx = await suite.createSenderContext({
    recipientPublicKey: recipientPubKey,
  });
  const aeadOutputAb = await senderCtx.seal(plaintext, aad);
  return {
    enc: new Uint8Array(senderCtx.enc),
    aeadOutput: new Uint8Array(aeadOutputAb),
  };
}

export async function openHpke(
  recipientPrivKey: CryptoKey,
  enc: Uint8Array,
  aeadOutput: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const suite = await getSuite();
  const recipientCtx = await suite.createRecipientContext({
    recipientKey: recipientPrivKey,
    enc,
  });
  const ab = await recipientCtx.open(aeadOutput, aad);
  return new Uint8Array(ab);
}
