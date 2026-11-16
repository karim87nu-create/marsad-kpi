'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

// Karim 11-16 «وقف الأصناف … على طلبات وموجوده علي ابيكس أو العكس … والموقع»: the three side by side, differences told.
test('stopped dishes: Apex vs Talabat vs the website, a difference told once after 15 minutes', async () => {
  const site = [{ id: 501, name: 'فتة لحمة', stock_status: 'instock' }, { id: 502, name: 'Feast Platter', stock_status: 'outofstock' }];
  const puts = [];
  const t = await start({ at: cairoToUtc(2026, 11, 16, 14, 0, 0), config: { siteFetch: async (url, o) => {
    if (o?.method === 'PUT') { const b = JSON.parse(o.body); puts.push([url, b]); return new Response(JSON.stringify({ id: 501, name: 'فتة لحمة', stock_status: b.stock_status }), { status: 200 }); }
    if (/\/products\?/.test(url)) return new Response(JSON.stringify(/page=1/.test(url) ? site : []), { status: 200 });
    return new Response('[]', { status: 200 });
  } } });
  try {
    const admin = await t.admin();
    const okey = (await admin('POST', '/api/orders/token')).body.token;
    await admin('POST', '/api/site/config', { url: 'https://eldahan.com.eg', key: 'ck_x', secret: 'cs_x' }).catch(() => {});
    // Talabat (the extension's menu page): «Hakawi Grills Feast Platter» stopped in Tagamoa.
    await admin('POST', '/api/talabat/token').catch(() => {});
    t.app.db.raw.prepare("INSERT INTO settings (key, value) VALUES ('talabat_stock_actual', ?)").run(JSON.stringify({
      'HF_EG;760858': { at: t.clock.now, unavailable: ['3114762219'] }, 'HF_EG;608556': { at: t.clock.now, unavailable: [] }, 'HF_EG;802223': { at: t.clock.now, unavailable: [] } }));
    // Apex: «Feast Platter» (0111006) stopped in Nasr City only; nothing in Tagamoa.
    const push = () => t.call('POST', '/api/apex-stock', { headers: { 'x-orders-token': okey }, body: { stopped: [{ branch: 2, item: '0111006', status: 1, reason: 1, name: 'فيست بلاتر' }], recent: [{ branch: 2, item: '0111006', at: '2026-11-16T13:50:00+02:00', user: 'MARSAD' }] } });
    assert.equal((await t.call('POST', '/api/apex-stock', { body: {} })).status, 401);
    assert.equal((await push()).status, 200);
    const c = (await admin('GET', '/api/stock/compare')).body;
    const tag = c.branches.find(b => b.branch === 1), nasr = c.branches.find(b => b.branch === 2);
    assert.deepEqual(tag.diffs.map(d => [d.dish, d.side]), [['Hakawi Grills Feast Platter', 'talabatOnly']]);
    assert.deepEqual(nasr.diffs.map(d => [d.dish, d.side]), [['Feast Platter', 'apexOnly']]);
    assert.equal(c.recent[0].user, 'MARSAD');
    // Told after 15 minutes, once, to the branch and the online group.
    const told = () => t.app.db.raw.prepare("SELECT target, branch, text FROM telegram_log WHERE kind = 'stockMismatch'").all();
    assert.equal(told().length, 0, 'not at once');
    t.advance(16 * 60000);
    t.app.db.raw.prepare("UPDATE settings SET value = ? WHERE key = 'talabat_stock_actual'").run(JSON.stringify({
      'HF_EG;760858': { at: t.clock.now, unavailable: ['3114762219'] }, 'HF_EG;608556': { at: t.clock.now, unavailable: [] }, 'HF_EG;802223': { at: t.clock.now, unavailable: [] } }));
    await push(); await push();
    const rows = told();
    assert.equal(rows.length, 4, JSON.stringify(rows));
    assert.ok(rows.some(r => r.target === 'branches' && r.branch === 'مدينة نصر' && /Feast Platter — واقف على Apex وشغال على طلبات/.test(r.text)));
    assert.ok(rows.some(r => r.target === 'branches' && r.branch === 'التجمع' && /واقف على طلبات وشغال على Apex/.test(r.text)));
    // The website buttons are off until admin turns them on.
    assert.equal((await admin('POST', '/api/stock/site', { id: 501, stop: true })).status, 409);
    await admin('POST', '/api/talabat/stock-config', { action: 'apply', talabat: false, apex: false, site: true });
    assert.equal((await admin('GET', '/api/talabat/stock-config')).body.apply.site, true);
  } finally { await t.close(); }
});

test('stopped dishes: a dish stopped on Apex in every branch and still on sale on the website', () => {
  return import('../src/stock.js').then(({ compare }) => {
    const now = Date.now();
    const apex = { at: now, stopped: [1, 2, 3].map(b => ({ branch: b, item: '0105001', status: 1, name: 'فتة لحمة' })) };
    const r = compare({ apex, talabat: {}, site: { at: now, products: [{ id: 501, name: 'فتة لحمه', stock: 'instock' }, { id: 502, name: 'كشري', stock: 'outofstock' }] } }, now);
    assert.deepEqual(r.site.diffs.map(d => [d.siteId, d.side]), [[501, 'siteOn']]);
    assert.deepEqual(r.site.outOfStock.map(p => p.name), ['كشري']);
    // Stopped in two branches only: the website keeps it.
    const r2 = compare({ apex: { at: now, stopped: apex.stopped.slice(0, 2) }, talabat: {}, site: { at: now, products: [{ id: 501, name: 'فتة لحمة', stock: 'instock' }] } }, now);
    assert.equal(r2.site.diffs.length, 0);
  });
});
