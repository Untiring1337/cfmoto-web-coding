#!/usr/bin/env node
// Test runner for the browser simulations.
//   node tests/run.js                    run all suites, compare with the golden snapshots
//   node tests/run.js --update-golden    run all suites and rewrite the golden snapshots
//   node tests/run.js --grep <regex>     run only scenarios whose name matches
//   node tests/run.js --jobs <n>         number of scenarios that run at the same time (default 4)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { runScenario } = require('./sim/harness');

const SUITES = [
  { key: 'coder', scenarios: require('./coder/scenarios'), mockPath: path.join(__dirname, 'sim', 'coder-mock.js'), pagePath: '/index.html' },
];

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const UPDATE = args.includes('--update-golden');
const GREP = opt('--grep') ? new RegExp(opt('--grep')) : null;
const JOBS = Number(opt('--jobs') ?? '4');
if (!Number.isInteger(JOBS) || JOBS < 1) { console.error('--jobs needs a whole number of 1 or more'); process.exit(2); }

function slug(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'scenario';
}

// Report the first difference between two snapshots in a readable way.
function firstDiff(a, b, where = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = firstDiff(a[i], b[i], where + '[' + i + ']'); if (d) return d;
    }
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], where + '.' + k); if (d) return d;
    }
  }
  return where + '\n      expected: ' + JSON.stringify(a) + '\n      actual:   ' + JSON.stringify(b);
}

(async () => {
  const browser = await chromium.launch();
  const jobs = [];
  for (const suite of SUITES) {
    const seen = {};
    for (const sc of suite.scenarios) {
      let s = slug(sc[0]); seen[s] = (seen[s] || 0) + 1; if (seen[s] > 1) s += '-' + seen[s];
      if (GREP && !GREP.test(sc[0])) continue;
      jobs.push({ suite, sc, file: path.join(__dirname, 'golden', suite.key, s + '.json') });
    }
  }
  if (!jobs.length) { console.error('No scenario matches the selection.'); process.exit(1); }
  let fail = 0, next = 0, done = 0;
  const results = new Array(jobs.length);
  async function worker() {
    while (next < jobs.length) {
      const i = next++, j = jobs[i];
      const r = await runScenario(browser, j.sc, j.suite);
      let goldenMsg = '';
      if (r.ok && r.snap) {
        if (UPDATE) {
          fs.mkdirSync(path.dirname(j.file), { recursive: true });
          fs.writeFileSync(j.file, JSON.stringify(r.snap, null, 1) + '\n');
        } else if (!fs.existsSync(j.file)) {
          goldenMsg = 'no golden snapshot (run with --update-golden to create it)';
        } else {
          const d = firstDiff(JSON.parse(fs.readFileSync(j.file, 'utf8')), r.snap, 'snapshot');
          if (d) goldenMsg = 'differs from the golden snapshot at ' + d;
        }
      }
      results[i] = { r, goldenMsg, suite: j.suite.key }; done++;
      const okAll = r.ok && !goldenMsg;
      if (!okAll) fail++;
      console.log((okAll ? 'PASS ' : 'FAIL ') + '[' + j.suite.key + '] ' + r.name +
        (r.ok ? '' : '\n   ' + r.msg + '\n   --- log (last 25 lines) ---\n' + r.log.split('\n').slice(-25).join('\n')) +
        (goldenMsg ? '\n   GOLDEN: ' + goldenMsg : ''));
    }
  }
  await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length || 1) }, worker));
  await browser.close();
  if (done !== jobs.length) { console.error('Only ' + done + ' of ' + jobs.length + ' scenarios ran.'); fail = fail || 1; }
  // In a full run, every golden file must belong to a scenario. --update-golden removes files that do not.
  if (!GREP) {
    const wanted = new Set(jobs.map(j => j.file));
    for (const suite of SUITES) {
      const dir = path.join(__dirname, 'golden', suite.key);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        const file = path.join(dir, f);
        if (wanted.has(file)) continue;
        if (UPDATE) { fs.unlinkSync(file); console.log('Removed unused golden snapshot ' + path.relative(__dirname, file)); }
        else { console.log('FAIL golden snapshot without a scenario: ' + path.relative(__dirname, file)); fail++; }
      }
    }
  }
  console.log((fail ? fail + ' FAILED' : 'ALL PASSED') + ' (' + done + ' of ' + jobs.length + ' scenarios ran' + (UPDATE ? ', golden snapshots updated' : '') + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
