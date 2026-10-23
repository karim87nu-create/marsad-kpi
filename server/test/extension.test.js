'use strict';
// Runs the real extension (background + agent page scripts) against this server:
// employee logs in with the PIN, Arabicss sends call/break events, the admin sees them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { start, DEVICE } = require('./helpers');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch {}
const EXT = path.join(__dirname, '..', '..', 'extension-2.5.34');
const OLD_API = 'https://marsad-kpi-live.karim87nu.chatgpt.site';

test('real extension 2.5.34 talks to the new server', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  // Real clock: the extension measures time with performance.now().
  const t = await start({ at: Date.now() });
  t.clock.now = Date.now();
  Object.defineProperty(t.clock, 'now', { get: () => Date.now(), set() {} });
  const read = f => fs.readFileSync(path.join(EXT, f), 'utf8').split(OLD_API).join(t.base);
  const errors = [];
  let w;
  try {
    const admin = await t.admin();
    await t.employee(admin);

    // ---- background page (Node vm with a fake WebExtension API) ----
    const store = {}, listeners = [];
    const browser = {
      storage: { local: { get: async k => ({ [k]: structuredClone(store[k]) }), set: async o => { Object.assign(store, structuredClone(o)); }, remove: async k => { delete store[k]; } } },
      runtime: { onStartup: { addListener() {} }, onMessage: { addListener: f => listeners.push(f) }, getURL: x => 'moz-extension://x/' + x, id: 'x' },
      tabs: { query: async () => [{ id: 7, url: 'https://41.38.207.218/index.php' }], onRemoved: { addListener() {} } },
      browserAction: { onClicked: { addListener() {} } }, notifications: { create: async () => {} },
    };
    const bg = { console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, setInterval: () => 0, performance, crypto: globalThis.crypto,
      Intl, Date, JSON, Math, Promise, Error, Number, String, Array, Object, Map, Set, structuredClone, DOMParser: class {}, fetch, browser };
    bg.globalThis = bg;
    vm.createContext(bg);
    for (const f of ['availability.js', 'native-live-capture.js', 'background.js', 'message-notifications.js']) vm.runInContext(read(f), bg, { filename: f });
    const sender = { tab: { id: 7 }, url: 'https://41.38.207.218/index.php?menu=agent_console' };
    const toBackground = async message => {
      for (const f of listeners) { const r = await f(structuredClone(message), sender); if (r !== undefined) return structuredClone(r); }
    };

    // ---- agent console page (jsdom) with the content scripts ----
    const vc = new VirtualConsole();
    vc.on('jsdomError', err => errors.push(String(err.message).slice(0, 300)));
    const page = '<!doctype html><html><body><div id="issabel-callcenter-titulo-consola">Agent Console - SIP/101</div><div id="issabel-callcenter-cronometro">00:00:00</div><a href="?logout=yes">x</a></body></html>';
    const dom = new JSDOM(page, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'https://41.38.207.218/index.php?menu=agent_console' });
    w = dom.window;
    // jsdom leaves MessageEvent.origin empty; browsers set it to the sender's origin.
    w.postMessage = (data, target) => { if (target === w.location.origin) setTimeout(() => w.dispatchEvent(new w.MessageEvent('message', { data, origin: w.location.origin, source: w })), 0); };
    w.browser = { runtime: { sendMessage: toBackground, getURL: x => 'moz-extension://x/' + x } };
    const esListeners = {};
    w.EventSource = class { constructor(url) { this.url = url; this.readyState = 1; } addEventListener(type, fn) { (esListeners[type] ||= []).push(fn); } close() { this.readyState = 2; } };
    w.evtSource = new w.EventSource('index.php?menu=agent_console&action=checkStatus');
    w.estadoCliente = { break_id: null, callid: null, calltype: null, waitingcall: false, onhold: false };
    w.document.documentElement.appendChild = (orig => function (n) { if (n.tagName === 'SCRIPT') { w.eval(read('page-hook.js')); n.onload?.(); return n; } return orig.call(this, n); })(w.document.documentElement.appendChild);
    for (const f of ['availability.js', 'content.js', 'employee-messages.js', 'break-requests.js']) w.eval(read(f));
    const settle = ms => new Promise(r => setTimeout(r, ms));
    // Deliver through the stream exactly like Arabicss does; page-hook relays it to the content script.
    const sse = record => { for (const f of esListeners.message || []) f({ data: JSON.stringify(record) }); };
    await settle(1500);

    // Employee enters the PIN on the gate and starts the shift.
    const $ = id => w.document.getElementById(id);
    assert.ok($('kpi-pin'), 'login gate shown');
    $('kpi-pin').value = '1234';
    $('kpi-start').click();
    await settle(2000);
    assert.match($('kpi-name').textContent, /Ahmed/, 'employee logged in: ' + $('kpi-error')?.textContent);
    sse({ event: 'agentloggedin' });
    await settle(1500);                                   // page-hook posts arabicss_state every second

    let p = (await admin('GET', '/api/dashboard?live=1')).body.presence[0];
    assert.equal(p.extension, '101');
    assert.equal(p.state, 'ready', 'ready after idle snapshot');

    // Call arrives from Arabicss.
    w.estadoCliente.callid = '555';
    sse({ event: 'agentlinked', callid: '555', calltype: 'incoming', txt_contacto_telefono: '01001234567', queue: '2001' });
    await settle(2500);
    p = (await admin('GET', '/api/dashboard?live=1')).body.presence[0];
    assert.equal(p.state, 'on_call');
    assert.equal(p.phone, '01001234567');
    w.estadoCliente.callid = null;
    sse({ event: 'agentunlinked', callid: '555' });
    await settle(2500);
    const d = (await admin('GET', '/api/dashboard?date=' + require('../src/time').businessDay(Date.now()))).body;
    assert.equal(d.calls.length, 1);
    assert.equal(d.calls[0].eventType, 'agentunlinked');
    assert.equal(d.presence[0].state, 'ready');

    // Break panel reads the policy from the server.
    await settle(5500);
    assert.match($('kpi-break-request')?.querySelector('[data-policy]')?.textContent || '', /البريكات العادية: 0 من 2/);
    assert.equal(store.arabicss_kpi_offline_queue?.length || 0, 0, 'no events stuck in the offline queue');
    assert.deepEqual(store.kpi_rejected_events || [], [], 'no rejected events');
  } finally {
    w?.close();
    await t.close();
  }
  const failed = errors.filter(x => !/Not implemented/.test(x));
  assert.deepEqual(failed, [], 'page errors');
});
