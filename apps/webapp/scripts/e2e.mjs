// True cross-process end-to-end for the messaging web client (spec §10).
//
// It exercises the WHOLE journey in a real Chromium against a real, separately-booted apps/api:
//
//   seal → link → open → decrypt → revoke → gone
//
// with TWO isolated browser contexts — R (recipient) and S (sender) — over real HTTP + real CORS,
// so nothing is mocked. It builds on the serve-out pattern of scripts/verify-csp.mjs (the same
// bundled Playwright, a throwaway localhost static server) and extends it with the documented
// `/l/<id>` host rewrite (docs/deploy.md) so the reader renders from `location.pathname` exactly as
// production does.
//
// WHY ITS OWN BUILD: `NEXT_PUBLIC_AESMSG_API_ORIGIN` is baked at build time into BOTH the API client
// and the CSP `connect-src` (scripts/inject-csp.mjs). A normal build points those at
// https://api.aesmsg.com, whose CSP would block the local test API. So the harness rebuilds `out/`
// with the origin pointed at the locally-booted API — without weakening the CSP injector itself
// (the meta stays strict; only the allowed origin differs). On a clean PASS the harness DELETES
// `out/` in teardown: it is baked to a throwaway localhost API origin, so shipping it would wire the
// client to a dead API. This DIVERGES from check:csp (which leaves `out/` in place); the fix is the
// documented "rebuild before deploy" step — a subsequent normal `build` restores the shipping
// origin. On failure `out/` is left in place for debugging.
//
// Deliberately excluded from `pnpm test` (needs a full production build + a booted API + a real
// browser). Run explicitly: `pnpm --filter @aesmsg/webapp test:e2e`.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const WEBAPP_DIR = resolve(scriptDir, "..");
const REPO_ROOT = resolve(WEBAPP_DIR, "..", "..");
const OUT_DIR = resolve(WEBAPP_DIR, "out");
const API_DIR = resolve(REPO_ROOT, "apps", "api");
const TSX_BIN = resolve(API_DIR, "node_modules", ".bin", "tsx");

// Generous but bounded: Argon2id (m=64 MiB) unlocks/wraps take ~1s each and this flow does several,
// so UI waits get a wide ceiling while every one stays explicitly bounded (no open-ended hangs).
const KDF_TIMEOUT = 60_000;
const NAV_TIMEOUT = 30_000;
const BUILD_TIMEOUT = 300_000;

// Two distinct strong wrap passphrases (>= 12 chars, mixed classes, no keyboard runs → acceptable).
const R_PASSPHRASE = "Zafira-Nimbus-Quartz-88!";
const S_PASSPHRASE = "Kestrel-Vortex-Marble-77!";
// A unique secret so the decrypted-plaintext assertion is exact.
const MESSAGE = "The staging DB password is hunter2-Zephyr-Quartz. Rotate it after use.";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json; charset=utf-8",
};

// The reader shell rewrite (mirrors the nginx block in docs/deploy.md): `/l` and `/l/<16-char id>`
// both serve the same static l.html WITHOUT changing the URL, so the client reads the id from
// location.pathname. `/l.txt`, `/links`, etc. do NOT match and fall through to normal resolution.
const LINK_REWRITE_RE = /^\/l(?:\/[A-Za-z0-9_-]{16})?\/?$/;

let stepN = 0;
function step(msg) {
  stepN += 1;
  console.log(`\n[e2e] ${String(stepN).padStart(2, "0")} — ${msg}`);
}
function log(msg) {
  console.log(`[e2e]    ${msg}`);
}
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`[e2e]    ok: ${msg}`);
}

// Reserve-then-release: bind to :0, read the assigned port, close. There is an inherent TOCTOU
// window between this close and the eventual bind (build bake → API listen); if something grabs the
// port meanwhile the failure is loud, not silent — the API's listen throws EADDRINUSE and the
// health poll times out (`waitForHealth`), aborting the run.
function getFreePort() {
  return new Promise((res, rej) => {
    const srv = createNetServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Static-file resolution mirroring the documented production host: the `/l/<id>` rewrite first, then
// nginx's `try_files $uri $uri.html $uri/` for the Next static export (docs/superpowers static-export
// guide). Returns an absolute file path or null (404).
function resolveStaticFile(root, pathname) {
  if (LINK_REWRITE_RE.test(pathname)) return join(root, "l.html");

  let clean = pathname;
  if (clean.length > 1 && clean.endsWith("/")) clean = clean.slice(0, -1);
  const base = resolve(root, `.${clean}`);
  // Containment: never serve outside out/.
  if (base !== root && !base.startsWith(`${root}/`)) return null;

  if (clean === "/") return isFile(join(root, "index.html")) ? join(root, "index.html") : null;
  if (isFile(base)) return base; // $uri
  if (isFile(`${base}.html`)) return `${base}.html`; // $uri.html
  if (isDir(base) && isFile(join(base, "index.html"))) return join(base, "index.html"); // $uri/
  return null;
}

function startStaticServer(root, { debug = false } = {}) {
  return new Promise((res) => {
    const server = createServer((req, reply) => {
      let pathname = "/";
      try {
        pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      } catch {
        reply.writeHead(400);
        reply.end("bad request");
        return;
      }
      const filePath = resolveStaticFile(root, pathname);
      if (filePath === null) {
        if (debug) log(`static 404 ${pathname}`);
        reply.writeHead(404);
        reply.end("not found");
        return;
      }
      reply.writeHead(200, {
        "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
      });
      reply.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => res(server));
  });
}

function runToCompletion(cmd, args, opts) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, opts);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rej(new Error(`command timed out: ${cmd} ${args.join(" ")}`));
    }, opts.timeout ?? BUILD_TIMEOUT);
    child.on("error", rej);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) res();
      else rej(new Error(`command failed (exit ${code}): ${cmd} ${args.join(" ")}`));
    });
  });
}

// Boot apps/api as a CHILD PROCESS (true cross-process) via its own tsx, on a spare port, with the
// env forced to the in-memory stores. No Postgres/Redis, no boot guard (NODE_ENV != production),
// and DATABASE_URL/REDIS_URL emptied so a future apps/api/.env can never pull the harness onto a DB.
function startApiChild({ port, webappOrigin }) {
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    // CORS single-origin allowlist → the served webapp origin, so the browser's cross-origin
    // POST /open + POST /messages pass. (Also settable via the buildServer webappOrigin option.)
    AESMSG_WEBAPP_ORIGIN: webappOrigin,
    // Force in-memory stores regardless of any future .env (index.ts won't override a set value).
    DATABASE_URL: "",
    REDIS_URL: "",
  };
  // Leave AESMSG_PUBLIC_LINK_ORIGIN unset → default https://aesmsg.com; the test navigates to the
  // served origin's /l/<id> directly, so the minted link's host is irrelevant to the reader path.
  delete env.AESMSG_PUBLIC_LINK_ORIGIN;

  const child = spawn(TSX_BIN, ["src/index.ts"], {
    cwd: API_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group → clean group kill on teardown
  });
  const logs = [];
  const capture = (buf) => {
    for (const line of buf.toString().split("\n")) if (line.trim()) logs.push(line);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return { child, logs };
}

async function waitForHealth(apiOrigin, timeoutMs = NAV_TIMEOUT) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "no attempt";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiOrigin}/api/health`);
      if (res.ok) {
        const body = await res.json();
        if (body?.status === "ok") return;
      }
      lastErr = `status ${res.status}`;
    } catch (err) {
      lastErr = String(err);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`apps/api did not become healthy at ${apiOrigin}: ${lastErr}`);
}

// ── UI helpers (shared by both contexts) ──────────────────────────────────────────

async function createIdentity(page, webOrigin, passphrase) {
  await page.goto(`${webOrigin}/onboarding`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Create your identity" })
    .waitFor({ timeout: NAV_TIMEOUT });
  const pwFields = page.locator('input[type="password"]');
  await pwFields.nth(0).fill(passphrase);
  await pwFields.nth(1).fill(passphrase);
  // Argon2id wrap runs on submit; land on /identity when done.
  await page.getByRole("button", { name: "Create identity" }).click();
  await page.getByRole("heading", { name: "Digital identity" }).waitFor({ timeout: KDF_TIMEOUT });
}

// Read the amk1: public key straight from the identity screen DOM (the FingerprintBlock value node).
async function readPublicKey(page) {
  await page.getByText("Public key", { exact: true }).waitFor({ timeout: NAV_TIMEOUT });
  const key = await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("div"))) {
      const t = el.textContent?.trim() ?? "";
      if (t.startsWith("amk1:") && el.childElementCount === 0) return t;
    }
    return null;
  });
  if (!key) throw new Error("could not read amk1: public key from the identity screen");
  return key;
}

async function tapOpenAndUnlock(page, passphrase) {
  await page.getByRole("button", { name: "Open message" }).click();
  // Fresh navigation → identity is locked → inline unlock in-context (no redirect).
  await page
    .getByRole("heading", { name: "Unlock to open this message" })
    .waitFor({ timeout: NAV_TIMEOUT });
  await page.locator('input[type="password"]').fill(passphrase);
  await page.getByRole("button", { name: "Unlock" }).click();
}

// ── Shared teardown (idempotent) — reused by the finally block AND the signal handlers ────────────
// The handles are module-scoped so a SIGINT/SIGTERM mid-run can still reach them.
let staticServer = null;
let apiHandle = null;
let browser = null;
let teardownDone = false;

async function teardown() {
  if (teardownDone) return;
  teardownDone = true;
  if (browser) await browser.close().catch(() => {});
  if (staticServer) {
    staticServer.closeAllConnections?.(); // drop keep-alive sockets so close() can't hang
    await new Promise((r) => staticServer.close(r));
  }
  if (apiHandle?.child?.pid) {
    try {
      process.kill(-apiHandle.child.pid, "SIGKILL"); // kill the whole detached process GROUP
    } catch {
      try {
        apiHandle.child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

// A Ctrl-C or a `kill` must not orphan the detached API group, the static server, or the browser.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.once(sig, () => {
    console.error(`\n[e2e] received ${sig} — tearing down`);
    teardown().finally(() => process.exit(1));
  });
}

async function main() {
  if (!existsSync(TSX_BIN)) {
    throw new Error(`tsx binary not found at ${TSX_BIN} (run pnpm install)`);
  }
  const debug = process.env.E2E_DEBUG === "1";

  // 1. Reserve the API port BEFORE building (it is baked into the build's CSP + client).
  step("Reserve a spare port for the local API");
  const apiPort = await getFreePort();
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  log(`API origin (baked into the build): ${apiOrigin}`);

  // 2. Build the static export pointed at the local API origin (own build — CSP unchanged, only the
  //    allowed connect-src origin differs). Runs `next build && node scripts/inject-csp.mjs`.
  step("Build the static export with NEXT_PUBLIC_AESMSG_API_ORIGIN → local API");
  await runToCompletion("pnpm", ["run", "build"], {
    cwd: WEBAPP_DIR,
    env: { ...process.env, NEXT_PUBLIC_AESMSG_API_ORIGIN: apiOrigin },
    stdio: "inherit",
    timeout: BUILD_TIMEOUT,
  });
  if (!isDir(OUT_DIR)) throw new Error(`build produced no out/ at ${OUT_DIR}`);

  let passed = false;
  try {
    // 3. Serve out/ with the /l/<id> rewrite.
    step("Serve out/ on a throwaway localhost port (with the /l/<id> rewrite)");
    staticServer = await startStaticServer(OUT_DIR, { debug });
    const webPort = staticServer.address().port;
    const webOrigin = `http://127.0.0.1:${webPort}`;
    log(`webapp served at: ${webOrigin}`);

    // 4. Boot apps/api (child process, memory stores, CORS → webOrigin).
    step("Boot apps/api as a child process (in-memory stores, CORS → served origin)");
    apiHandle = startApiChild({ port: apiPort, webappOrigin: webOrigin });
    apiHandle.child.on("exit", (code) => {
      if (code !== null && code !== 0) log(`[api] exited early with code ${code}`);
    });
    await waitForHealth(apiOrigin);
    log(`apps/api healthy at ${apiOrigin} (memory stores)`);

    // 5. Drive the journey.
    step("Launch headless Chromium");
    browser = await chromium.launch({ headless: true });

    // ── Context R: recipient identity ──────────────────────────────────────────────
    step("Context R (recipient): create identity + capture the amk1: public key");
    const ctxR = await browser.newContext();
    ctxR.setDefaultTimeout(KDF_TIMEOUT);
    const rPage = await ctxR.newPage();
    await createIdentity(rPage, webOrigin, R_PASSPHRASE);
    const recipientPublicKey = await readPublicKey(rPage);
    assert(recipientPublicKey.startsWith("amk1:"), "recipient public key is an amk1: string");
    log(`recipient public key: ${recipientPublicKey.slice(0, 24)}…`);

    // ── Context S: sender seals to R's key ─────────────────────────────────────────
    step("Context S (sender): create identity, compose to R's key, seal + create link");
    const ctxS = await browser.newContext();
    ctxS.setDefaultTimeout(KDF_TIMEOUT);
    const sPage = await ctxS.newPage();
    await createIdentity(sPage, webOrigin, S_PASSPHRASE);

    // Client-side nav (keeps the in-memory unlocked key alive across the RequireUnlocked gate).
    await sPage.getByRole("link", { name: "New Message" }).first().click();
    await sPage.getByRole("heading", { name: "New message" }).waitFor({ timeout: NAV_TIMEOUT });

    await sPage.getByRole("textbox", { name: "Recipient public key" }).fill(recipientPublicKey);
    // Derived fingerprint appears once the pasted key validates locally.
    await sPage.getByText("Valid key").first().waitFor({ timeout: NAV_TIMEOUT });
    const shownFingerprint = await sPage.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll("span"))) {
        const t = el.textContent?.trim() ?? "";
        if (t.startsWith("AM-") && el.childElementCount === 0) return t;
      }
      return null;
    });
    assert(!!shownFingerprint, "derived AM- fingerprint is shown for the pasted recipient key");

    await sPage.locator("#message").fill(MESSAGE);
    await sPage.getByRole("button", { name: "1 hour" }).click(); // expiry preset
    await sPage.getByRole("button", { name: "3 views" }).click(); // max opens 3

    const createBtn = sPage.getByRole("button", { name: "Encrypt & create link" });
    await createBtn.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    await createBtn.click();

    await sPage.getByRole("heading", { name: "Link created" }).waitFor({ timeout: KDF_TIMEOUT });
    const linkUrl = (await sPage.locator("code").first().innerText()).trim();
    const idMatch = linkUrl.match(/\/l\/([A-Za-z0-9_-]{16})\/?$/);
    assert(!!idMatch, `link-created screen shows a well-formed /l/<id> link (${linkUrl})`);
    const linkId = idMatch[1];
    log(`link id: ${linkId}`);

    // ── Context R: open the link — zero network before tap, then decrypt ───────────
    step("Context R: open /l/<id> (rewrite path) — assert ZERO API calls before tap, then decrypt");
    const apiHits = [];
    rPage.on("request", (req) => {
      if (req.url().startsWith(apiOrigin)) apiHits.push(`${req.method()} ${req.url()}`);
    });
    await rPage.goto(`${webOrigin}/l/${linkId}`, { waitUntil: "domcontentloaded" });
    await rPage.getByRole("heading", { name: "Secure message" }).waitFor({ timeout: NAV_TIMEOUT });
    await rPage.getByRole("button", { name: "Open message" }).waitFor({ timeout: NAV_TIMEOUT });
    await rPage.waitForLoadState("networkidle");

    assert(
      rPage.url().endsWith(`/l/${linkId}`),
      "the rewrite kept the browser URL at /l/<id> (no redirect, no ?id=)",
    );
    assert(
      apiHits.length === 0,
      `zero requests to the API origin before the explicit tap (saw: ${JSON.stringify(apiHits)})`,
    );

    await tapOpenAndUnlock(rPage, R_PASSPHRASE);

    // Secure reader with the exact plaintext.
    await rPage
      .getByText("Decrypted on this device")
      .first()
      .waitFor({ state: "visible", timeout: KDF_TIMEOUT });
    await rPage.getByText(MESSAGE).first().waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    const exactShown = await rPage.evaluate(
      (msg) =>
        Array.from(document.querySelectorAll("*")).some(
          (el) => el.childElementCount === 0 && el.textContent === msg,
        ),
      MESSAGE,
    );
    assert(exactShown, "decrypted plaintext renders exactly, character-for-character");

    // The WHOLE journey must hit the API exactly once — the single POST /open. Asserting the total
    // count (not just that an /open exists) guards against any stray metadata GET.
    assert(
      apiHits.length === 1 &&
        apiHits[0].startsWith("POST") &&
        apiHits[0].includes(`/api/messages/${linkId}/open`),
      `exactly one API request fired — the POST /open, no stray metadata GET (saw: ${JSON.stringify(apiHits)})`,
    );

    // ── Context S: revoke ──────────────────────────────────────────────────────────
    step("Context S: open the link in Links and revoke it (confirm dialog)");
    await sPage.getByRole("link", { name: "View in Links" }).click();
    await sPage.getByRole("heading", { name: "Secure Links" }).waitFor({ timeout: NAV_TIMEOUT });
    await sPage.getByRole("link", { name: "Open link details" }).first().click();
    // Revoke section button → confirm dialog → confirm.
    await sPage.getByRole("button", { name: "Revoke link" }).first().click();
    const dialog = sPage.getByRole("dialog");
    await dialog
      .getByRole("heading", { name: "Revoke this link?" })
      .waitFor({ timeout: NAV_TIMEOUT });
    await dialog.getByRole("button", { name: "Revoke link" }).click();
    // Success flips the section button to a disabled "Revoked".
    await sPage.getByRole("button", { name: "Revoked" }).waitFor({ timeout: NAV_TIMEOUT });
    log("link revoked (ciphertext purged server-side)");

    // ── Context R (fresh page): re-open → opaque unavailable ───────────────────────
    step("Context R (fresh page): re-open /l/<id> → opaque 'no longer available', nothing more");
    const rPage2 = await ctxR.newPage();
    rPage2.setDefaultTimeout(KDF_TIMEOUT);
    await rPage2.goto(`${webOrigin}/l/${linkId}`, { waitUntil: "domcontentloaded" });
    await rPage2.getByRole("button", { name: "Open message" }).waitFor({ timeout: NAV_TIMEOUT });
    await tapOpenAndUnlock(rPage2, R_PASSPHRASE);
    await rPage2
      .getByText("This secure link is no longer available.")
      .first()
      .waitFor({ state: "visible", timeout: KDF_TIMEOUT });

    const goneBody = await rPage2.evaluate(() => document.body.innerText);
    assert(
      goneBody.includes("This secure link is no longer available."),
      "the opaque unavailable copy is shown",
    );
    assert(!goneBody.includes(linkId), "the unavailable terminal does not leak the link id");
    assert(
      !/revoked|expired|opened|remaining|view\s*count|max\s*opens/i.test(goneBody),
      "the unavailable terminal leaks no revoked/expired/opened/count metadata",
    );

    step("ALL ASSERTIONS PASSED — seal → link → open → decrypt → revoke → gone");
    console.log("\n[e2e] PASS");
    passed = true;
  } catch (err) {
    console.error("\n[e2e] FAIL");
    console.error(err?.stack ?? String(err));
    if (apiHandle?.logs?.length) {
      console.error("\n[e2e] --- last apps/api output (for debugging) ---");
      for (const line of apiHandle.logs.slice(-40)) console.error(`[api] ${line}`);
    }
    process.exitCode = 1;
  } finally {
    // Teardown: browser, static server, then the API process GROUP (detached spawn).
    await teardown();
    // On a clean PASS, delete out/ — it is baked to the throwaway local API origin (see the header
    // comment); a normal `pnpm --filter @aesmsg/webapp build` restores the shipping origin before
    // deploy. On failure out/ is left in place for debugging.
    if (passed) rmSync(OUT_DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exitCode = 1;
});
