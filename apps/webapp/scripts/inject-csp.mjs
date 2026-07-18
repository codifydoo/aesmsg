// Post-build CSP injector for the static export (`output: 'export'`).
//
// A static export has no server runtime, so `next.config` `headers()` is inert and there
// is no nonce pipeline. Next still emits first-party inline <script> tags (the runtime
// bootstrap + per-page `self.__next_f.push(...)` RSC flight data). To keep `script-src`
// strict — no `'unsafe-inline'` — this step runs after `next build` and, for every
// exported out/**/*.html:
//
//   1. sha256-hashes each inline <script> body (the exact bytes the browser will hash),
//   2. injects a per-page <meta http-equiv="Content-Security-Policy"> at the very top of
//      <head> (before any script) whose script-src is `'self' 'wasm-unsafe-eval'` + those
//      per-page hashes,
//   3. asserts every inline script on the page is covered by a hash (fails the build if not).
//
// `'wasm-unsafe-eval'` is required because @aesmsg/crypto runs Argon2id via WebAssembly.
// `frame-ancestors` is header-only (ignored in <meta>) and is documented in docs/deploy.md.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(scriptDir, "..", "out");
const API_ORIGIN = process.env.NEXT_PUBLIC_AESMSG_API_ORIGIN ?? "https://api.aesmsg.com";

// Each <script ...>...</script>. Group 1 = attributes, group 2 = body.
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const HEAD_OPEN_RE = /<head\b[^>]*>/i;
const EXISTING_CSP_META_RE = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi;

function walkHtml(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

// Bodies of inline scripts (those without a `src` attribute). External scripts are
// same-origin `/_next/...` and are covered by `'self'`.
function inlineScriptBodies(html) {
  const bodies = [];
  for (const match of html.matchAll(SCRIPT_RE)) {
    const attrs = match[1] ?? "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    bodies.push(match[2] ?? "");
  }
  return bodies;
}

function sha256Source(body) {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}

function buildCsp(hashes) {
  const scriptSrc = ["'self'", "'wasm-unsafe-eval'", ...hashes].join(" ");
  return [
    "default-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${API_ORIGIN}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

const META_CSP_RE = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/i;

// From-disk verification of what we actually wrote — deliberately NOT re-using the in-memory `csp`
// string. Re-reads the final file, re-extracts EVERY inline script body fresh, recomputes their
// hashes, and asserts each is present in that page's meta CSP and that the meta precedes the first
// <script>. This can genuinely fail (bad write, malformed meta, mis-ordered head) rather than
// re-hashing the same bytes we injected.
function verifyInjectedFile(file) {
  const finalHtml = readFileSync(file, "utf8");

  const metaMatch = finalHtml.match(META_CSP_RE);
  if (metaMatch === null) {
    throw new Error(`CSP verify: no CSP <meta> present in ${file} after injection.`);
  }
  const metaCsp = metaMatch[1];

  const bodies = inlineScriptBodies(finalHtml);
  for (const body of bodies) {
    const src = sha256Source(body);
    if (!metaCsp.includes(src)) {
      throw new Error(
        `CSP verify: inline script in ${file} is not covered by the injected meta CSP (${src}).`,
      );
    }
  }

  // The meta must precede the first <script> in document order — otherwise the browser may parse
  // and act on scripts before the policy is installed.
  const metaIdx = finalHtml.indexOf(metaMatch[0]);
  const firstScriptIdx = finalHtml.search(/<script\b/i);
  if (firstScriptIdx !== -1 && metaIdx > firstScriptIdx) {
    throw new Error(`CSP verify: CSP <meta> does not precede the first <script> in ${file}.`);
  }

  return bodies.length;
}

function main() {
  let outStat;
  try {
    outStat = statSync(OUT_DIR);
  } catch {
    throw new Error(`CSP injection: export dir not found at ${OUT_DIR}. Run \`next build\` first.`);
  }
  if (!outStat.isDirectory()) {
    throw new Error(`CSP injection: ${OUT_DIR} is not a directory.`);
  }

  const files = walkHtml(OUT_DIR);
  if (files.length === 0) {
    throw new Error(`CSP injection: no .html files under ${OUT_DIR}.`);
  }

  for (const file of files) {
    let html = readFileSync(file, "utf8");
    // Idempotent: drop any CSP meta from a previous run before re-injecting.
    html = html.replace(EXISTING_CSP_META_RE, "");

    const bodies = inlineScriptBodies(html);
    const hashes = [...new Set(bodies.map(sha256Source))];
    const csp = buildCsp(hashes);
    const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}"/>`;

    if (!HEAD_OPEN_RE.test(html)) {
      throw new Error(`CSP injection: no <head> found in ${file}.`);
    }
    html = html.replace(HEAD_OPEN_RE, (headTag) => `${headTag}${meta}`);

    writeFileSync(file, html);

    // Verify against the bytes on disk (fresh re-read + re-parse), not the in-memory values above.
    const verifiedCount = verifyInjectedFile(file);
    const rel = file.slice(OUT_DIR.length + 1);
    console.log(
      `csp: ${rel} — ${verifiedCount} inline script(s), ${hashes.length} hash(es), verified from disk`,
    );
  }

  console.log(
    `csp: injected per-page Content-Security-Policy into ${files.length} page(s) (connect-src api origin: ${API_ORIGIN}).`,
  );
}

main();
