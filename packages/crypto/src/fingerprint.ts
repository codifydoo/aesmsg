import type { Fingerprint, PublicKeyString } from "./types";
import { bytesToUpperHex, decodePubkey } from "./wire";

const FINGERPRINT_BYTES = 16;
const FINGERPRINT_PREFIX = "AM-";
const HEX_GROUP_SIZE = 4;
const HEX_GROUP_COUNT = 8;

export async function fingerprint(pk: PublicKeyString): Promise<Fingerprint> {
  const { canonical } = decodePubkey(pk);
  const buf = new ArrayBuffer(canonical.byteLength);
  new Uint8Array(buf).set(canonical);
  const digestAb = await crypto.subtle.digest("SHA-256", buf);
  const digest = new Uint8Array(digestAb).slice(0, FINGERPRINT_BYTES);
  const hex = bytesToUpperHex(digest);
  const groups: string[] = [];
  for (let i = 0; i < HEX_GROUP_COUNT; i++) {
    groups.push(hex.slice(i * HEX_GROUP_SIZE, (i + 1) * HEX_GROUP_SIZE));
  }
  return (FINGERPRINT_PREFIX + groups.join("-")) as Fingerprint;
}

export function truncateFingerprint(fp: Fingerprint, groups: number): string {
  if (groups < 1 || groups > HEX_GROUP_COUNT) {
    throw new Error(`truncateFingerprint: groups must be 1..${HEX_GROUP_COUNT}, got ${groups}`);
  }
  const body = (fp as string).slice(FINGERPRINT_PREFIX.length).replace(/-/g, "");
  const out: string[] = [];
  for (let i = 0; i < groups; i++) {
    out.push(body.slice(i * HEX_GROUP_SIZE, (i + 1) * HEX_GROUP_SIZE));
  }
  return out.join(" ");
}

export function compareFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  const aStr = a as string;
  const bStr = b as string;
  if (aStr.length !== bStr.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aStr.length; i++) {
    diff |= aStr.charCodeAt(i) ^ bStr.charCodeAt(i);
  }
  return diff === 0;
}
