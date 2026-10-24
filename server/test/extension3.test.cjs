'use strict';
// Runs the new connector (extension-3: background + Arabicss page scripts) against this server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { start } = require('./helpers.cjs');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch {}
const EXT = path.join(__dirname, '..', '..', 'extension-3');
const settle = ms => new Promise(r => setTimeout(r, ms));

const PAGES = {
  mainLogin: ['/index.php', '<div class="login-form"><form method="post"><input name="input_user" type="text"><input name="input_pass" type="password"><button name="submit_login" type="submit">Login</button></form></div>'],
  signedIn: ['/index.php', '<div id="issabel_framework_module_id"></div><a href="?logout=yes">Logout</a>'],
  agentLogin: ['/index.php?menu=agent_console', '<h1>Agent Console</h1><label>Callback Extension</label><input type="text" name="ext"><input type="password" name="pass"><button>Log in</button>'],
  console: ['/index.php?menu=agent_console', '<div id="issabel-callcenter-titulo-consola">Agent Console - SIP/101</div><div id="issabel-callcenter-cronometro">00:00:00</div><select id="break_select"><option value="2">Break</option></select><button id="btn_togglebreak">Break</button>'],
};

async function harness(t) {
  const read = f => fs.readFileSync(path.join(EXT, f), 'utf8').replace("API: 'https://marsad-v2.karim87nu.chatgpt.site'", "API: '" + t.base + "'");
  const store = {}, listeners = [], pageListeners = [];
  let current = '', w = null;
  const browser = {
    storage: { local: { get: async k => ({ [k]: structuredClone(store[k]) }), set: async o => { Object.assign(store, structuredClone(o)); } } },
    runtime: { onMessage: { addListener: f => listeners.push(f) }, getURL: x => 'moz-extension://x/' + x },
    tabs: { query: async () => [{ id: 7 }], onRemoved: { addListener() {} }, sendMessage: async (id, m) => { for (const f of pageListeners) f(structuredClone(m)); }, create() {} },
    browserAction: { onClicked: { addListener() {} } }, notifications: { create: async () => {} },
  };
  const bg = { console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, setInterval, performance, crypto: globalThis.crypto,
    Intl, Date, JSON, Math, Promise, Error, Number, String, Array, Object, Map, Set, structuredClone, DOMParser: class {}, fetch, browser };
  bg.globalThis = bg;
  vm.createContext(bg);
  for (const f of ['config.js', 'background.js']) vm.runInContext(read(f), bg, { filename: f });
  const toBackground = async m => { const sender = { tab: { id: 7 }, url: current }; for (const f of listeners) { const r = await f(structuredClone(m), sender); if (r !== undefined) return structuredClone(r); } };
  const es = { listeners: {} };
  async function open(name, { idle = true } = {}) {
    w?.close(); pageListeners.length = 0;
    const [route, body] = PAGES[name];
    current = 'https://41.38.207.218' + route;
    const dom = new JSDOM('<!doctype html><html><head></head><body>' + body + '</body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: current });
    w = dom.window;
    w.postMessage = (data, target) => { if (target === w.location.origin) setTimeout(() => w.dispatchEvent(new w.MessageEvent('message', { data, origin: w.location.origin, source: w })), 0); };
    w.browser = { runtime: { sendMessage: toBackground, getURL: x => 'moz-extension://x/' + x, onMessage: { addListener: f => pageListeners.push(f) } } };
    es.listeners = {};
    w.EventSource = class { constructor(url) { this.url = url; this.readyState = 1; } addEventListener(type, fn) { (es.listeners[type] ||= []).push(fn); } close() { this.readyState = 2; } };
    if (name === 'console') { w.evtSource = new w.EventSource('index.php?menu=agent_console&action=checkStatus'); w.estadoCliente = { break_id: null, callid: idle ? null : '1', calltype: null, waitingcall: false, onhold: false }; }
    // Scripts appended by the content script run in the page.
    const append = w.Node.prototype.appendChild, run = n => { if (n.tagName === 'SCRIPT') { w.eval(read('hook.js')); n.onload?.(); return true; } return false; };
    w.document.head.append = function (...n) { if (!run(n[0])) return w.Element.prototype.append.apply(this, n); };
    void append;
    for (const f of ['config.js', 'agent.js']) w.eval(read(f));
    await settle(1500);
    return w;
  }
  const sse = record => { for (const f of es.listeners.message || []) f({ data: JSON.stringify(record) }); };
  return { open, sse, store, get w() { return w; }, close: () => w?.close() };
}

test('extension 3: one password through the Arabicss logins, calls, breaks, messages, logout', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  const t = await start({ at: Date.now() });
  Object.defineProperty(t.clock, 'now', { get: () => Date.now(), set() {} });
  const h = await harness(t);
  try {
    const admin = await t.admin();
    const emp = await t.employee(admin);
    const sessions = () => t.app.db.raw.prepare('SELECT * FROM employee_sessions ORDER BY id').all();
    const events = () => t.app.db.raw.prepare('SELECT event_type, state, phone, duration_seconds FROM events ORDER BY id').all();

    // Password on the Arabicss sign-in page, submitted with Enter (form submit).
    let w = await h.open('mainLogin');
    const gate = w.document.getElementById('marsad-gate');
    assert.ok(gate, 'gate shown');
    gate.querySelector('input').value = '1234';
    gate.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await settle(1500);
    assert.equal(w.document.getElementById('marsad-gate'), null);
    assert.match(w.document.getElementById('marsad-box').textContent, /Ahmed/);

    await admin('POST', '/api/messages', { id: require('node:crypto').randomUUID(), title: 'تنبيه', message: 'اجتماع الساعة 3', recipients: 'all', hours: 4 });
    for (const page of ['signedIn', 'agentLogin']) {
      w = await h.open(page);
      assert.match(w.document.getElementById('marsad-box')?.textContent || '', /Ahmed/, 'still signed in on ' + page);
    }
    w = await h.open('console');
    await settle(2500);
    assert.equal(sessions().length, 1);
    assert.equal(sessions()[0].extension, '101');
    let live = (await admin('GET', '/api/live')).body.employees.find(p => p.employeeId === emp.id);
    assert.equal(live.state, 'ready');

    // Message shown once, acknowledged.
    await settle(500);
    const box = w.document.getElementById('marsad-messages');
    assert.match(box?.textContent || '', /اجتماع/);
    box.querySelector('button').click();
    await settle(800);
    assert.equal(w.document.getElementById('marsad-messages'), null);
    assert.ok(t.app.db.raw.prepare('SELECT acknowledged_at FROM message_recipients').get().acknowledged_at);

    // A call.
    w.estadoCliente.callid = '555';
    h.sse({ event: 'agentlinked', callid: '555', calltype: 'incoming', txt_contacto_telefono: '01001234567', queue: '2001' });
    await settle(2500);
    live = (await admin('GET', '/api/live')).body.employees.find(p => p.employeeId === emp.id);
    assert.equal(live.state, 'on_call');
    assert.equal(live.phone, '01001234567');
    w.estadoCliente.callid = null;
    h.sse({ event: 'agentunlinked', callid: '555' });
    await settle(2500);
    const day = require('../src/time.js').businessDay(Date.now());
    const d = (await admin('GET', '/api/day?date=' + day)).body;
    assert.equal(d.calls.length, 1);
    assert.equal(d.calls[0].complete, true);
    assert.equal(d.calls[0].phone, '01001234567');

    // Arabicss's own break button is held until the server gives a permission.
    let nativeClicks = 0;
    w.document.getElementById('btn_togglebreak').addEventListener('click', () => { nativeClicks++; });
    w.document.getElementById('btn_togglebreak').click();
    assert.equal(nativeClicks, 0, 'native break blocked without permission');
    await settle(5500);                                      // break policy loads
    const startBtn = [...w.document.querySelectorAll('#marsad-box [data-actions] button')].find(b => /بدء البريك/.test(b.textContent));
    assert.ok(startBtn, 'break button shown: ' + w.document.getElementById('marsad-box').textContent);
    startBtn.click();
    await settle(3000);
    assert.equal(nativeClicks, 1, 'native break opened with permission: ' + w.document.querySelector('[data-break-note]').textContent);
    const resume = [...w.document.querySelectorAll('#marsad-box [data-actions] button')].find(b => b.textContent === 'تأكيد بدء البريك');
    assert.ok(resume); resume.click(); await settle(1500); assert.equal(nativeClicks, 2, 'unused permission reopens native dialog');
    const cancel = [...w.document.querySelectorAll('#marsad-box [data-actions] button')].find(b => b.textContent === 'إلغاء السماح');
    assert.ok(cancel); cancel.click(); await settle(1500);
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM break_permissions WHERE used_at IS NOT NULL').get().n, 0, 'unused reservation never consumes a break');
    const retry = [...w.document.querySelectorAll('#marsad-box [data-actions] button')].find(b => b.textContent === 'بدء البريك');
    assert.ok(retry); retry.click(); await settle(1500); assert.equal(nativeClicks, 3, 'new permission after cancel');
    w.estadoCliente.break_id = '2';
    h.sse({ event: 'breakenter', break_id: '2' });
    await settle(2500);
    live = (await admin('GET', '/api/live')).body.employees.find(p => p.employeeId === emp.id);
    assert.equal(live.state, 'break');
    w.estadoCliente.break_id = null;
    h.sse({ event: 'breakexit' });
    await settle(2500);
    const types = events().map(e => e.event_type);
    assert.ok(types.includes('break_start') && types.includes('break_end'), types.join(','));
    assert.equal(t.app.db.raw.prepare('SELECT COUNT(*) n FROM break_permissions WHERE used_at IS NOT NULL').get().n, 1);

    // Arabicss logout ends the shift.
    h.sse({ event: 'agentloggedout' });
    await settle(2500);
    assert.equal(sessions()[0].revoke_reason, 'arabicss_logout');
    assert.ok(w.document.getElementById('marsad-gate'), 'gate back after logout');
    assert.equal(h.store.outbox.length, 0, 'outbox empty');
    assert.deepEqual(h.store.rejected || [], []);
  } finally { h.close(); await t.close(); }
});

test('extension 3 collector: linked from the admin page, sends the day history and the live queue', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  const http = require('node:http');
  const t = await start({ at: Date.now() });
  Object.defineProperty(t.clock, 'now', { get: () => Date.now(), set() {} });
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const reports = http.createServer(async (req, res) => {
    if (req.url.includes('get_inbound_calls_real_time')) return res.end('<tr>' + ['2001', '', 'Agent', '', '', '', '', '', '0:00:09', '0100', 'On Wait'].map(v => '<td>' + v + '</td>').join('') + '</tr>');
    const requested = new URLSearchParams(await new Promise(resolve => { let b = ''; req.on('data', c => b += c); req.on('end', () => resolve(b)); })).get('start_date');
    const parts = requested?.split('/'); const reportDate = parts ? parts[2] + '-' + parts[0] + '-' + parts[1] : date;
    const rows = [['2001', 'SIP/101', reportDate, '10:00:00', '10:02:00', '00:02:00', '00:00:04', '0111', 'Success', 'T']];
    res.end('<h6>1</h6><h5>All Inbound Calls</h5><table id="example23"><thead><tr>' + ['Queue', 'Agent', 'Call Date', 'Start Time', 'End Time', 'Duration', 'Wait Time', 'Caller ID', 'Status', 'Trunk'].map(v => '<th>' + v + '</th>').join('') + '</tr></thead><tbody>'
      + rows.map(r => '<tr>' + r.map(v => '<td>' + v + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
  });
  await new Promise(r => reports.listen(0, r));
  const root = 'http://127.0.0.1:' + reports.address().port + '/';
  try {
    const admin = await t.admin();
    const read = f => fs.readFileSync(path.join(EXT, f), 'utf8').replace("API: 'https://marsad-v2.karim87nu.chatgpt.site'", "API: '" + t.base + "'").replace("REPORTS_ROOT: 'https://41.38.207.218:11594/themes/arabicssReportsInclude/dark/'", "REPORTS_ROOT: '" + root + "'");
    const store = {}, listeners = [];
    const browser = { storage: { local: { get: async k => ({ [k]: structuredClone(store[k]) }), set: async o => { Object.assign(store, structuredClone(o)); } } },
      runtime: { onMessage: { addListener: f => listeners.push(f) }, getURL: x => 'moz-extension://x/' + x },
      tabs: { query: async () => [], onRemoved: { addListener() {} }, sendMessage: async () => {} }, browserAction: { onClicked: { addListener() {} } }, notifications: { create: async () => {} } };
    const { JSDOM: J } = require('jsdom'), parser = new J('').window.DOMParser;
    const bg = { console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, setInterval, performance, crypto: globalThis.crypto, Intl, Date, JSON, Math, Promise, Error, Number, String, Array, Object, Map, Set, structuredClone, DOMParser: parser, fetch, browser };
    bg.globalThis = bg; vm.createContext(bg);
    for (const f of ['config.js', 'background.js']) vm.runInContext(read(f), bg, { filename: f });
    const tok = (await admin('POST', '/api/history', { action: 'token' })).body;
    const send = async (m, url) => { for (const f of listeners) { const r = await f(m, { url }); if (r !== undefined) return r; } };
    assert.equal((await send({ type: 'COLLECTOR_LINK', ...tok }, 'https://karim87nu-create.github.io/marsad-kpi/v2/')).ok, true);
    for (let i = 0; i < 100; i++) { const status = await send({ type: 'COLLECTOR_STATUS' }, 'moz-extension://x/collector.html'); if (status.lastHistory && status.lastLive) break; await settle(100); }
    const h = (await admin('GET', '/api/history?date=' + require('../src/time.js').businessDay(Date.now()))).body;
    assert.equal(h.live.records.length, 1);
    assert.equal(h.live.stale, false);
    const status = await send({ type: 'COLLECTOR_STATUS' }, 'moz-extension://x/collector.html');
    assert.equal(status.linked, true, JSON.stringify(status));
    assert.ok(status.lastHistory, JSON.stringify(status));
    assert.ok(t.app.db.raw.prepare('SELECT COUNT(*) n FROM history_reports').get().n >= 1);
    // Another site cannot link a collector.
    await assert.rejects(send({ type: 'COLLECTOR_LINK', ...tok }, 'https://evil.example/'));
  } finally { reports.close(); await t.close(); }
});
