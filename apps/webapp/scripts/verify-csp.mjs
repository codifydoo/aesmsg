// Runtime CSP verifier for the static export.
//
// `inject-csp.mjs` proves the meta CSP structurally covers every inline script. This script proves
// it BEHAVIORALLY: it serves `out/` over a throwaway localhost server, loads every exported page in
// headless Chromium (via the Playwright already installed for Vitest browser mode), and fails if any
// page emits a `securitypolicyviolation` event or an uncaught page error. It is intentionally NOT
// part of `pnpm test` because it needs a prior `pnpm --filter @aesmsg/webapp build`.
//
// Usage: pnpm --filter @aesmsg/webapp build && pnpm --filter @aesmsg/webapp check:csp

import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(scriptDir, "..", "out");

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

function walkHtml(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

function startStaticServer(root) {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        let filePath = resolve(root, `.${pathname}`);
        // Contain within root.
        if (filePath !== root && !filePath.startsWith(`${root}/`)) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        let stat = null;
        try {
          stat = statSync(filePath);
        } catch {
          stat = null;
        }
        if (stat?.isDirectory()) {
          filePath = join(filePath, "index.html");
          try {
            stat = statSync(filePath);
          } catch {
            stat = null;
          }
        }
        if (stat === null) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, {
          "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
        });
        res.end(readFileSync(filePath));
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

async function main() {
  let outStat;
  try {
    outStat = statSync(OUT_DIR);
  } catch {
    throw new Error(`check:csp: export dir not found at ${OUT_DIR}. Run \`next build\` first.`);
  }
  if (!outStat.isDirectory()) throw new Error(`check:csp: ${OUT_DIR} is not a directory.`);

  const files = walkHtml(OUT_DIR);
  if (files.length === 0) throw new Error(`check:csp: no .html files under ${OUT_DIR}.`);

  const server = await startStaticServer(OUT_DIR);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });

  const failures = [];
  try {
    for (const file of files) {
      const rel = file.slice(OUT_DIR.length).replace(/\\/g, "/"); // e.g. "/new.html"
      const url = base + rel;
      const page = await browser.newPage();
      const violations = [];
      const pageErrors = [];

      await page.exposeFunction("__reportCspViolation", (detail) => violations.push(detail));
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          // Reported to Node via the exposed binding.
          window.__reportCspViolation({
            effectiveDirective: e.effectiveDirective || e.violatedDirective,
            blockedURI: e.blockedURI,
            sourceFile: e.sourceFile,
            lineNumber: e.lineNumber,
          });
        });
      });
      page.on("pageerror", (err) => pageErrors.push(err.message));

      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      } catch (err) {
        pageErrors.push(`navigation failed: ${String(err)}`);
      }
      // Settle: allow client-side redirects + any async violation events to flush.
      await page.waitForTimeout(400);

      if (violations.length > 0 || pageErrors.length > 0) {
        failures.push({ rel, violations, pageErrors });
        console.log(`check:csp: FAIL ${rel}`);
      } else {
        console.log(`check:csp: ok   ${rel}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  if (failures.length > 0) {
    console.error(
      `\ncheck:csp: ${failures.length} page(s) reported CSP violations or page errors:`,
    );
    for (const f of failures) {
      console.error(`  ${f.rel}`);
      for (const v of f.violations) {
        console.error(
          `    violation: ${v.effectiveDirective} blocked ${v.blockedURI} (${v.sourceFile}:${v.lineNumber})`,
        );
      }
      for (const e of f.pageErrors) console.error(`    pageerror: ${e}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `\ncheck:csp: OK — ${files.length} page(s) loaded with no CSP violations or page errors.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
