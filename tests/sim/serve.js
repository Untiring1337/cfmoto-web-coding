// Serves the repository files to the browser under http://localhost:8799/ through Playwright routing,
// so the pages load exactly as GitHub Pages serves them (relative paths, correct MIME types), without a server.
'use strict';
const fs = require('fs');
const path = require('path');

const ORIGIN = 'http://localhost:8799';
const ROOT = path.resolve(__dirname, '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;      // never serve outside the repo
  if (file.split(path.sep).includes('node_modules')) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

async function serveRepo(page) {
  await page.route(ORIGIN + '/**', route => {
    const file = resolveFile(new URL(route.request().url()).pathname);
    if (!file) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
}

module.exports = { ORIGIN, ROOT, serveRepo };
