'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

const log = t => { const r = t.app.db.raw.prepare("SELECT value FROM settings WHERE key = 'system_log'").get(); return (r ? JSON.parse(r.value) : []).filter(x => !/^system:morning:/.test(x.key)); };

// Karim 11-17 «مش عايزين ... نستني أيام عشان يتصلح»: hours and extra rules change from the admin page, no publish.
test('ops settings: Ramadan hours from the admin page move the operating window', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 20, 10, 0, 0) });
  const time = await import('../src/time.js');
  try {
    const admin = await t.admin();
    assert.equal(time.isOperating(t.clock.now), true);
    assert.equal((await admin('PUT', '/api/ops-settings/hours', { openHour: 8, closeHour: 4 })).status, 400, 'not before the data day');
    assert.equal((await admin('PUT', '/api/ops-settings/hours', { openHour: 13, closeHour: 9 })).status, 400);
    assert.equal((await admin('PUT', '/api/ops-settings/hours', { openHour: 13, closeHour: 4 })).status, 200);
    assert.equal(time.isOperating(t.clock.now), false, '10 ص is closed in Ramadan');
    assert.equal(time.isOperating(cairoToUtc(2026, 11, 21, 3, 30, 0)), true, '3:30 الفجر is open');
    const d = (await admin('GET', '/api/ops-settings')).body;
    assert.deepEqual(d.hours, { openHour: 13, closeHour: 4 });
    // A restart reads them back from the database.
    time.RULES.openHour = 9; time.RULES.operatingEndHour = 2;
    t.advance(2 * 60000); await admin('GET', '/api/ops-settings');
    assert.equal(time.RULES.openHour, 13);
    await admin('PUT', '/api/ops-settings/hours', { reset: true });
    assert.equal(time.isOperating(t.clock.now), true);
    // A supervisor can't change them.
    await admin('POST', '/api/admin-access', { name: 'مشرف', role: 'supervisor', password: 'sup-pass-1', confirmation: 'sup-pass-1' });
    assert.equal((await t.call('PUT', '/api/ops-settings/hours', { headers: { 'x-admin-password': 'sup-pass-1' }, body: { openHour: 12, closeHour: 3 } })).status, 403);
  } finally { time.RULES.openHour = 9; time.RULES.operatingEndHour = 2; await t.close(); }
});

test('ops settings: an extra rule wins over the built-in ones, and can be removed', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 20, 12, 0, 0) });
  const { areaRule, itemRule } = await import('../src/transfer-rules.js');
  try {
    const admin = await t.admin();
    assert.deepEqual(areaRule('مدينة نصر', 'talabat'), { general: true });
    assert.equal((await admin('PUT', '/api/ops-settings/rules', { kind: 'area', words: 'مدينة نصر - عباس العقاد', source: 'talabat', no: 77 })).status, 200);
    assert.equal(areaRule('مدينه نصر - عباس العقاد', 'talabat').no, 77, 'normalized');
    assert.equal(areaRule('مدينة نصر - عباس العقاد', 'site'), null, 'Talabat only');
    await admin('PUT', '/api/ops-settings/rules', { kind: 'area', words: 'الرحاب', source: 'site', no: 500, addAddress: 'الرحاب' });
    assert.deepEqual(areaRule('الرحاب', 'site'), { no: 500, addAddress: 'الرحاب' }, 'before the built-in 331');
    await admin('PUT', '/api/ops-settings/rules', { kind: 'item', name: 'بطاطس محمرة', no: '0103099' });
    assert.equal(itemRule({ name: 'بطاطس محمره' }), '0103099');
    assert.equal((await admin('PUT', '/api/ops-settings/rules', { kind: 'item', name: 'x', no: 'bad no!' })).status, 400);
    assert.equal((await admin('PUT', '/api/ops-settings/rules', { kind: 'area', words: 'y', no: 'abc' })).status, 400);
    assert.equal((await admin('GET', '/api/ops-settings')).body.rules.areas.length, 2);
    await admin('PUT', '/api/ops-settings/rules', { kind: 'item', name: 'بطاطس محمرة', remove: true });
    assert.equal(itemRule({ name: 'بطاطس محمره' }), '0103005', 'back to the built-in');
    await admin('PUT', '/api/ops-settings/rules', { kind: 'area', words: 'الرحاب', source: 'site', remove: true });
    assert.equal(areaRule('الرحاب', 'site').no, 331);
  } finally {
    (await import('../src/transfer-rules.js')).setExtraRules(null);
    await t.close();
  }
});

test('watch: the cashier PC clock and disk, and Telegram failing', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 20, 13, 0, 0) });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const status = body => t.call('POST', '/api/archive/status', { headers: { 'x-orders-token': token }, body });
    await status({ archive: { pages: 1, upToDate: true }, freeGb: 1.4, pcTime: new Date(t.clock.now + 7 * 60000).toISOString() });
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    assert.ok(log(t).some(x => /ساعة جهاز الكاشير قدّام 7 دقيقة/.test(x.text)));
    assert.ok(log(t).some(x => /المساحة الفاضية على جهاز الكاشير 1.4/.test(x.text)));
    for (let i = 0; i < 3; i++) t.app.db.raw.prepare("INSERT INTO telegram_log (key, kind, text, created_at, error) VALUES (?, 'breakStart', 'x', ?, 'Forbidden: bot was kicked')").run('k' + i, t.clock.now);
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    assert.ok(log(t).some(x => /تليجرام مش بيبعت: 3 رسالة/.test(x.text) && /kicked/.test(x.text)));
    await status({ archive: { pages: 1, upToDate: true }, freeGb: 9, pcTime: new Date(t.clock.now).toISOString() });
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    assert.ok(log(t).some(x => /ساعة جهاز الكاشير مظبوطة/.test(x.text)));
    assert.ok(log(t).some(x => /المساحة على جهاز الكاشير بقت كفاية/.test(x.text)));
  } finally { await t.close(); }
});
