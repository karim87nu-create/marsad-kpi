'use strict';
// 11-19: the website refused every device on the network. The panel's own extra pushes must back off, not repeat.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../../extension-3/site-panel.js'), 'utf8');

function page(store = {}) {
  const clock = store.__clock || (store.__clock = { now: 1e12 }); let tick, reloads = 0, clicks = 0, onMsg;
  const btn = { disabled: false, click() { clicks++; } };
  const document = { head: { append() {} }, documentElement: { append() {} }, createElement: () => ({ remove() {} }), activeElement: null, body: {}, addEventListener() {},
    querySelectorAll: s => (/refresh/.test(s) ? [btn] : []), querySelector: () => null };
  const win = { __marsadSitePanel: undefined, addEventListener: (t, f) => { if (t === 'message') onMsg = f; } };
  const ctx = { window: win, document, location: { pathname: '/eldahan-operations-central/', reload() { reloads++; } }, MARSAD: { VERSION: 't' },
    browser: { runtime: { getURL: x => x, sendMessage: () => Promise.resolve({ ok: true }) } },
    sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    setInterval: f => { tick = f; }, Date: { now: () => clock.now }, Event: class {}, URLSearchParams, JSON, Math, Number, Map, Set };
  ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(src, ctx);
  return { advance(ms) { for (let i = 0; i < ms; i += 5000) { clock.now += 5000; tick(); } }, get reloads() { return reloads; }, get clicks() { return clicks; },
    list() { onMsg({ source: win, data: { __marsadSite: 1, data: { orders: [] } } }); },
    expired() { onMsg({ source: win, data: { __marsadSite: 1, authExpired: true } }); } };
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

test('branch panel selects only a unique Apex pilot and submits through the website controls', async () => {
  const { JSDOM } = require('jsdom');
  const run = async (names, driver = 'زياد علي') => {
    const dom = new JSDOM(`<button data-order="31837" data-action="prepare">Prepare</button>
      <button data-order="31837" data-action="ready-pickup" disabled>Ready</button>
      <button data-order="31837" data-action="dispatch" disabled>Dispatch</button>`,
    { runScripts: 'outside-only', url: 'https://eldahan.com.eg/eldahan-branch-board/?branch=tagamoa-cloud' });
    const { window: w } = dom;
    try {
      const actions = [], button = action => w.document.querySelector(`[data-action="${action}"]`);
      w.setInterval = () => {};
      w.MARSAD = { VERSION: "test" };
      w.browser = { runtime: { getURL: x => '/' + x, sendMessage: async msg => {
        assert.equal(msg.dispatchFromApex, true);
        return { ok: true, dispatch: [{ orderId: 31837, driver }] };
      } } };
      button('prepare').onclick = () => {
        actions.push('prepare'); button('prepare').disabled = true; button('ready-pickup').disabled = false;
      };
      button('ready-pickup').onclick = () => {
        actions.push('ready'); button('ready-pickup').disabled = true; button('dispatch').disabled = false;
      };
      button('dispatch').onclick = () => {
        actions.push('dispatch');
        w.document.body.insertAdjacentHTML('beforeend', `<input data-driver-search="31837" list="drivers">
          <datalist id="drivers">${names.map(n => `<option value="${n}"></option>`).join('')}</datalist>
          <button data-order="31837" data-action="dispatch-submit" disabled>Submit</button>`);
        const input = w.document.querySelector('input');
        input.addEventListener('input', () => { button('dispatch-submit').disabled = !names.includes(input.value); });
        button('dispatch-submit').onclick = () => { actions.push(input.value); button('dispatch-submit').disabled = true; };
        input.focus();
      };
      w.eval(src);
      w.dispatchEvent(new w.MessageEvent('message', { source: w, data: { __marsadSite: 1, data: { orders: [{ id: 31837 }] } } }));
      await new Promise(resolve => setImmediate(resolve));
      return actions;
    } finally { w.close(); }
  };
  assert.deepEqual(await run(['زياد على - 01000000001', 'زياد محمد - 01000000002']), ['prepare', 'ready', 'dispatch', 'زياد على - 01000000001']);
  assert.deepEqual(await run(['زياد على - 01000000001', 'زياد علي - 01000000002']), ['prepare', 'ready', 'dispatch']);
  assert.deepEqual(await run(['زياد محمد - 01000000002']), ['prepare', 'ready', 'dispatch']);
  assert.deepEqual(await run(['رامي رمضان ابراهيم - 01000000001', 'محمود علي - 01000000002'], 'رامي'), ['prepare', 'ready', 'dispatch', 'رامي رمضان ابراهيم - 01000000001']);
  assert.deepEqual(await run(['رامي رمضان ابراهيم - 01000000001', 'رامي علي - 01000000002'], 'رامي'), ['prepare', 'ready', 'dispatch']);
  assert.deepEqual(await run(['عمر عبدالرحمن محمد - 01000000001'], 'عمر عبد الرحمن التجمع'), ['prepare', 'ready', 'dispatch', 'عمر عبدالرحمن محمد - 01000000001']);
  assert.deepEqual(await run(['أحمد علي زياد - 01000000001'], 'زياد'), ['prepare', 'ready', 'dispatch']);
  assert.deepEqual(await run(['زياد علي - 01000000001'], 'زياد علي مدينتي'), ['prepare', 'ready', 'dispatch']);

});

test('a WordPress nonce rejection reloads immediately and does not loop across fresh pages', () => {
  const store = {};
  let p = page(store);
  p.expired(); p.advance(5000);
  assert.equal(p.reloads, 1);
  p = page(store);
  p.expired(); p.advance(30000);
  assert.equal(p.reloads, 0);
  p.list(); p.advance(5000);
  assert.equal(p.reloads, 0);
});
