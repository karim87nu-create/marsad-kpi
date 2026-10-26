'use strict';
// The desk gate and the Talabat Live Orders reader (extension-3/desk.js) on a page shaped like the real one.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom'); const { start, DEVICE } = require('./helpers.cjs');
const EXT = path.join(__dirname, '..', '..', 'extension-3');

const LIVE = `<header><h1>Live Orders</h1></header><main>
<section><h2>New</h2><h3>1</h3><div class="card"><div>#2704</div><div><span>3977424999</span></div><div>3 items</div><div>120</div></div></section>
<section><h2>Accepted</h2><h3>1</h3><div class="card"><div>#2703</div><div><span>3977424562</span></div><div>2 items</div><div>57</div><div>unknown unknown</div><button>Ready</button></div></section></main>`;

test('desk page: gate blocks Talabat until the desk password, then the live columns reach the server', async () => {
  const t = await start({ at: Date.now() }); let dom;
  try {
    const admin = await t.admin();
    const a = await t.employee(admin, { name: 'سارة', code: 'E1', pin: '1' });
    await admin('PATCH', '/api/desks/pin', { employeeId: a.id, desk: 'talabat', pin: '7', pinConfirmation: '7' });
    let token = null;
    const call = (p, body) => t.call('POST', p, { headers: { 'x-device-token': DEVICE, ...(token ? { 'x-desk-session': token } : {}) }, body });
    // The background's desk part, against the real server.
    const sendMessage = async m => {
      if (m.type === 'DESK_WHO') return null;
      if (m.type === 'DESK_LOGIN') { const r = await call('/api/desks/login', { desk: m.desk, pin: m.pin, place: m.place, device: 'x' }); if (!r.body.token) return { ok: false, error: r.body.error }; token = r.body.token; return { ok: true, who: r.body.employee }; }
      if (m.type === 'DESK_TALABAT') return { ok: (await call('/api/talabat/push', { account: m.account, orders: m.orders })).status === 200 };
      if (m.type === 'DESK_BEAT') return { ok: true };
    };
    dom = new JSDOM('<!doctype html><html><body>' + LIVE + '</body></html>', { url: 'https://partner-app.talabat.com/live-orders', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window; w.browser = { runtime: { sendMessage } }; w.localStorage.setItem('lastLoginEmail', 'tagamoa@eldahan.com');
    w.eval(fs.readFileSync(path.join(EXT, 'desk.js'), 'utf8'));
    const until = async (f, what) => { for (let i = 0; i < 300; i++) { if (await f()) return; await new Promise(r => setTimeout(r, 20)); } throw Error('timeout: ' + what); };
    await until(() => w.document.getElementById('marsad-desk-gate'), 'gate');
    const form = w.document.querySelector('#marsad-desk-gate form'), pin = form.querySelector('input');
    pin.value = '9'; form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await until(() => /غلط|invalid/.test(form.querySelector('.error').textContent), 'wrong password message');
    pin.value = '7'; form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await until(() => w.document.getElementById('marsad-desk-chip'), 'signed in');
    assert.equal(w.document.getElementById('marsad-desk-gate'), null);
    assert.match(w.document.getElementById('marsad-desk-chip').textContent, /سارة/);
    await until(async () => (await admin('GET', '/api/talabat/day')).body.orders.length === 2, 'orders pushed');
    const d = (await admin('GET', '/api/talabat/day')).body.orders;
    const o = Object.fromEntries(d.map(x => [x.id, x]));
    assert.equal(o['3977424562'].column, 'accepted'); assert.equal(o['3977424562'].code, '2703'); assert.equal(o['3977424562'].acceptedBy, 'سارة');
    assert.equal(o['3977424999'].column, 'new'); assert.equal(o['3977424999'].account, 'tagamoa@eldahan.com');
    const s = (await admin('GET', '/api/desks')).body.sessions[0];
    assert.equal(s.place, 'tagamoa@eldahan.com');
  } finally { dom?.window.close(); await t.close(); }
});
