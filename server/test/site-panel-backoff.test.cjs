'use strict';
// 11-19: the website refused every device on the network. The panel's own extra pushes must back off, not repeat.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../../extension-3/site-panel.js'), 'utf8');

function page(store = {}) {
  const clock = store.__clock || (store.__clock = { now: 1e12 }); let tick, reloads = 0, clicks = 0, onMsg;
  const btn = { disabled: false, click() { clicks++; } };
  const document = { head: { append() {} }, documentElement: { append() {} }, createElement: () => ({ remove() {} }), activeElement: null, body: {},
    querySelectorAll: s => (/refresh/.test(s) ? [btn] : []), querySelector: () => null };
  const win = { __marsadSitePanel: undefined, addEventListener: (t, f) => { if (t === 'message') onMsg = f; } };
  const ctx = { window: win, document, location: { pathname: '/eldahan-operations-central/', reload() { reloads++; } }, MARSAD: { VERSION: 't' },
    browser: { runtime: { getURL: x => x, sendMessage: () => Promise.resolve({ ok: true }) } },
    sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    setInterval: f => { tick = f; }, Date: { now: () => clock.now }, Event: class {}, JSON, Math, Number, Map, Set };
  ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(src, ctx);
  return { advance(ms) { for (let i = 0; i < ms; i += 5000) { clock.now += 5000; tick(); } }, get reloads() { return reloads; }, get clicks() { return clicks; },
    list() { onMsg({ source: win, data: { __marsadSite: 1, data: { orders: [] } } }); } };
}

test('silent panel: reload gaps double (2, 4, 8 min) and survive the reload; a list resets them', () => {
  const store = {};
  let p = page(store); p.advance(2 * 60000 + 10000); assert.equal(p.reloads, 1);
  p = page(store); p.advance(3 * 60000); assert.equal(p.reloads, 0, 'second gap is 4 min, not 2');
  p.advance(61000 + 5000); assert.equal(p.reloads, 1);
  p = page(store); p.advance(7 * 60000); assert.equal(p.reloads, 0, 'third gap is 8 min');
  p.list(); p.advance(2 * 60000 + 10000); assert.equal(p.reloads, 1, 'after a list, back to 2 min');
});

test('silent panel: refresh button presses back off instead of every 10 s', () => {
  const p = page(); p.advance(60000);
  assert.ok(p.clicks >= 1 && p.clicks <= 2, 'few presses in the first minute, got ' + p.clicks);
});
