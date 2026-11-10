'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { cairoToUtc } = require('../src/time.js');

const morning = t => { const r = t.app.db.raw.prepare("SELECT value FROM settings WHERE key = 'system_log'").get(); return (r ? JSON.parse(r.value) : []).filter(x => /^system:morning:/.test(x.key)); };
const log = t => (() => { const r = t.app.db.raw.prepare("SELECT value FROM settings WHERE key = 'system_log'").get(); return (r ? JSON.parse(r.value) : []).slice().reverse().filter(x => !/^system:morning:/.test(x.key)).map(x => ({ key: x.key, kind: 'system', text: x.text, target: null, reply_to: /^resolved:/.test(x.key) ? x.key.slice(9) : null })); })();

test('watch: server errors, a stuck automatic transfer and the night copy are heard on Telegram, then «رجع»', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 1, 13, 0, 0) });
  try {
    const admin = await t.admin();
    // Server errors: five in ten minutes → one message with the last error; quiet again → a reply.
    for (let i = 0; i < 6; i++) t.app.recentErrors.unshift({ at: new Date(t.clock.now).toISOString(), path: 'POST /api/apex-writer/next', error: 'D1_ERROR: overloaded' });
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    let l = log(t).filter(x => /السيرفر/.test(x.text));
    assert.equal(l.length, 1); assert.match(l[0].text, /6 خطأ/); assert.match(l[0].text, /apex-writer\/next/); assert.equal(t.app.db.raw.prepare("SELECT COUNT(*) n FROM telegram_log WHERE kind LIKE 'system%'").get().n, 0, 'not on Telegram');
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    assert.equal(log(t).filter(x => /السيرفر/.test(x.text)).length, 1, 'not repeated');
    t.advance(10 * 60000); await admin('GET', '/api/system/watch');
    l = log(t).filter(x => /السيرفر/.test(x.text));
    assert.equal(l.length, 2); assert.match(l[1].text, /من غير أخطاء/); assert.equal(l[1].reply_to, l[0].key);

    // An automatic transfer the writer did not take for more than 5 minutes.
    const day = (await admin('GET', '/api/kpi')).body.to;
    t.app.db.raw.prepare("INSERT INTO transfer_jobs (source, ref, day, state, employee_name, at) VALUES ('talabat', '77', ?, 'auto_pending', 'سارة', ?)").run(day, t.clock.now);
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    assert.equal(log(t).filter(x => /التحويل التلقائي/.test(x.text)).length, 0, 'not before 5 minutes');
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    l = log(t).filter(x => /التحويل التلقائي|مستني التحويل/.test(x.text));
    assert.equal(l.length, 1); assert.match(l[0].text, /1 أوردر مستني/); assert.match(l[0].text, /يدوي/);
    t.app.db.raw.prepare("UPDATE transfer_jobs SET state = 'auto_done' WHERE ref = '77'").run();
    t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    l = log(t).filter(x => /التحويل التلقائي|مستني التحويل/.test(x.text));
    assert.equal(l.length, 2); assert.match(l[1].text, /رجع يمشي/);

    // The night copy: the PC reports it; none for 30 hours → a message, even outside operating hours.
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const status = body => t.call('POST', '/api/archive/status', { headers: { 'x-orders-token': token }, body });
    assert.equal((await t.call('POST', '/api/archive/status', { body: {} })).status, 401);
    assert.equal((await status({ backup: { ok: true, tables: 40 }, freeGb: 120.44 })).body.backup.freeGb, 120.4);
    t.advance(20 * 3600000); await status({ backup: { ok: false, error: 'timeout' } }); await admin('GET', '/api/system/watch');
    assert.equal(log(t).filter(x => /النسخة الاحتياطية/.test(x.text)).length, 0, 'one failed night is retried');
    t.advance(11 * 3600000); await admin('GET', '/api/system/watch');
    l = log(t).filter(x => /النسخة الاحتياطية/.test(x.text));
    assert.equal(l.length, 1); assert.match(l[0].text, /timeout/);
    await status({ backup: { ok: true, tables: 40 }, freeGb: 3 }); t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    l = log(t).filter(x => /النسخة الاحتياطية/.test(x.text));
    assert.equal(l.length, 2); assert.match(l[1].text, /اكتملت/);
    const w = (await (await t.admin())('GET', '/api/system/watch')).body.parts;
    assert.ok(w.find(p => p.id === 'backup').ok && w.find(p => p.id === 'errors').ok);
  } finally { await t.close(); }
});

test('watch: the morning report is sent once a day after 10 AM with yesterday\'s transfers', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 2, 9, 30, 0), config: { systemMorning: true } });
  try {
    const admin = await t.admin();
    const ins = (ref, state) => t.app.db.raw.prepare("INSERT INTO transfer_jobs (source, ref, day, state, at) VALUES ('talabat', ?, '2026-11-01', ?, ?)").run(ref, state, t.clock.now);
    ins('1', 'auto_done'); ins('2', 'auto_done'); ins('3', 'entered'); ins('4', 'auto_failed');
    await admin('GET', '/api/system/watch'); t.advance(3 * 60000); await admin('GET', '/api/system/watch');
    assert.equal(morning(t).length, 0, 'not before 10');
    t.advance(30 * 60000); await admin('GET', '/api/system/watch');
    let l = morning(t);
    assert.equal(l.length, 1);
    assert.match(l[0].text, /2 تلقائي، 1 يدوي، 1 فشلوا/);
    assert.match(l[0].text, /مفيش أخطاء سيرفر/);
    t.advance(3 * 3600000); await admin('GET', '/api/system/watch');
    assert.equal(morning(t).length, 1, 'once a day');
  } finally { await t.close(); }
});

test('watch: an order the Marsad put on Apex and someone changed by hand is written in the log once per change', async () => {
  const t = await start({ at: cairoToUtc(2026, 11, 10, 19, 0, 0) });
  try {
    const admin = await t.admin();
    const { token } = (await admin('POST', '/api/orders/token')).body;
    const push = (fixes, at) => t.call('POST', '/api/orders/push', { headers: { 'x-orders-token': token }, body: { v: 1, day: '2026-11-10', generatedAt: at, online: [], fixes } });
    const f = { no: '70966', sn: 222, code: '655', branch: 'مدينة نصر', pay: 'Cash', by: 'malak', what: ['05:24:01 م خصم 39.5925'], now: 300.64, wrote: 340.23, gap: 0 };
    assert.equal((await push([f], '2026-11-10T19:00:00+02:00')).status, 200);
    assert.equal((await push([f], '2026-11-10T19:01:00+02:00')).status, 200);
    let log = (await admin('GET', '/api/system/watch')).body.log.filter(x => /اتعدّل بإيد/.test(x.text));
    assert.equal(log.length, 1, 'once'); assert.match(log[0].text, /#655/); assert.match(log[0].text, /خصم 39.5925/); assert.match(log[0].text, /340.23/);
    await push([{ ...f, what: [...f.what, '05:30:00 م شال صنف'] }], '2026-11-10T19:02:00+02:00');
    log = (await admin('GET', '/api/system/watch')).body.log.filter(x => /اتعدّل بإيد/.test(x.text));
    assert.equal(log.length, 2, 'a new change on the same order is written again');
  } finally { await t.close(); }
});
