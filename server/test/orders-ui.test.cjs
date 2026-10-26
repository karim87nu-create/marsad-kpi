'use strict';
// The admin page: the two sections, the branches' live board, the reports, the order-entry view, the monitor key and the branch group.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom'); const { start } = require('./helpers.cjs');

const cairoDay = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); const d = p.year + '-' + p.month + '-' + p.day; return +p.hour < 9 ? new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10) : d; };

test('admin page: مرصد الدهان sections, live branches board, reports, order entry, monitor key', async () => {
  const t = await start({ at: Date.now() }); let dom;
  try {
    await t.admin();
    const token = await t.login();
    const day = cairoDay(), ago = m => new Date(Date.now() - m * 60000).toISOString();
    const k = (h, tal = 0) => ({ Hotline: h, 'طلبات': tal, 'الموقع': 0, 'وفرها': 0 });
    const push = (await t.call('POST', '/api/orders/token', { headers: { 'x-admin-password': token } })).body.token;
    const payload = { v: 1, day, generatedAt: ago(0), settings: { late: 30, veryLate: 45 },
      totals: { orders: 5, sales: 1500, kinds: k(3, 2), open: 3, late: 2, avgOut: 22, outCount: 2, cancels: 1, cancelSales: 300, discounts: 50, issues: 1 },
      branches: [{ no: 1, name: 'التجمع', orders: 3, sales: 900, kinds: k(2, 1), open: 2, late: 1, veryLate: 1, avgOut: 25, outLate: 1, outCount: 2, cancels: 1, cancelSales: 300 },
        { no: 2, name: 'مدينتي', orders: 2, sales: 600, kinds: k(1, 1), open: 1, late: 1, veryLate: 0, avgOut: null, outLate: 0, outCount: 0, cancels: 0, cancelSales: 0 }],
      open: [{ no: 101, branch: 'التجمع', kind: 'Hotline', at: ago(50), wait: 50, user: 'سارة', amount: 200 }, { no: 102, branch: 'التجمع', kind: 'طلبات', at: ago(5), wait: 5, user: 'سارة', amount: 150 },
        { no: 201, branch: 'مدينتي', kind: '', at: ago(33), wait: 33, user: 'أحمد', amount: 120 }],
      staff: [{ name: 'سارة', orders: 3, kinds: k(2, 1), sales: 900, discounts: 50, issues: 1, cancels: 1, first: ago(300), last: ago(5) }, { name: 'أحمد', orders: 2, kinds: k(1, 1), sales: 600, discounts: 0, issues: 0, cancels: 0, first: ago(200), last: ago(33) }],
      hours: [{ h: 13, orders: 3, kinds: k(2, 1) }, { h: 14, orders: 2, kinds: k(1, 1) }],
      cancels: [{ no: 99, branch: 'التجمع', kind: 'Hotline', amount: 300, user: 'سارة', by: 'المدير', pilot: 'طيار 1', at: ago(20), afterOut: 12, reason: 'العميل رفض' }],
      issues: [{ type: 'دفع', no: 102, branch: 'التجمع', kind: 'طلبات', user: 'سارة', at: ago(5), detail: 'مسجل TALABAT VISA وطريقة الدفع Cash' }],
      lateOut: [{ no: 88, branch: 'التجمع', kind: 'Hotline', at: ago(100), out: ago(60), wait: 40, pilot: 'طيار 2', user: 'سارة', amount: 180 }] };
    assert.equal((await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': push }, body: payload })).status, 200);

    const root = path.join(__dirname, '../../sites/public/admin');
    dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'http://localhost/admin/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, doc = w.document; w.sessionStorage.setItem('marsadAdminToken', token); w.MARSAD_API = t.base; w.fetch = (u, o) => fetch(u, { ...o, signal: undefined }); // Node fetch needs its own AbortSignal realm.
    w.confirm = () => true; w.alert = x => { throw Error(x); };
    for (const f of ['charts.js', 'now-arc.js', 'xlsx.js', 'orders.js', 'site.js', 'app.js']) w.eval(fs.readFileSync(path.join(root, f), 'utf8'));
    const until = async (f, what) => { for (let i = 0; i < 300; i++) { if (f()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('UI did not finish: ' + what + ' ' + doc.getElementById('error').textContent + ' / ' + doc.getElementById('title').textContent + ' / ' + doc.getElementById('boardRoot').textContent.slice(0, 300)); };
    await until(() => !doc.getElementById('app').hidden && doc.getElementById('title').textContent === 'الآن' && doc.getElementById('sync').textContent.includes('آخر تحديث'), 'login');
    assert.equal(doc.title.includes('مرصد الدهان'), true);
    assert.equal(doc.querySelector('[data-sec="branches"]').hidden, true, 'branches views hidden in the call center section');

    // Switching section opens the live board.
    doc.querySelector('[data-section="branches"]').click();
    await until(() => doc.querySelectorAll('#boardRoot .ob-t').length === 3, 'board tickets');
    assert.equal(doc.querySelector('[data-sec="calls"]').hidden, true);
    await until(() => doc.querySelector('#boardRoot .ob-t.red'), 'red ticket');
    assert.equal(doc.querySelectorAll('#boardRoot .ob-t.late').length, 1);
    assert.match(doc.querySelector('#boardRoot .ob-word').textContent, /تأخير شديد/);
    assert.match(doc.getElementById('boardRoot').textContent, /Hotline/, 'no online mark is shown as Hotline');
    assert.equal(doc.getElementById('lateBadge').textContent, '2');

    doc.querySelector('[data-view="branches"]').click();
    await until(() => doc.getElementById('branchTable').textContent.includes('مدينتي'), 'branch report');
    assert.match(doc.getElementById('lateOutTable').textContent, /طيار 2/);
    doc.querySelector('[data-view="cancels"]').click();
    await until(() => doc.getElementById('cancelTable').textContent.includes('العميل رفض'), 'cancels');

    // Call center: order entry.
    doc.querySelector('[data-section="calls"]').click();
    await until(() => doc.getElementById('title').textContent === 'الآن', 'back to calls');
    doc.querySelector('[data-view="entry"]').click();
    await until(() => doc.getElementById('entryStaff').textContent.includes('أحمد'), 'entry staff');
    assert.match(doc.getElementById('entryIssues').textContent, /TALABAT VISA/);

    // Manage: the monitor key and the branch group.
    doc.querySelector('[data-view="manage"]').click();
    await until(() => /آخر إرسال/.test(doc.getElementById('ordersKeyStatus').textContent), 'key status');
    doc.getElementById('ordersKeyMake').click();
    await until(() => /^ord_[a-f0-9]{48}$/.test(doc.getElementById('ordersKeyValue').value), 'new key');
    assert.equal((await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': push }, body: payload })).status, 401, 'old key stops');
    assert.equal((await t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': doc.getElementById('ordersKeyValue').value }, body: payload })).status, 200);
    await until(() => /جروب إدارات الفروع/.test(doc.getElementById('tgStatus').textContent), 'telegram groups');
    assert.ok(doc.getElementById('tgChooseBranches'));
    assert.ok(doc.getElementById('tgChooseOnline'));
    assert.match(doc.getElementById('tgStatus').textContent, /جروب الكول سنتر — الأونلاين وضرب الأوردر/);
    const tt = (await t.call('POST', '/api/talabat/token', { headers: { 'x-admin-password': token } })).body.token;
    await t.call('POST', '/api/talabat/push', { headers: { 'x-talabat-token': tt }, body: { orders: [{ id: '3977407954', store: 'الدهان, مدينتي - ساوث بارك', status: 'CANCELLED', placedAt: ago(40), total: 323,
      detail: { receivedAt: ago(40), acceptSeconds: 9, acceptedAt: ago(39), pickedUpAt: ago(35), cancelledAt: ago(5), cancelOwner: 'Customer', cancelReason: 'Unable to find or reach customer', items: [{ qty: 1, name: 'Stuffed Pigeon', price: 323 }], subtotal: 323 } }] } });
    doc.querySelector('[data-view="talabat"]').click();
    await until(() => doc.getElementById('talOrders').textContent.includes('3977407954') && doc.getElementById('talCancels').textContent.includes('Unable to find'), 'talabat view');
    assert.match(doc.getElementById('talCancels').textContent, /العميل/);
    for (const [v, id, text] of [['siteTransfer', 'siteTTable', 'الموقع مش متربط']]) {
      doc.querySelector('[data-view="' + v + '"]').click();
      await until(() => doc.getElementById(id).textContent.includes(text), v);
    }
    doc.querySelector('[data-section="branches"]').click(); await until(() => !doc.querySelector('[data-sec="branches"]').hidden, 'branches');
    doc.querySelector('[data-view="siteBranches"]').click();
    await until(() => doc.getElementById('siteBTable').textContent.includes('الموقع مش متربط'), 'siteBranches');
    assert.equal(doc.getElementById('error').hidden, true, doc.getElementById('error').textContent);
  } finally { await new Promise(r => setTimeout(r, 150)); dom?.window.close(); await t.close(); }
});
