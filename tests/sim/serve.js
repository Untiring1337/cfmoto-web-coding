// Serves the files in site/ to the browser through Playwright routing, the way production serves them:
// correct MIME types, the HTTP headers from site/_headers on every response, and 404.html for a missing page.
// A scenario can choose the origin (for example the production origin) and a base path (the GitHub Pages
// preview serves the site under /cfmoto-web-coding/). Every other request is aborted, so no test reaches the network.
'use strict';
const fs = require('fs');
const path = require('path');

const ORIGIN = 'http://localhost:8799';
const SITE = path.resolve(__dirname, '..', '..', 'site');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

// site/_headers: one block per URL pattern ("/*" only, today), indented "Name: value" lines below it.
function readHeaders() {
  const file = path.join(SITE, '_headers');
  const out = {};
  if (!fs.existsSync(file)) return out;
  let active = false;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { active = raw.trim() === '/*'; continue; }
    if (!active) continue;
    const i = raw.indexOf(':');
    if (i > 0) out[raw.slice(0, i).trim().toLowerCase()] = raw.slice(i + 1).trim();
  }
  return out;
}

function resolveFile(urlPath, basePath) {
  let p = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  if (!p.startsWith(basePath)) return null;
  p = '/' + p.slice(basePath.length);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(SITE, '.' + p);
  if (!file.startsWith(SITE + path.sep)) return null;                    // never serve outside site/
  if (path.basename(file) === '_headers') return null;                    // configuration, not an asset
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

async function serveSite(context, { origin = ORIGIN, basePath = '/' } = {}) {
  const headers = readHeaders();
  await context.route('**/*', route => route.abort());                    // added first, so it is the fallback
  await context.route(origin + '/**', route => {
    const file = resolveFile(new URL(route.request().url()).pathname, basePath);
    if (!file) {
      const nf = path.join(SITE, '404.html');
      return route.fulfill({ status: 404, headers: { ...headers, 'content-type': MIME['.html'] }, body: fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found' });
    }
    return route.fulfill({ status: 200, headers: { ...headers, 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }, body: fs.readFileSync(file) });
  });
}

module.exports = { ORIGIN, SITE, serveSite, readHeaders };
