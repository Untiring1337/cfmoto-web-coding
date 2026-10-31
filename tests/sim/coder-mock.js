// Browser-side mock for the heated grip & seat coder (index.html).
// Loaded with page.addInitScript({ path }) after window.__simCfg is set. It replaces Web Bluetooth with a
// simulated OBDLink CX: an STN/ELM command interpreter and the DASH (0x714/0x794) and BCM (0x715/0x795)
// modules as the coder uses them. window.__simCfg selects per-scenario adapter and module behaviour.
// Test hooks: window.__sent (every command line received), window.__st (mock state), window.__drop()
// (simulate a Bluetooth disconnect), window.__confirms / __lastConfirm (dialog texts).
(function () {
  'use strict';
  const cfg = window.__simCfg || {};
  const enc = new TextEncoder(), dec = new TextDecoder();
  const sent = []; window.__sent = sent; window.__cfg = cfg;
  const MASK = { '714': [0x34, 0x66, 0x2E, 0x8D], '715': [0x6B, 0x27, 0x8D, 0xC2] };
  const RESP = { '714': '794', '715': '795' };
  function s2k(s, m) { const t = s.map((b, i) => b ^ m[i]); const [t0, t1, t2, t3] = t;
    return [t3 & 0xF0, (((t3 & 0x2F) << 2) | (t1 & 0x03)) & 0xFF, (t0 & 0xC0) | (t1 >> 2), (((t0 & 0x0F) << 4) | (t2 & 0x0F)) & 0xFF]; }
  const hx = a => a.map(b => ('0' + b.toString(16)).slice(-2).toUpperCase()).join('');
  const st = { atsh: '7DF', atcra: '', fcsh: '', fcsm: 0, pairs: [], unlocked: {}, seed: [0x11, 0x22, 0x33, 0x44],
               rec: cfg.rec || [0x12, 0x00, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE], writes: 0, last: '', dropCount: 0 };
  window.__st = st;
  let listener = null, inbuf = '';
  function emit(text) { // notify in 20-byte chunks
    const b = enc.encode(text);
    for (let i = 0; i < b.length; i += 20) {
      const dv = new DataView(b.slice(i, i + 20).buffer);
      setTimeout(() => listener && listener({ target: { value: dv } }), 5 + i);
    }
  }
  function mf(bytes) { // ELM multi-frame layout for a reply longer than 7 bytes (CAF1, ATH0, ATS0)
    if (bytes.length <= 7) return hx(bytes);
    const out = [('00' + bytes.length.toString(16).toUpperCase()).slice(-3)];
    out.push('0:' + hx(bytes.slice(0, 6)));
    let n = 1; for (let i = 6; i < bytes.length; i += 7, n++) { const c = bytes.slice(i, i + 7); while (c.length < 7) c.push(0xAA); out.push((n & 15).toString(16).toUpperCase() + ':' + hx(c)); }
    return out.join('\r');
  }
  function fcOkForReply(tx) { // can the adapter send FC for a long reply from RESP[tx]?
    const rx = RESP[tx];
    if (st.pairs.length) return st.pairs.some(p => p[0] === tx && p[1] === rx);
    return st.fcsm === 1 && st.fcsh === tx;
  }
  function ecu(tx, hex) {
    if (!RESP[tx] || st.atcra !== RESP[tx]) return 'NO DATA';
    if (Date.now() < (st.bootUntil || 0)) return 'NO DATA';      // rebooting after 11 01
    const by = []; for (let i = 0; i < hex.length; i += 2) by.push(parseInt(hex.substr(i, 2), 16));
    const sid = by[0];
    const long = r => { const b = []; for (let i = 0; i < r.length; i += 2) b.push(parseInt(r.substr(i, 2), 16)); return b.length > 7 && !fcOkForReply(tx) ? mf(b).split('\r').slice(0, 2).join('\r') : mf(b); };
    if (hex === '1003') return '5003003201F4';
    if (hex === '2701') { if (cfg.lockout) return '7F2737'; return '6701' + hx(st.seed); }
    if (hex.startsWith('2702')) { const k = hex.slice(4); if (k === hx(s2k(st.seed, MASK[tx]))) { st.unlocked[tx] = true; return '6702'; } return '7F2735'; }
    if (hex === '22F010' && tx === '714') return long('62F010' + hx(st.rec));
    if (hex === '22F010F010F010F010') return '7F2213';
    const asc = t => Array.from(t).map(c => ('0' + c.charCodeAt(0).toString(16)).slice(-2).toUpperCase()).join('');
    if (hex === '22F187' && cfg.part && tx === '714') return long('62F187' + asc(cfg.part.padEnd(20, ' ')));
    if (hex === '22F195' && cfg.sw && tx === '714') return long('62F195' + asc(cfg.sw));
    if (/^22F1/.test(hex)) return '7F2231';
    if (/^2EF010/.test(hex) && tx === '714') {
      if (!st.unlocked[tx]) return '7F2E33';
      if (cfg.write === 'nodata') { st.writes++; return 'NO DATA'; }
      if (cfg.write === 'hang') { st.writes++; return null; }
      if (cfg.write === 'nrc72') { st.writes++; return '7F2E72'; }
      if (cfg.write === 'nrc33') return '7F2E33';
      if (cfg.write === 'nodataSecond' && st.writes >= 1) { st.writes++; return 'NO DATA'; }
      if (cfg.write === 'mismatchSecond' && st.writes >= 1) { st.rec = by.slice(3); st.rec[1] = 0x10; st.writes++; return '6EF010'; }
      if (cfg.write === 'pending33') return '7F2E78\r7F2E33';
      if (cfg.write === 'lone78') { st.writes++; return '7F2E78'; }
      if (cfg.write === 'mismatch') { st.rec = by.slice(3); st.rec[1] &= 0xCF; st.writes++; return '6EF010'; }
      st.rec = by.slice(3); st.writes++;
      return cfg.write === 'pending' ? '7F2E78\r6EF010' : '6EF010';
    }
    if (hex === '1101') { if (cfg.reset === 'hang') return null; st.unlocked = {}; st.bootUntil = Date.now() + 1500; return '5101'; }
    return '7F' + hx([sid]) + '11';
  }
  function exec(line) {
    const c = line.replace(/\s+/g, '').toUpperCase();
    sent.push(line);
    if (c === '') return exec(st.last);
    st.last = line;
    let m;
    if (c === 'ATZ') return 'ELM327 v1.4b';
    if ((m = c.match(/^ATSH([0-9A-F]+)$/))) { st.atsh = m[1]; return 'OK'; }
    if ((m = c.match(/^ATCRA([0-9A-F]*)$/))) { st.atcra = m[1]; return 'OK'; }
    if ((m = c.match(/^ATFCSH([0-9A-F]+)$/))) { st.fcsh = m[1]; return 'OK'; }
    if ((m = c.match(/^ATFCSM([0-2])$/))) { st.fcsm = +m[1]; return 'OK'; }
    if (/^AT/.test(c)) return 'OK';
    if (c === 'STI') return 'STN2310 v5.8.1';
    if (c === 'STDI') return 'OBDLink CX r1.0';
    if (c === 'STCFCPC') { if (cfg.noPairs) return '?'; st.pairs = []; return 'OK'; }
    if ((m = c.match(/^STCFCPA([0-9A-F]{3}),([0-9A-F]{3})$/))) {
      if (cfg.noPairs) return '?';
      if (cfg.pairFailAt && st.pairs.length + 1 === cfg.pairFailAt) return '?';
      st.pairs.push([m[1], m[2]]); return 'OK'; }
    if ((m = c.match(/^STPX(.*)$/))) {
      if (cfg.noStpx) return '?';
      const ps = {}; m[1].split(',').forEach(kv => { const p = kv.split(':'); if (p.length === 2) ps[p[0].toLowerCase()] = p[1]; });
      if (!ps.d || ps.r !== undefined && cfg.strictNoR) return '?';
      const tx = ps.h || st.atsh, data = ps.d;
      if (data.length > 14) {
        const pairOk = st.pairs.some(p => p[0] === tx && p[1] === RESP[tx]);
        if (!pairOk || cfg.fcTimeout === true || (cfg.fcTimeout === 'write' && /^2E/.test(data))) return 'FC RX TIMEOUT';
      }
      return ecu(tx, data);
    }
    if (/^[0-9A-F]+$/.test(c)) { if (c.length > 14) return '?'; return ecu(st.atsh, c); }
    return '?';
  }
  const notifyChar = { startNotifications: async () => {}, addEventListener: (_, f) => { listener = f; }, removeEventListener: () => { listener = null; } };
  const writeChar = { writeValueWithResponse: async (u8) => {
    if (u8.byteLength > 20) throw new DOMException('GATT write of ' + u8.byteLength + ' bytes (maximum 20)', 'NetworkError');
    inbuf += dec.decode(u8);
    let i; while ((i = inbuf.indexOf('\r')) >= 0) { const line = inbuf.slice(0, i); inbuf = inbuf.slice(i + 1);
      if (cfg.dropAt === line) { sent.push(line); setTimeout(() => window.__drop(), 10); continue; }
      if (cfg.dropAtNth && line === cfg.dropAtNth.line && ++st.dropCount === cfg.dropAtNth.n) { sent.push(line); setTimeout(() => window.__drop(), 10); continue; }
      const r = exec(line); if (r === null) continue;
      if (cfg.loseReplyOnce === line && !st.lost) { st.lost = true; continue; }
      emit(r + '\r\r>'); }
  } };
  const svc = { getCharacteristic: async u => (u === 0xfff2 ? writeChar : notifyChar) };
  let discFn = null;
  const server = { connected: true, getPrimaryService: async () => svc, disconnect() { this.connected = false; } };
  const dev = { name: 'OBDLink CX', addEventListener(_, f) { discFn = f; }, removeEventListener() {},
    gatt: { connect: async () => { server.connected = true; return server; } } };
  window.__drop = () => { server.connected = false; discFn && discFn(); };
  Object.defineProperty(Navigator.prototype, 'bluetooth', { value: { requestDevice: async () => { if (cfg.cancelChooser) throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError'); return dev; } }, configurable: true });
  window.__confirms = [];
  window.confirm = m => { window.__lastConfirm = m; window.__confirms.push(m); return !cfg.cancelConfirm; };
  if (cfg.blockStorage) { const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; }
  window.__alerts = []; window.alert = m => { window.__alerts.push(String(m)); };
})();
