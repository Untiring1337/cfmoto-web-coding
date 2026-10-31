#!/usr/bin/env node
// Prints the ID of the Worker version that production runs now (100 % of the traffic), from
// `wrangler deployments status --json`. Prints nothing if the Worker was never deployed.
// Fails if the request fails, or if production runs more than one version (a gradual deployment).
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Run from the repository root.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

let out;
try {
  out = execFileSync(process.execPath, [wrangler, 'deployments', 'status', '--json'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
} catch (e) {
  const text = String(e.stdout || '') + String(e.stderr || '');
  // Cloudflare API error 10007: the Worker does not exist yet (first deploy).
  if (/\b10007\b|does not exist/i.test(text)) process.exit(0);
  console.error(text.trim() || e.message);
  process.exit(1);
}

let status = JSON.parse(out.slice(out.search(/[[{]/)));
if (Array.isArray(status)) status = status[0];
const versions = (status && status.versions) || [];
if (versions.length !== 1 || versions[0].percentage !== 100) {
  console.error('Production does not run exactly one version at 100 %: ' + JSON.stringify(versions));
  process.exit(1);
}
console.log(versions[0].version_id);
