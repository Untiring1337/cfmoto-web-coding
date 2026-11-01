// Runs one scenario in an isolated browser context: serves site/ (see sim/serve.js), installs the mock, opens the
// page, gives the scenario a small helper API, and records a snapshot of everything the user and the adapter see.
'use strict';
const path = require('path');
const { PRODUCTION_ORIGIN, serveSite } = require('./serve');

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

// Snapshot of the visible state, the adapter traffic, the page timers and the browser storage. Compared against
// tests/golden/ to show changes in behaviour (see tests/README.md for the exact contents).
async function snapshot(page) {
  return page.evaluate(() => {
    const txt = id => { const e = document.getElementById(id); return e ? e.textContent : null; };
    const storage = {};
    try { Object.keys(localStorage).sort().forEach(k => { storage[k] = localStorage[k]; }); } catch (e) { storage['<error>'] = e.name; }
    const inputs = {};
    ['orig', 'raw'].forEach(id => { const e = document.getElementById(id); if (e) inputs[id] = e.value; });
    ['ack', 'grips', 'seat'].forEach(id => { const e = document.getElementById(id); if (e) inputs[id] = e.checked; });
    const logEl = document.getElementById('log');
    const res = {};
    document.querySelectorAll('.res').forEach(e => { res[e.id] = { cls: e.className, text: e.textContent }; });
    const buttons = {};
    ['b1', 'b2', 'b3', 'b4', 'bdry', 'brb'].forEach(id => {
      const b = document.getElementById(id); if (b) buttons[id] = { text: b.textContent, disabled: b.disabled, cls: b.className };
    });
    const last = document.getElementById('last');
    return {
      sent: window.__sent || [],
      confirms: window.__confirms || [],
      alerts: window.__alerts || [],
      timers: window.__timers || [],
      log: logEl ? Array.from(logEl.children).map(e => e.className + ' | ' + e.textContent.replace(/\n$/, '')) : [],
      stat: txt('stat'),
      dot: (document.getElementById('dot') || {}).className || null,
      last: last ? { cls: last.className, text: last.textContent } : null,
      res, buttons, cfgv: txt('cfgv'), prev: txt('prev'), inputs, storage,
    };
  });
}

// Wait until the page is idle: no pending timers shorter than 30 s (see sim/timers.js), and no new log lines or
// adapter traffic for quietMs. A page that does not become idle within maxMs fails the scenario.
async function settle(page, quietMs = 1000, maxMs = 30000) {
  const probe = () => page.evaluate(() => ({
    sig: (document.getElementById('log') || {}).textContent.length + ':' + (window.__sent || []).length,
    pending: window.__pendingTimers ? window.__pendingTimers.size : 0,
  }));
  const t0 = Date.now(); let last = (await probe()).sig, since = Date.now();
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(150);
    const now = await probe();
    if (now.sig !== last || now.pending > 0) { last = now.sig; since = Date.now(); }
    else if (Date.now() - since >= quietMs) return;
  }
  throw new Error('the page did not become idle within ' + maxMs + ' ms');
}

// Scenario configuration read by the harness (the mock reads the rest of cfg):
//   origin    origin that serves the site (default: the production origin); basePath  path prefix (default '/')
//   pageFile  file opened below basePath (default: the suite's pageFile; '' opens the directory index)
//   storage   { key: value } put into localStorage before the page loads, if the key is not there yet
async function runScenario(browser, scenario, { mockPath, pageFile = 'index.html' }) {
  const [name, cfg, steps] = scenario;
  const origin = cfg.origin || PRODUCTION_ORIGIN, basePath = cfg.basePath || '/';
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await context.newPage();
  const pageErrors = [], policyErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  // Chromium reports blocked actions and header syntax errors (CSP, Permissions-Policy, COOP, Referrer-Policy) here.
  page.on('console', m => { if (/Security.Policy|Permissions.Policy|Opener.Policy|Referrer.Policy/i.test(m.text())) policyErrors.push(m.text()); });
  await serveSite(context, { origin, basePath });
  await page.addInitScript(c => { window.__simCfg = c; }, cfg);
  await page.addInitScript(() => {
    const list = window.__policyErrors = [];
    document.addEventListener('securitypolicyviolation', e => list.push(e.effectiveDirective + ' ' + e.blockedURI));
  });
  if (cfg.storage) {
    await page.addInitScript(s => {
      try { for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch (e) { /* storage blocked */ }
    }, cfg.storage);
  }
  await page.addInitScript({ path: path.join(__dirname, 'timers.js') });
  await page.addInitScript({ path: path.resolve(mockPath) });
  await page.goto(origin + basePath + (cfg.pageFile ?? pageFile));
  if (!cfg.noAck) await page.check('#ack');
  const logText = () => page.evaluate(() => document.getElementById('log').textContent + '\n[stat] ' + document.getElementById('stat').textContent);
  const until = async (re, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (re.test(await logText())) return true; await page.waitForTimeout(100); }
    throw new Error(name + ': timed out waiting for ' + re);
  };
  const beforeReload = [];
  const t = {
    page, until, logText,
    // Reload the page, but first record a snapshot, so traffic and state before the reload are compared too.
    reload: async () => { await settle(page); beforeReload.push(await snapshot(page)); await page.reload(); },
    click: id => page.click('#' + id),
    btn: id => page.$eval('#' + id, b => ({ text: b.textContent, disabled: b.disabled })),
    sent: () => page.evaluate(() => window.__sent),
    st: () => page.evaluate(() => window.__st),
  };
  let ok = true, msg = '';
  try { await steps(t); } catch (e) { ok = false; msg = e.message; }
  let snap = null;
  try { await settle(page); snap = await snapshot(page); if (beforeReload.length) snap.beforeReload = beforeReload; }
  catch (e) { if (ok) { ok = false; msg = 'snapshot failed: ' + e.message; } }
  if (ok && pageErrors.length) { ok = false; msg = 'page error: ' + pageErrors.join(' | '); }
  // site/_headers applies to every response, so a blocked script, style or feature would also break production.
  // A violation is reported first, because it is usually the cause of the other failures.
  try { policyErrors.push(...await page.evaluate(() => window.__policyErrors || [])); } catch (e) { /* page closed */ }
  if (policyErrors.length) { msg = 'security policy violation: ' + [...new Set(policyErrors)].join(' | ') + (ok ? '' : '\n   then: ' + msg); ok = false; }
  const log = snap ? snap.log.join('\n') : await logText().catch(() => '');
  await context.close();
  return { name, ok, msg, log, snap };
}

module.exports = { assert, runScenario };
