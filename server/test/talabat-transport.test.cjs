const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const ext = path.join(__dirname, '../../extension-3');
function background(linked = true, tabs = [{ id: 7, url: 'https://partner-app.talabat.com/orders' }]) {
  const data = linked ? { talabatMonitor: { token: 'tal_' + 'a'.repeat(48), extra: linked === 'extra' } } : {};
  const listeners = [], installed = [], startup = [], injected = [], requests = [], created = [];
  const ctx = { URL, URLSearchParams, Date, Intl, performance, AbortController, setTimeout, clearTimeout, setInterval: () => 0,
    console, crypto: globalThis.crypto, structuredClone,
    fetch: async (url, options) => { requests.push({ url, body: options.body }); return new Response(JSON.stringify({ ok: true, want: ['12345678'] }), { headers: { date: new Date().toUTCString() } }); },
    browser: { storage: { local: { get: async k => ({ [k]: data[k] }), set: async x => Object.assign(data, x) } },
      runtime: { onMessage: { addListener: f => listeners.push(f) }, onInstalled: { addListener: f => installed.push(f) }, onStartup: { addListener: f => startup.push(f) }, getURL: p => 'moz-extension://test/' + p },
      tabs: { query: async () => tabs, onRemoved: { addListener() {} },
        executeScript: async (id, x) => injected.push(x.file), get: async () => ({}), create: async options => {
          const tab = { id: 100 + created.length, ...options };
          created.push(tab); tabs.push(tab); return tab;
        } },
      browserAction: { onClicked: { addListener() {} } } } };
  vm.createContext(ctx); for (const f of ['config.js', 'background.js']) vm.runInContext(fs.readFileSync(path.join(ext, f), 'utf8'), ctx);
  const send = (type, url = 'https://partner-app.talabat.com/orders', extra = {}) => listeners[0]({ type, ...extra }, { tab: { id: 7 }, url });
  return { send, requests, installed, startup, injected, created };
}
test('Talabat clock reaches the actual background listener and enables a timestamped push', async () => {
  const h = background();
  await assert.rejects(h.send('CLOCK'), /invalid_sender/, 'the generic Arabicss clock remains restricted');
  const source = fs.readFileSync(path.join(ext, 'talabat-monitor.js'), 'utf8');
  const code = source.slice(source.indexOf('  async function push(orders)'), source.indexOf('  // The table only draws'));
  const push = new Function('bg', 'say', 'let failures=0,want=[],phonesWanted=false;' + code + ';return push;')(
    m => h.send(m.type, undefined, m), () => {});
  assert.equal(await push([{ id: '12345678' }]), true);
  const pushed = h.requests.find(x => x.url.endsWith('/api/talabat/push'));
  assert.ok(Number.isFinite(Date.parse(JSON.parse(pushed.body).orders[0].observedAt)));
  await assert.rejects(h.send('TALABAT_CLOCK', 'https://example.com/'), /invalid_sender/);
  await assert.rejects(h.send('TALABAT_CLOCK', 'https://web.whatsapp.com/'), /invalid_sender/);
  await assert.rejects(background(false).send('TALABAT_CLOCK'), /invalid_sender/);
});
test('a connector update resumes linked Talabat tabs without changing the source account', async () => {
  const h = background(); await h.installed[0]({ reason: 'update' });
  assert.deepEqual(h.injected, ['config.js', 'names.js', 'talabat-monitor.js']);
  const unlinked = background(false); await unlinked.installed[0]({ reason: 'update' }); assert.equal(unlinked.injected.length, 0);
  // 11-19: a branch's Live Orders tab (no link) and the website's central panel get their scripts back too.
  const live = background(false, [{ id: 5, url: 'https://partner-app.talabat.com/live-orders' }]); await live.installed[0]({ reason: 'update' });
  assert.deepEqual(live.injected, ['config.js', 'names.js', 'talabat-monitor.js']);
  const site = background(false, [{ id: 6, url: 'https://eldahan.com.eg/eldahan-operations-central/' }, { id: 4, url: 'https://eldahan.com.eg/menu/' }]); await site.installed[0]({ reason: 'update' });
  assert.deepEqual(site.injected, ['config.js', 'site-panel.js']);
});
test('the monitor opens missing website boards in the background without duplicating restored tabs', async () => {
  const central = 'https://eldahan.com.eg/eldahan-operations-central/';
  const branch = 'https://eldahan.com.eg/eldahan-branch-board/?branch=';
  const h = background(false, [
    { id: 6, url: central + '#orders', windowId: 3 },
    { id: 7, pendingUrl: branch + 'nasr-city', windowId: 3 },
    { id: 8, url: branch + 'tagamoa-cloud', incognito: true, windowId: 4 },
  ]);
  await Promise.all([h.installed[0]({ reason: 'update' }), h.startup[0](), h.startup[0]()]);
  assert.deepEqual(h.created.map(t => t.url), [branch + 'tagamoa-cloud', branch + 'madinaty-craft-zone']);
  assert.ok(h.created.every(t => t.active === false && t.windowId === 3));

  const monitor = background(true);
  await monitor.startup[0]();
  assert.deepEqual(monitor.created.map(t => t.url), [central, branch + 'tagamoa-cloud', branch + 'nasr-city', branch + 'madinaty-craft-zone']);

  for (const linked of [false, 'extra']) {
    const other = background(linked, [{ id: 9, url: branch + 'tagamoa-cloud' }]);
    await other.startup[0]();
    assert.equal(other.created.length, 0);
  }
});
test('a connector update resumes the linked WhatsApp sender on an already open tab', async () => {
  const h = background(true, [{ id: 9, url: 'https://web.whatsapp.com/' }]);
  await h.installed[0]({ reason: 'update' });
  assert.deepEqual(h.injected, ['config.js', 'whatsapp-sender.js']);
});
test('list status survives changing column order and never becomes an order number', () => {
  const source = fs.readFileSync(path.join(ext, 'talabat-monitor.js'), 'utf8');
  const read = source.slice(source.indexOf('  function readList()'), source.indexOf('  function readDetail('));
  const dom = new JSDOM('<div class="MuiDataGrid-row" data-id="store|12345678"><span>DELIVERED</span><span>12345678</span><span>Today, 20:00</span><span>EGP 100</span></div>', { runScripts: 'outside-only' });
  const w = dom.window; Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return [...this.childNodes].map(n => n.textContent).join('\n'); } });
  const run = () => w.eval('(()=>{ const lines=e=>e.innerText.split("\\n"); const rowTime=()=>1; const money=()=>100;' + read + ';return readList()[0].status; })()');
  assert.equal(run(), 'DELIVERED');
  w.document.querySelector('span').textContent = 'vendor'; assert.equal(run(), '');
  w.close();
});
