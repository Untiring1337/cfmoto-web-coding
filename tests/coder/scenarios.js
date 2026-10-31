// Scenarios for the heated grip & seat coder (index.html), run against tests/sim/coder-mock.js.
// Each entry is [name, mock configuration, async steps(t)]. See tests/sim/harness.js for the helper API.
'use strict';
const fs = require('fs');
const path = require('path');
const { assert } = require('../sim/harness');
const { SITE } = require('../sim/serve');

const scenarios = [
  ['happy path: connect, dry run, read, STPX write, verify', {}, async t => {
    await t.click('b1'); await t.until(/connected and ready|connection failed/);
    const s = await t.sent();
    for (const c of ['STCFCPC', 'STCFCPA 714,794', 'STCFCPA 715,795']) assert(s.includes(c), 'missing ' + c);
    await t.click('bdry'); await t.until(/DRY RUN/);
    assert(/DRY RUN \(read-only\) ✓/.test(await t.logText()), 'dry run should pass');
    assert((await t.sent()).includes('STPX d:22F010F010F010F010,t:1000'), 'probe must use STPX');
    assert((await t.btn('b4')).disabled, 'dry run must not arm ④');
    await R3(t);
    assert(!(await t.btn('b4')).disabled, '③ arms ④');
    await t.click('b4'); await t.until(/VERIFIED|MISMATCH|could not verify/);
    const s2 = await t.sent(); const w = s2.find(x => /^STPX d:2EF010/.test(x));
    assert(w, 'write line present');
    assert(/^STPX d:2EF010[0-9A-F]{16},t:3000$/.test(w), 'write line format: ' + w);
    assert(!s2.some(x => /^2EF010/.test(x)), 'no plain 2E line');
    assert(/✓ VERIFIED/.test(await t.logText()), 'should verify');
    const st = await t.st(); assert(st.rec[1] === 0x30, 'byte1 bits set: ' + st.rec[1]); assert(st.writes === 1, 'exactly one write');
  }],
  ['response pending before 6EF010 is still accepted', { write: 'pending' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/Security access is granted/);
    await t.click('b3'); await t.until(/keep a copy of this value/); await t.click('b4'); await t.until(/VERIFIED|MISMATCH|could not verify|write failed/);
    assert(/accepted the write/.test(await t.logText()), 'pending + 6EF010 must count as accepted');
  }],
  ['adapter rejects STCFCPA: write blocked, reads OK, pairs cleared', { pairFailAt: 2 }, async t => {
    await t.click('b1'); await t.until(/connected and ready|connection failed/);
    const L = await t.logText(); assert(/connected and ready/.test(L), 'connect still succeeds'); assert(/you cannot use step ④ or ↺ Restore/.test(L), 'warns write blocked');
    const s = await t.sent(); assert(s.filter(x => x === 'STCFCPC').length === 2, 'cleanup STCFCPC sent');
    assert((await t.st()).pairs.length === 0, 'pair list cleared');
    await t.click('bdry'); await t.until(/DRY RUN/);
    assert(/completed with a problem/.test(await t.logText()), 'dry run reports blocker'); assert(/keep a copy of this value/.test(await t.logText()), 'read still works');
    await R3(t); const before = (await t.sent()).length;
    await t.click('b4'); await t.until(/Step ④ is blocked\. The adapter did not accept/);
    assert((await t.sent()).length === before, 'nothing at all sent to adapter/bike (no unlock, no write)');
    assert(!(await t.btn('b4')).disabled, '④ stays clickable (harmless)');
  }],
  ['adapter without STPX (?): probe blocks write', { noStpx: true }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('bdry'); await t.until(/DRY RUN/);
    assert(/long-message test failed: the adapter did not accept the command/.test(await t.logText()), 'probe reports ?');
  }],
  ['FC RX TIMEOUT on the write: nothing written, ④ re-armed', { fcTimeout: 'write' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await t.click('b3'); await t.until(/keep a copy of this value/);
    await t.click('b4'); await t.until(/write failed/);
    const L = await t.logText(); assert(/FC RX TIMEOUT/.test(L), 'explains FC RX TIMEOUT'); assert(!/does not know if the instrument cluster stored/.test(L), 'not reported as unknown');
    assert(!(await t.btn('b4')).disabled, '④ re-armed'); assert((await t.st()).writes === 0, 'nothing written');
  }],
  ['NO DATA after the write: outcome unknown, ④ locked until ③', { write: 'nodata' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await t.click('b3'); await t.until(/keep a copy of this value/);
    await t.click('b4'); await t.until(/does not know if the instrument cluster stored/);
    let b = await t.btn('b4'); assert(b.disabled && /result unknown/.test(b.text), '④ locked: ' + JSON.stringify(b));
    await R3(t);
    b = await t.btn('b4'); assert(!b.disabled && b.text === '④ Write configuration and reset', '③ re-arms ④: ' + JSON.stringify(b));
  }],
  ['NRC 72 on the write: outcome unknown', { write: 'nrc72' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await t.click('b3'); await t.until(/keep a copy of this value/);
    await t.click('b4'); await t.until(/does not know if the instrument cluster stored/); assert(/NRC 72/.test(await t.logText()), 'shows NRC 72');
  }],
  ['write never answers (page timeout): outcome unknown', { write: 'hang' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await t.click('b3'); await t.until(/keep a copy of this value/);
    await t.click('b4'); await t.until(/does not know if the instrument cluster stored/, 25000); assert(/before the timeout/.test(await t.logText()), 'page timeout');
  }],
  ['reset hangs after accepted write: told write was accepted', { reset: 'hang' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await t.click('b3'); await t.until(/keep a copy of this value/);
    await t.click('b4'); await t.until(/accepted the write\. Only the reset failed/, 15000); const b = await t.btn('b4'); assert(b.disabled, '④ stays disabled');
  }],
  ['lockout NRC 37 still detected by unlock()', { lockout: true }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/Security access is locked/);
    assert(/Locked\. Wait before you try again/.test((await t.btn('b2')).text), 'lockout button text');
  }],
  ['BCM switch keeps FC pairs; long DASH read still works after switching back', {}, async t => {
    await t.click('b1'); await t.until(/connected and ready/);
    await t.page.click('summary');
    await t.page.click('#seg button[data-tx="715"]'); await t.until(/Target module: request ID 0x715/);
    await t.page.click('#seg button[data-tx="714"]'); await t.until(/Target module: request ID 0x714/);
    await t.click('b2'); await t.until(/granted/); await t.click('b3'); await t.until(/keep a copy of this value|not complete/);
    assert(/keep a copy of this value/.test(await t.logText()), 'read after switch'); assert((await t.st()).pairs.length === 2, 'pairs intact');
  }],
];

const W = async t => { await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await t.click('b3'); await t.until(/keep a copy of this value/); await t.click('b4'); };
scenarios.push(
  ['BLE drop during STCFCPA: connect failed, not "ready"', { dropAt: 'STCFCPA 714,794' }, async t => {
    await t.click('b1'); await t.until(/connection failed|connected and ready/, 20000); await t.page.waitForTimeout(300);
    const L = await t.logText(); assert(/connection failed/.test(L), 'reports connect failed'); assert(!/connected and ready/.test(L), 'no false ready');
    assert(!/cannot send multi-frame messages/.test(L), 'does not blame adapter'); assert((await t.btn('b2')).disabled, '② stays disabled');
  }],
  ['lost reply to STCFCPA once: redone from STCFCPC, no duplicates, write possible', { loseReplyOnce: 'STCFCPA 714,794' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/, 20000);
    const L = await t.logText(); assert(/from STCFCPC \(attempt 2 of 3\)/.test(L), 'retry noted'); assert(!/you cannot use step ④ or ↺ Restore/.test(L), 'not blocked');
    const st = await t.st(); assert(st.pairs.length === 2, 'exactly two pairs: ' + JSON.stringify(st.pairs));
    await t.click('bdry'); await t.until(/DRY RUN/); assert(/DRY RUN \(read-only\) ✓/.test(await t.logText()), 'dry run passes');
  }],
  ['verify MISMATCH then ③: ④ stays blocked with the warning', { write: 'mismatch' }, async t => {
    await W(t); await t.until(/MISMATCH/, 20000);
    await R3(t);
    const b = await t.btn('b4'); assert(b.disabled && /NOT verified/.test(b.text), '④ still blocked: ' + JSON.stringify(b));
  }],
  ['NRC 33 on the write: definite refusal, nothing stored, ④ re-armed', { write: 'nrc33' }, async t => {
    await W(t); await t.until(/write failed/);
    const L = await t.logText(); assert(/NRC 33\)\. The instrument cluster did not store the new configuration record/.test(L), 'says nothing stored'); assert(!/does not know if the instrument cluster stored/.test(L), 'not unknown');
    assert(!(await t.btn('b4')).disabled, '④ re-armed');
  }],
  ['78 then NRC 33: still a definite refusal', { write: 'pending33' }, async t => {
    await W(t); await t.until(/write failed/); const L = await t.logText();
    assert(/NRC 33\)\. The instrument cluster did not store the new configuration record/.test(L), 'final NRC used'); assert(!/does not know if the instrument cluster stored/.test(L), 'not unknown');
  }],
  ['lone 7F2E78: outcome unknown', { write: 'lone78' }, async t => {
    await W(t); await t.until(/does not know if the instrument cluster stored/); assert(/NRC 78/.test(await t.logText()), 'shows 78');
    assert((await t.btn('b4')).disabled, '④ locked');
  }],
);

const ORIG = '12003456789ABCDE';
const stored = t => t.page.evaluate(() => localStorage.getItem('cf800-heating-coder.F010.original'));
const origVal = t => t.page.$eval('#orig', e => e.value);
const R3 = async t => { const n = ((await t.logText()).match(/current F010 =/g) || []).length;
  await t.click('b3'); await t.until(new RegExp('(current F010 =[\\s\\S]*){' + (n + 1) + '}'));
  for (let k = 0; k < 100 && (await t.btn('b3')).disabled; k++) await t.page.waitForTimeout(100); };
scenarios.push(
  ['rollback: ④ then ↺ restores the saved original and verifies', {}, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000);
    assert(await origVal(t) === ORIG, 'field prefilled with original: ' + await origVal(t)); assert(await stored(t) === ORIG, 'stored');
    assert((await t.btn('brb')).disabled, '↺ needs a fresh ③ first');
    await R3(t); assert(!(await t.btn('brb')).disabled, '③ arms ↺');
    await t.click('brb'); await t.until(/(✓ VERIFIED[\s\S]*){2}|MISMATCH|may or may not/, 20000);
    assert((await t.sent()).includes('STPX d:2EF010' + ORIG + ',t:3000'), 'restore write line');
    const st = await t.st(); assert(st.rec.map(b => ('0' + b.toString(16)).slice(-2).toUpperCase()).join('') === ORIG, 'cluster back to original');
    const b = await t.btn('brb'); assert(/Restored ✓ verified/.test(b.text) && b.disabled, 'label: ' + JSON.stringify(b));
    assert((await t.btn('b4')).disabled, '④ needs ③ again'); assert(!(await t.btn('b3')).disabled, '③ usable again');
    assert(/Changes: byte 1 from 30 to 00\./.test(await t.page.evaluate(() => window.__lastConfirm)), 'confirm shows the 1-byte diff');
  }],
  ['original is saved once: a second ④ does not overwrite it', {}, async t => {
    await t.page.uncheck('#seat');                      // first write: grips only (byte1 00 → 10)
    await W(t); await t.until(/✓ VERIFIED/, 20000); await R3(t);
    await t.page.check('#seat');                        // second write: grips + seat (10 → 30)
    await t.click('b4'); await t.until(/(✓ VERIFIED[\s\S]*){2}/, 20000);
    assert((await t.st()).rec[1] === 0x30, 'second write happened');
    assert(await stored(t) === ORIG, 'still the first original: ' + await stored(t));
  }],
  ['original survives a page reload', {}, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000);
    assert(/saved the original F010 value in this browser for ↺ Restore: 12003456789ABCDE\. Make sure/.test(await t.logText()), 'save is logged');
    await t.reload(); await t.page.waitForTimeout(300);
    assert(await origVal(t) === ORIG, 'prefilled after reload: ' + await origVal(t));
    assert(/saved original F010 value for ↺ Restore: 12003456789ABCDE/.test(await t.logText()), 'logged on load');
  }],
  ['↺ refuses a wrong-length value and sends nothing', {}, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await R3(t);
    await t.page.fill('#orig', '1200'); const n = (await t.sent()).length;
    await t.click('brb'); await t.until(/↺ Restore is blocked\. The value in the field has 2 bytes/);
    assert((await t.sent()).length === n, 'nothing sent');
  }],
  ['↺ with the current value: nothing to restore', {}, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await R3(t);
    await t.page.fill('#orig', ORIG.toLowerCase()); const n = (await t.sent()).length;
    await t.click('brb'); await t.until(/No restore is necessary/); assert((await t.sent()).length === n, 'nothing sent');
  }],
  ['↺ with a pasted spaced value and multi-byte diff: warns, writes exactly that', {}, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await R3(t);
    await t.page.fill('#orig', '12 30 34 56 78 9A BC 00');
    await t.click('brb'); await t.until(/✓ VERIFIED|MISMATCH/, 20000);
    assert(/2 bytes are different/.test(await t.page.evaluate(() => window.__lastConfirm)), 'multi-byte warning');
    { const w = (await t.sent()).filter(x => /^STPX d:2EF010/.test(x)); assert(w.length === 1 && w[0] === 'STPX d:2EF01012303456789ABC00,t:3000', 'exact pasted record written: ' + JSON.stringify(w)); }
  }],
  ['↺ blocked when the adapter refused the pairs, nothing sent', { pairFailAt: 1 }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await R3(t);
    await t.page.fill('#orig', '12303456789ABCDE'); const n = (await t.sent()).length;
    await t.click('brb'); await t.until(/↺ Restore is blocked\. The adapter did not accept/); assert((await t.sent()).length === n, 'nothing sent');
  }],
  ['after a MISMATCH, ③ arms neither ④ nor ↺', { write: 'mismatch' }, async t => {
    await W(t); await t.until(/MISMATCH/, 20000); await R3(t);
    const b = await t.btn('brb'); assert(b.disabled && /Do step ① again/.test(b.text), '↺ blocked: ' + JSON.stringify(b));
    assert((await t.btn('b4')).disabled, '④ blocked');
  }],
  ['③ and dry-run are locked while a write is in flight', { write: 'hang' }, async t => {
    await W(t); await t.until(/» STPX d:2EF010/, 15000); await t.page.waitForTimeout(300);
    assert((await t.btn('b3')).disabled && (await t.btn('bdry')).disabled, 'locked during write');
    await t.until(/does not know if the instrument cluster stored/, 25000);
    assert(!(await t.btn('b3')).disabled && !(await t.btn('bdry')).disabled, 'unlocked after');
  }],
  ['restore with unknown outcome: ↺ unconfirmed, both locked until ③', { write: 'nodataSecond' }, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000); await R3(t);
    await t.click('brb'); await t.until(/does not know if the instrument cluster stored/, 20000);
    const b = await t.btn('brb'); assert(b.disabled && /Restore result unknown/.test(b.text), JSON.stringify(b)); assert((await t.btn('b4')).disabled, '④ locked');
    await R3(t); assert(!(await t.btn('brb')).disabled && !(await t.btn('b4')).disabled, '③ re-arms both');
  }],
);

scenarios.push(
  ['④ when the bits are already set: nothing written, no original saved', { rec: [0x73, 0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, async t => {
    await W(t); await t.until(/④ No write is necessary\. The value of byte 1 is already 30/);
    assert(!(await t.sent()).some(x => /2EF010/.test(x)), 'no write'); assert(await stored(t) === null, 'nothing stored: ' + await stored(t));
    assert(await origVal(t) === '', 'field stays empty');
  }],
  ['link drops during the pre-write unlock: nothing written, nothing re-armed', { dropAtNth: { line: '2701', n: 2 } }, async t => {
    await W(t); await t.until(/did not store the new configuration record\. Do step ① again/, 20000);
    assert(!(await t.sent()).some(x => /2EF010/.test(x)), 'no write');
    for (const id of ['b4', 'brb', 'b3', 'bdry']) assert((await t.btn(id)).disabled, id + ' stays disabled');
  }],
  ['↺ MISMATCH then ③: ↺ named as the failure, ④ just blocked', { write: 'mismatchSecond' }, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000); await R3(t);
    await t.click('brb'); await t.until(/MISMATCH/, 20000); await R3(t);
    const b4 = await t.btn('b4'), br = await t.btn('brb');
    assert(b4.disabled && b4.text === '④ Blocked. Do step ① again.', '④: ' + JSON.stringify(b4));
    assert(br.disabled && br.text === '↺ Restore NOT verified', '↺: ' + JSON.stringify(br));
  }],
);

scenarios.push(
  ['storage blocked: the warning names the first original, once, never a coded record', { blockStorage: true }, async t => {
    await t.page.uncheck('#seat');
    await W(t); await t.until(/✓ VERIFIED/, 20000);
    let L = await t.logText();
    assert(/browser storage is blocked\. Keep a copy of this value: 12003456789ABCDE/.test(L), 'names the true original');
    await R3(t); await t.page.check('#seat');
    await t.click('b4'); await t.until(/(✓ VERIFIED[\s\S]*){2}/, 20000);
    L = await t.logText();
    assert(!/Keep a copy of this value: 12103456789ABCDE/.test(L), 'never tells the user to keep the grips-coded record');
    assert((L.match(/browser storage is blocked/g) || []).length === 1, 'warned once');
    assert(await origVal(t) === ORIG, 'box keeps the first original: ' + await origVal(t));
  }],
);

scenarios.push(
  ['confirmed cluster (part + length): green note, single confirm, exact 16-byte write', { rec: [0x73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], part: '6WW9-171000-8000', sw: 'SW.1.02.02' }, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000);
    const cs = await t.page.evaluate(() => window.__confirms);
    assert(cs.length === 1 && /✓ Confirmed variant: CF800-11H instrument cluster, part number 6WW9-171000-8000/.test(cs[0]) && !/⚠/.test(cs[0]), 'confirms: ' + JSON.stringify(cs));
    assert((await t.sent()).includes('STPX d:2EF01073300000000000000000000000000000,t:3000'), 'exact 16-byte write');
    assert(/✓ Confirmed variant: CF800-11H instrument cluster, part number 6WW9-171000-8000/.test(await t.page.$eval('#cfgv', e => e.textContent)), 'screen note');
    assert(/F187 \(part number\): "6WW9-171000-8000/.test(await t.logText()), 'identity logged at step 3');
  }],
  ['known part but 12-byte record: length warning and a second confirm', { rec: [0x73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], part: '6WW9-171000-8000', sw: 'SW.1.02.02' }, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000);
    const cs = await t.page.evaluate(() => window.__confirms);
    assert(cs.length === 2 && /⚠ UNCONFIRMED instrument cluster\. The configuration record has 12 bytes/.test(cs[0]) && /⚠ UNCONFIRMED INSTRUMENT CLUSTER/.test(cs[1]), 'confirms: ' + JSON.stringify(cs));
    assert(/⚠ UNCONFIRMED instrument cluster\. The configuration record has 12 bytes/.test(await t.page.$eval('#cfgv', e => e.textContent)), 'screen warns');
  }],
  ['unknown part number: red warning, second confirm, write still possible', { rec: [0x73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], part: '9ZZ9-000000-0000', sw: 'SW.9.9.9' }, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000);
    assert(/Part number 9ZZ9-000000-0000 is not on the list of confirmed variants/.test(await t.page.$eval('#cfgv', e => e.textContent)), 'screen warns');
    const cs = await t.page.evaluate(() => window.__confirms);
    assert(cs.length === 2 && /Part number 9ZZ9-000000-0000 is not on the list of confirmed variants/.test(cs[0]) && /Do you want to write to this instrument cluster at your own risk\?/.test(cs[1]), 'confirms: ' + JSON.stringify(cs));
  }],
  ['unreadable part number: warning names F187', { rec: [0x73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await R3(t);
    const v = await t.page.$eval('#cfgv', e => e.textContent);
    assert(/UNCONFIRMED instrument cluster\. The part number \(F187\) of the instrument cluster is not available/.test(v), 'screen: ' + v);
    assert(!(await t.btn('b4')).disabled, '④ still available (warning, not a block)');
  }],
  ['dry run identifies the cluster: confirmed note shown', { rec: [0x73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], part: '6WW9-171000-8000', sw: 'SW.1.02.02' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('bdry'); await t.until(/DRY RUN/);
    assert(/✓ Confirmed variant/.test(await t.page.$eval('#cfgv', e => e.textContent)), 'confirmed after dry run');
    assert((await t.btn('b4')).disabled, 'dry run never arms ④');
  }],
  ['risk gate: Connect disabled until the box is ticked', { noAck: true }, async t => {
    assert((await t.btn('b1')).disabled, 'disabled on load');
    await t.page.check('#ack'); assert(!(await t.btn('b1')).disabled, 'enabled after tick');
    await t.page.uncheck('#ack'); assert((await t.btn('b1')).disabled, 'disabled again after untick');
    await t.page.check('#ack'); await t.click('b1'); await t.until(/connected and ready/);
    assert(!(await t.btn('b1')).disabled, 'reconnect possible after connect');
  }],
  ['risk gate is remembered across a reload', { noAck: true }, async t => {
    await t.page.check('#ack'); await t.reload(); await t.page.waitForTimeout(300);
    assert(await t.page.$eval('#ack', e => e.checked), 'still ticked'); assert(!(await t.btn('b1')).disabled, 'Connect enabled');
    assert(await t.page.evaluate(() => localStorage.getItem('cf800-heating-coder.ack')) === '1', 'stored');
  }],
  ['risk gate with browser storage blocked: works for the visit', { noAck: true, blockStorage: true }, async t => {
    await t.page.check('#ack'); assert(!(await t.btn('b1')).disabled, 'enabled');
    await t.click('b1'); await t.until(/connected and ready/);
  }],
  ['public build: version line, footer, no internal wording', {}, async t => {
    const L = await t.logText(); assert(/CF800-11H Heated Grip & Seat Coder v1\.0\.0/.test(L), 'version in log');
    const body = await t.page.evaluate(() => document.body.innerText);
    assert(/independent of CFMOTO\. CFMOTO did not approve or endorse it/.test(body), 'disclaimer');
    assert(/v1\.0\.0/.test(await t.page.$eval('#ver', e => e.textContent)), 'footer version');
    assert(!/SAVE THIS|send the log|page build/i.test(body + L), 'no internal wording');
    assert(await t.page.title() === 'CF800-11H Heated Grip & Seat Coder', 'title: ' + await t.page.title());
  }],
);

scenarios.push(
  ['link drops during the step-3 identification: nothing armed', { rec: [0x73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], part: '6WW9-171000-8000', sw: 'SW.1.02.02', dropAtNth: { line: '22F187', n: 1 } }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/);
    await t.click('b3'); await t.until(/Bluetooth connection stopped during the read/, 20000);
    for (const id of ['b3', 'b4', 'brb']) assert((await t.btn(id)).disabled, id + ' stays disabled');
    assert(!/Read ✓/.test((await t.btn('b3')).text), 'step 3 not marked done');
  }],
  ['reconnect clears the previous read and its variant note', { rec: [0x73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], part: '6WW9-171000-8000', sw: 'SW.1.02.02' }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/granted/); await R3(t);
    assert(/Confirmed variant/.test(await t.page.$eval('#cfgv', e => e.textContent)), 'confirmed before');
    await t.page.evaluate(() => window.__drop()); await t.until(/\[stat\] The adapter is disconnected/);
    await t.click('b1'); await t.until(/(connected to OBDLink CX[\s\S]*){2}/); await t.until(/\[stat\] The OBDLink CX adapter is connected and ready/);
    assert(await t.page.$eval('#cfgv', e => e.textContent) === '', 'step-3 display cleared');
    assert(await t.page.$eval('#prev', e => e.textContent) === '', 'preview cleared');
  }],
);

const RES = (t, id) => t.page.$eval('#' + id, e => ({ cls: e.className, text: e.textContent }));
const LAST = t => t.page.$eval('#last', e => ({ cls: e.className, text: e.textContent }));
const REC16 = [0x73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const OKCL = { rec: REC16, part: '6WW9-171000-8000', sw: 'SW.1.02.02' };
scenarios.push(
  ['step results: each step shows its own outcome, sticky bar shows the latest', OKCL, async t => {
    await t.click('b1'); await t.until(/connected and ready/);
    let r = await RES(t, 'r1'); assert(/ok/.test(r.cls) && /✓ The adapter is connected and ready\. Next, do step ②/.test(r.text), 'r1: ' + JSON.stringify(r));
    await t.click('bdry'); await t.until(/DRY RUN/);
    r = await RES(t, 'rD'); assert(/ok/.test(r.cls) && /✓ The dry run is complete\. The tool found no problems\. Step ④ will change byte 1 from 00 to 30/.test(r.text), 'rD: ' + JSON.stringify(r));
    await R3(t);
    r = await RES(t, 'r3'); assert(/ok/.test(r.cls) && /Heated grips: off\. Heated seat: off\. Next, select the functions\. Then do step ④\./.test(r.text), 'r3: ' + JSON.stringify(r));
    await t.click('b4'); await t.until(/✓ VERIFIED/, 20000);
    r = await RES(t, 'r4'); assert(/ok/.test(r.cls) && /^✓ Verified\..*set the ignition switch to OFF\. Wait a few seconds\. Then set the ignition switch to ON/.test(r.text), 'r4: ' + JSON.stringify(r));
    const l = await LAST(t); assert(/^Step ④: ✓ Verified/.test(l.text) && /ok/.test(l.cls), 'last: ' + JSON.stringify(l));
    r = await RES(t, 'r2'); assert(/✓ Security access is granted/.test(r.text) || r.text === '', 'r2 sane');
    if (process.env.SHOT) {
      await t.page.setViewportSize({ width: 390, height: 844 });
      await t.page.$eval('#b4', e => e.scrollIntoView({ block: 'center' })); await t.page.waitForTimeout(200);
      await t.page.screenshot({ path: process.env.SHOT + '/step4-result.png' });
      await t.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await t.page.waitForTimeout(200);
      await t.page.screenshot({ path: process.env.SHOT + '/bottom-sticky.png' });
    }
  }],
  ['sticky bar stays visible at the bottom of the page', OKCL, async t => {
    await t.click('b1'); await t.until(/connected and ready/);
    assert(await t.page.$eval('.status', e => getComputedStyle(e).position) === 'sticky', 'sticky');
    await t.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await t.page.waitForTimeout(200);
    const top = await t.page.$eval('.status', e => e.getBoundingClientRect().top);
    assert(top >= -1 && top <= 2, 'bar at the top of the viewport: ' + top);
    assert(/Step ①: ✓/.test((await LAST(t)).text), 'latest result in the bar');
  }],
  ['step 2 result after a lockout', { lockout: true }, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/Security access is locked/);
    const r = await RES(t, 'r2'); assert(/er/.test(r.cls) && /^✗ The seed request failed \(NRC 37\)/.test(r.text), 'r2: ' + JSON.stringify(r));
  }],
  ['write result unknown (NO DATA): step 4 says do not write again', { rec: REC16, part: '6WW9-171000-8000', sw: 'SW.1.02.02', write: 'nodata' }, async t => {
    await W(t); await t.until(/does not know if the instrument cluster stored/);
    const r = await RES(t, 'r4'); assert(/er/.test(r.cls) && /✗ The result of the write is unknown\. Do not write again\. Do step ③/.test(r.text), 'r4: ' + JSON.stringify(r));
  }],
  ['write refused before storing (FC RX TIMEOUT): step 4 says nothing changed', { rec: REC16, part: '6WW9-171000-8000', sw: 'SW.1.02.02', fcTimeout: 'write' }, async t => {
    await W(t); await t.until(/write failed/);
    const r = await RES(t, 'r4'); assert(/er/.test(r.cls) && /^✗ The instrument cluster did not change\. Cause: .*FC RX TIMEOUT/.test(r.text), 'r4: ' + JSON.stringify(r));
  }],
  ['reset failed after an accepted write: warning with the next actions', { rec: REC16, part: '6WW9-171000-8000', sw: 'SW.1.02.02', reset: 'hang' }, async t => {
    await W(t); await t.until(/Only the reset failed/, 15000);
    const r = await RES(t, 'r4'); assert(/warn/.test(r.cls) && /accepted the write, but the reset failed/.test(r.text), 'r4: ' + JSON.stringify(r));
  }],
  ['mismatch: step 4 says do not write again', { rec: REC16, part: '6WW9-171000-8000', sw: 'SW.1.02.02', write: 'mismatch' }, async t => {
    await W(t); await t.until(/MISMATCH/, 20000);
    const r = await RES(t, 'r4'); assert(/er/.test(r.cls) && /✗ MISMATCH\..*Do not write again/.test(r.text), 'r4: ' + JSON.stringify(r));
  }],
  ['cancel in the confirmation dialog: nothing written, step 4 says so', { rec: REC16, part: '6WW9-171000-8000', sw: 'SW.1.02.02', cancelConfirm: true }, async t => {
    await W(t); await t.until(/./);
    for (let k = 0; k < 50 && !(await RES(t, 'r4')).text; k++) await t.page.waitForTimeout(100);
    const r = await RES(t, 'r4'); assert(/You selected Cancel\. The tool did not write/.test(r.text), 'r4: ' + JSON.stringify(r));
    assert(!(await t.sent()).some(x => /2EF010/.test(x)), 'no write');
  }],
  ['restore: ↺ result shows restored and verified', OKCL, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000); await R3(t);
    await t.click('brb'); await t.until(/(✓ VERIFIED[\s\S]*){2}/, 20000);
    const r = await RES(t, 'rR'); assert(/ok/.test(r.cls) && /^✓ Restored and verified/.test(r.text), 'rR: ' + JSON.stringify(r));
  }],
  ['connection failure and disconnect are shown under step 1; later results are cleared', { ...OKCL, dropAt: 'STCFCPA 714,794' }, async t => {
    await t.click('b1'); await t.until(/connection failed/, 20000); await t.page.waitForTimeout(300);
    const r = await RES(t, 'r1'); assert(/er/.test(r.cls) && /^✗ (The connection failed|The adapter is disconnected)/.test(r.text), 'r1: ' + JSON.stringify(r));
    for (const id of ['r2', 'r3', 'rD', 'r4', 'rR']) assert((await RES(t, id)).text === '', id + ' cleared');
  }],
);

scenarios.push(
  ['after a verified write, a link drop keeps the ✓ result in view', OKCL, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000);
    await t.page.evaluate(() => window.__drop()); await t.until(/\[stat\] The adapter is disconnected/);
    const r4 = await RES(t, 'r4'); assert(/ok/.test(r4.cls) && /^✓ Verified/.test(r4.text), 'r4 kept: ' + JSON.stringify(r4));
    const r1 = await RES(t, 'r1'); assert(/The result of step ④ below stays valid/.test(r1.text) && !/er/.test(r1.cls), 'r1: ' + JSON.stringify(r1));
    const l = await LAST(t); assert(/^Step ④: ✓ Verified/.test(l.text) && /ok/.test(l.cls), 'bar keeps the write result: ' + JSON.stringify(l));
    await t.click('b1'); await t.until(/(connected to OBDLink CX[\s\S]*){2}/); await t.until(/\[stat\] The OBDLink CX adapter is connected and ready/);
    assert((await RES(t, 'r4')).text === '', 'a new connection clears the old write result');
  }],
  ['step 3 after a verified write: says step 4 is not necessary, old write result cleared', OKCL, async t => {
    await W(t); await t.until(/✓ VERIFIED/, 20000); await R3(t);
    const r3 = await RES(t, 'r3'); assert(/The two functions are already enabled\. Step ④ is not necessary\./.test(r3.text), 'r3: ' + JSON.stringify(r3));
    assert((await RES(t, 'r4')).text === '', 'r4 cleared by the fresh read');
  }],
  ['step 3 after a mismatch: says writes stay blocked', { ...OKCL, write: 'mismatch' }, async t => {
    await W(t); await t.until(/MISMATCH/, 20000); await R3(t);
    const r3 = await RES(t, 'r3'); assert(/warn/.test(r3.cls) && /stay blocked because of the MISMATCH\. Do not write again\./.test(r3.text), 'r3: ' + JSON.stringify(r3));
  }],
  ['module switch replaces the old step 2 result', OKCL, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/Security access is granted/);
    await t.page.click('summary'); await t.page.click('#seg button[data-tx="715"]'); await t.until(/Target module: request ID 0x715/);
    const r2 = await RES(t, 'r2'); assert(/warn/.test(r2.cls) && /The selected module changed\. Do step ② for this module\./.test(r2.text), 'r2: ' + JSON.stringify(r2));
  }],
  ['dry run with no function selected: tells the user to select one', OKCL, async t => {
    await t.page.uncheck('#grips'); await t.page.uncheck('#seat');
    await t.click('b1'); await t.until(/connected and ready/); await t.click('bdry'); await t.until(/DRY RUN/);
    const rD = await RES(t, 'rD'); assert(/Select "Heated grips", "Heated seat", or both\. Then do step ④\./.test(rD.text), 'rD: ' + JSON.stringify(rD));
    const r2 = await RES(t, 'r2'); assert(/The dry run did this step/.test(r2.text), 'r2 updated by the dry run: ' + JSON.stringify(r2));
  }],
  ['chooser cancelled: plain message, no browser error text', { cancelChooser: true }, async t => {
    await t.click('b1'); await t.until(/connection failed/);
    const r1 = await RES(t, 'r1'); assert(r1.text === '✗ The connection failed. No adapter was selected. Do step ① again.', 'r1: ' + JSON.stringify(r1));
  }],
  ['light mode uses darker status colours for contrast', {}, async t => {
    await t.page.emulateMedia({ colorScheme: 'light' });
    const ok = await t.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ok').trim());
    assert(ok === '#1b7a3e', 'light --ok: ' + ok);
  }],
);

scenarios.push(
  ['④ with no function selected: alert, nothing written', OKCL, async t => {
    await t.click('b1'); await t.until(/connected and ready/); await t.click('b2'); await t.until(/Security access is granted/); await R3(t);
    await t.page.uncheck('#grips'); await t.page.uncheck('#seat');
    const n = (await t.sent()).length; await t.click('b4'); await t.page.waitForTimeout(300);
    const al = await t.page.evaluate(() => window.__alerts);
    assert(al.length === 1 && /Select "Heated grips", "Heated seat", or both/.test(al[0]), 'alert: ' + JSON.stringify(al));
    assert((await t.sent()).length === n, 'nothing sent');
  }],
);

// ---- Hosting: production headers and the preview banner ----
// The released tool is served only from PRODUCTION_ORIGIN (one constant in site/index.html). Every other address,
// such as the GitHub Pages dev preview, shows the preview banner. site/_headers applies to every response in all scenarios.
const PROD = /var PRODUCTION_ORIGIN = "(https:\/\/[^"]+)"/.exec(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'))[1];
const PREVIEW = { origin: 'https://untiring1337.github.io', basePath: '/cfmoto-web-coding/', pageFile: '' };
const SAVED = '73000000000000000000000000000000';
const BANNER = t => t.page.evaluate(() => ({
  shown: getComputedStyle(document.getElementById('pv')).display !== 'none',
  noindex: !!document.querySelector('meta[name="robots"][content="noindex"]'),
  saved: document.getElementById('pvorig').hidden ? null : document.getElementById('pvval').textContent,
  link: document.getElementById('pvlink').href,
  canonical: document.querySelector('link[rel="canonical"]').href,
  build: document.getElementById('pvbuild').textContent,
}));
const CONNECT_DRY = async t => {
  await t.click('b1'); await t.until(/connected and ready/); await t.click('bdry'); await t.until(/DRY RUN/);
  assert(/DRY RUN \(read-only\) ✓/.test(await t.logText()), 'dry run should pass');
};

scenarios.push(
  ['production headers: Bluetooth and clipboard allowed, other device features blocked', {}, async t => {
    const fp = await t.page.evaluate(() => Object.fromEntries(
      ['bluetooth', 'clipboard-write', 'camera', 'microphone', 'geolocation', 'usb', 'serial', 'hid', 'payment']
        .map(f => [f, document.featurePolicy.allowsFeature(f)])));
    assert(fp.bluetooth && fp['clipboard-write'], 'allowed: ' + JSON.stringify(fp));
    for (const f of ['camera', 'microphone', 'geolocation', 'usb', 'serial', 'hid', 'payment']) assert(fp[f] === false, f + ' must be blocked: ' + JSON.stringify(fp));
    await CONNECT_DRY(t);
  }],
  ['preview banner on the local test server', {}, async t => {
    const b = await BANNER(t);
    assert(b.shown && b.noindex && b.saved === null && b.build === 'local', 'banner: ' + JSON.stringify(b));
    assert(b.link === PROD + '/' && b.canonical === PROD + '/', 'links: ' + JSON.stringify(b));
  }],
  ['preview banner on the GitHub Pages address; the tool works below the base path', PREVIEW, async t => {
    const b = await BANNER(t);
    assert(b.shown && b.noindex && b.saved === null, 'banner: ' + JSON.stringify(b));
    assert(t.page.url() === PREVIEW.origin + PREVIEW.basePath, 'url: ' + t.page.url());
    await CONNECT_DRY(t);
  }],
  ['production origin: no banner, page can be indexed', { origin: PROD }, async t => {
    const b = await BANNER(t);
    assert(!b.shown && !b.noindex, 'banner: ' + JSON.stringify(b));
    await CONNECT_DRY(t);
  }],
  ['preview with a saved original: the banner shows it and Copy puts it on the clipboard', { ...PREVIEW, storage: { 'cf800-heating-coder.F010.original': SAVED } }, async t => {
    const b = await BANNER(t);
    assert(b.shown && b.saved === SAVED, 'banner: ' + JSON.stringify(b));
    await t.click('pvcopy');
    await t.page.waitForFunction(() => document.getElementById('pvcopy').textContent === 'Copied', null, { timeout: 5000 });
    const clip = await t.page.evaluate(() => navigator.clipboard.readText());
    assert(clip === SAVED, 'clipboard: ' + clip);
  }],
  ['production with a saved original: the banner stays hidden', { origin: PROD, storage: { 'cf800-heating-coder.F010.original': SAVED } }, async t => {
    const b = await BANNER(t);
    assert(!b.shown && b.saved === null, 'banner: ' + JSON.stringify(b));
    assert((await t.page.inputValue('#orig')) === SAVED, 'the saved original is still in the ↺ Restore field');
  }],
);

module.exports = scenarios;
