#!/usr/bin/env node
// Checks the files in site/ and the server responses for them. Run from the repository root:
//   node tests/site-check.mjs static       file checks: one production origin everywhere, relative URLs only
//   node tests/site-check.mjs local        serve site/ with `wrangler dev` (Cloudflare's own asset server) and check
//                                          the responses: files, status codes and the exact headers from site/_headers
//   node tests/site-check.mjs production   the same response checks against the production origin, retried for up
//                                          to SITE_CHECK_RETRY_SECONDS (default 180), until the new version is live
//   node tests/site-check.mjs live         the production origin serves the released tool (any version); checked
//                                          before a preview deploy replaces the page at the address of the first release
// production and live take an optional second argument: another base URL to check (for example a wrangler dev server).
// No dependencies other than wrangler (root package.json, local mode only).
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const { readHeaders } = createRequire(import.meta.url)('./sim/serve.js');
// Cloudflare's default for static assets: the browser must check for a newer version on every load.
const CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const BUILD_MARKER = '<!--BUILD-->local<!--/BUILD-->';

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REQUEST_TIMEOUT_MS = 15000;
const get = (url, headers = {}) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate', 'cache-control': 'no-cache', ...headers } });

function productionOrigin() {
  const m = /var PRODUCTION_ORIGIN = "([^"]+)";/.exec(read('site/index.html'));
  if (!m) throw new Error('site/index.html: PRODUCTION_ORIGIN not found');
  const u = new URL(m[1]);
  if (u.protocol !== 'https:' || u.origin !== m[1]) throw new Error('PRODUCTION_ORIGIN must be an https origin without a path or a trailing slash: ' + m[1]);
  return m[1];
}

function staticChecks() {
  const errors = [];
  const prod = productionOrigin();
  if (/your-subdomain/.test(prod)) errors.push('PRODUCTION_ORIGIN is still the placeholder: ' + prod);
  const html = fs.readdirSync(SITE).filter(f => f.endsWith('.html'));
  const files = [...html.map(f => 'site/' + f), 'README.md', 'CONTRIBUTING.md'];
  for (const f of files) {
    const text = read(f);
    // The production origin is in many files; all of them must name the same origin (it must never change, because
    // browser storage, and with it the saved original F010 value, is kept per origin).
    for (const [u] of text.matchAll(/https:\/\/[a-z0-9.-]+\.workers\.dev/gi)) {
      if (u !== prod) errors.push(f + ': ' + u + ' is not the production origin ' + prod);
    }
    if (f.startsWith('site/')) {
      // The preview serves the site below /openmoto-diag/, production at /. Root-relative URLs break one of them.
      for (const [m] of text.matchAll(/\b(?:src|href|action|poster)\s*=\s*["']?\/[^"'\s>]*|url\(\s*["']?\/[^)]*\)/gi)) errors.push(f + ': root-relative URL ' + m);
    }
  }
  const index = read('site/index.html');
  if (!index.includes(`<link rel="canonical" href="${prod}/">`)) errors.push('site/index.html: the canonical link must be ' + prod + '/');
  if (index.split(BUILD_MARKER).length !== 2) errors.push('site/index.html: the build marker ' + BUILD_MARKER + ' must occur exactly once');
  if (!read('site/404.html').includes(`href="${prod}/"`)) errors.push('site/404.html: the link must be ' + prod + '/');
  if (!read('README.md').includes(prod)) errors.push('README.md: the production origin ' + prod + ' is missing');
  const headers = readHeaders();
  for (const h of ['content-security-policy', 'permissions-policy', 'referrer-policy', 'x-content-type-options', 'cross-origin-opener-policy']) {
    if (!headers[h]) errors.push('site/_headers: ' + h + ' is missing from the /* block');
  }
  return errors;
}

// One pass of the response checks. Returns a list of problems (empty: all checks passed).
async function responseChecks(base) {
  const errors = [];
  const want = readHeaders();
  const expect = async (p, status, file) => {
    const r = await get(base + p);
    const body = Buffer.from(await r.arrayBuffer());
    if (r.status !== status) errors.push(`${p}: status ${r.status}, expected ${status}`);
    if (file && sha256(body) !== sha256(fs.readFileSync(path.join(SITE, file)))) errors.push(`${p}: the body is not site/${file}`);
    if (!/^text\/html\b/.test(r.headers.get('content-type') || '')) errors.push(`${p}: content-type ${r.headers.get('content-type')}`);
    for (const [k, v] of Object.entries(want)) if (r.headers.get(k) !== v) errors.push(`${p}: ${k} is ${JSON.stringify(r.headers.get(k))}, expected ${JSON.stringify(v)}`);
    if (r.headers.get('cache-control') !== CACHE_CONTROL) errors.push(`${p}: cache-control is ${JSON.stringify(r.headers.get('cache-control'))}, expected ${JSON.stringify(CACHE_CONTROL)}`);
  };
  try {
    await expect('/', 200, 'index.html');
    await expect('/this-page-does-not-exist', 404, '404.html');
    await expect('/_headers', 404, '404.html');            // configuration, never served as a file
  } catch (e) { errors.push('request failed: ' + (e.cause?.message || e.message)); }
  return errors;
}

// The production origin serves a released version of the tool (not necessarily the version in this checkout).
async function liveChecks(base) {
  try {
    const r = await get(base + '/');
    const body = await r.text();
    if (r.status !== 200) return [`${base}/: status ${r.status}, expected 200`];
    if (!body.includes(`var PRODUCTION_ORIGIN = "${productionOrigin()}";`)) return [`${base}/: the response is not the released tool`];
    return [];
  } catch (e) { return ['request failed: ' + (e.cause?.message || e.message)]; }
}

async function untilPassing(base, seconds, checks = responseChecks) {
  const deadline = Date.now() + seconds * 1000;
  for (let attempt = 1; ; attempt++) {
    const errors = await checks(base);
    if (!errors.length) { console.log(`${base}: all checks passed (attempt ${attempt}).`); return []; }
    if (Date.now() >= deadline) return errors;
    console.log(`${base}: attempt ${attempt} not passed yet (${errors[0]}). Trying again in 10 s.`);
    await sleep(10000);
  }
}

const freePort = () => new Promise((res, rej) => {
  const s = createServer(); s.unref(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});

async function localChecks() {
  const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!fs.existsSync(wrangler)) return ['wrangler is not installed. Run npm ci in the repository root.'];
  const [port, inspector] = [await freePort(), await freePort()];
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [wrangler, 'dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector),
    '--show-interactive-dev-session=false', '--log-level', 'warn'], { cwd: ROOT, detached: true, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  let exited = false; child.on('exit', () => { exited = true; });
  try {
    for (let t0 = Date.now(); ; await sleep(500)) {
      if (exited) return ['wrangler dev stopped before it served the site'];
      if (Date.now() - t0 > 90000) return ['wrangler dev did not serve the site within 90 s'];
      try { await fetch(base + '/'); break; } catch { /* not listening yet */ }
    }
    return await untilPassing(base, 0);
  } finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ }
  }
}

const mode = process.argv[2];
const run = {
  static: staticChecks,
  local: localChecks,
  production: () => untilPassing(process.argv[3] || productionOrigin(), Number(process.env.SITE_CHECK_RETRY_SECONDS ?? 180)),
  live: () => untilPassing(process.argv[3] || productionOrigin(), Number(process.env.SITE_CHECK_RETRY_SECONDS ?? 30), liveChecks),
}[mode];
if (!run) { console.error('Usage: node tests/site-check.mjs static|local|production|live'); process.exit(2); }
let errors;
try { errors = await run(); } catch (e) { errors = [e.message]; }
for (const e of errors) console.log((process.env.GITHUB_ACTIONS ? '::error::' : 'ERROR ') + e);
console.log(errors.length ? `${mode}: ${errors.length} problem(s).` : `${mode}: all checks passed.`);
process.exit(errors.length ? 1 : 0);
