#!/usr/bin/env node
'use strict';
// Parity check: day indicators computed the old server's way (from the old SQLite) vs
// this server's /api/history on the imported database.
// Usage: node scripts/compare-old-history.js <old.sqlite> <new.db>
const Database = require('better-sqlite3');
const http = require('node:http');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/security');

const [oldPath, newPath] = process.argv.slice(2);
const old = new Database(oldPath, { readonly: true });

// ---- old server logic (lib/history.ts, lib/business-day.ts, lib/missed-context.ts) ----
const parts = ms => { const p = {}; for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = +x.value; return p; };
function cairoClockWindow(date, clock) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(String(clock).trim()); if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let hour = +m[1]; const minute = +m[2], second = +(m[3] || 0);
  if (minute > 59 || second > 59 || (m[4] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (m[4]) hour = hour % 12 + (m[4].toUpperCase() === 'PM' ? 12 : 0);
  const [y, mo, d] = date.split('-').map(Number), wall = Date.UTC(y, mo - 1, d, hour, minute, second), c = new Set();
  for (const shift of [-12, 0, 12]) { const probe = wall + shift * 3600000, p = parts(probe), off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - probe, cand = wall - off, q = parts(cand); if (q.year === y && q.month === mo && q.day === d && q.hour === hour && q.minute === minute && q.second === second) c.add(cand); }
  return c.size ? { start: Math.min(...c) } : null;
}
const shiftDate = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const businessDateAt = ms => { const p = parts(ms), d = p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0'); return p.hour < 9 ? shiftDate(d, -1) : d; };
const operatingEnd = date => cairoClockWindow(shiftDate(date, 1), '03:00:00').start;
const businessTime = c => { const k = cairoClockWindow(c.date, c.start) || cairoClockWindow(c.date, c.end); if (!k) return { businessDate: c.date, outsideHours: null }; const d = businessDateAt(k.start); return { businessDate: d, outsideHours: k.start >= operatingEnd(d) }; };
const purpose = q => ({ 0: 'after_hours', 1: 'order_request', 2: 'order_followup', 3: 'complaint' })[String(q).trim().slice(-1)] || 'unknown';
const short = c => c.status.toLowerCase() === 'abandoned' && c.waitSeconds !== null && c.waitSeconds <= 7;
const operating = cs => cs.filter(c => businessTime(c).outsideHours !== true && ['order_request', 'order_followup', 'complaint'].includes(purpose(c.queue)));
function metrics(calls) {
  const shortAbandoned = calls.filter(short).length; calls = calls.filter(c => !short(c));
  const answered = calls.filter(c => c.status.toLowerCase() === 'success'), raw = calls.filter(c => c.status.toLowerCase() === 'abandoned');
  const abandoned = raw.filter(c => c.waitSeconds !== null && c.waitSeconds > 7), unc = raw.filter(c => c.waitSeconds === null).length, unknown = calls.length - answered.length - raw.length;
  const valid = answered.every(c => c.waitSeconds !== null), within = answered.filter(c => c.waitSeconds !== null && c.waitSeconds <= 10).length;
  return { calls: calls.length, shortAbandoned, answered: answered.length, abandoned: abandoned.length, unclassifiedAbandoned: unc, unknownStatuses: unknown,
    asa: answered.length && valid ? answered.reduce((a, c) => a + c.waitSeconds, 0) / answered.length : null,
    sla: !unknown && !unc && valid && calls.length ? within / calls.length * 100 : null,
    abandonmentRate: !unknown && !unc && calls.length ? abandoned.length / calls.length * 100 : null, answeredWithinThreshold: within };
}
function oldDay(date) {
  const src = [date, shiftDate(date, 1)].map(d => old.prepare('SELECT records FROM history_reports WHERE report_date=? ORDER BY imported_at DESC,id DESC LIMIT 1').get(d));
  if (!src[0] && !src[1]) return null;
  const calls = src.flatMap(s => (s ? JSON.parse(s.records) : [])).map(c => ({ ...c, ...businessTime(c) })).filter(c => c.businessDate === date);
  const missed = calls.map((c, index) => ({ c, index, cls: businessTime(c).outsideHours === true ? 'after_hours' : short(c) ? 'short_exempt' : purpose(c.queue) === 'after_hours' ? 'after_hours' : purpose(c.queue) === 'unknown' ? 'unknown_queue' : c.waitSeconds === null ? 'unknown_wait' : 'counted' })).filter(x => x.c.status.toLowerCase() === 'abandoned');
  return { totalRecords: calls.length, afterHours: calls.filter(c => purpose(c.queue) === 'after_hours' || businessTime(c).outsideHours === true).length, ...metrics(operating(calls)),
    missed: missed.map(x => x.cls + '|' + x.c.phone + '|' + x.c.start).sort() };
}

(async () => {
  const { open } = require('../src/db');
  const db = open(newPath);
  const app = createApp({ db, config: { secret: 'cmp', adminPasswordHash: hashPassword('cmp-pass'), deviceTokens: [], allowedOrigins: [] } });
  for (const m of require('../src/index').MODULES.map(x => x.slice(2))) require('../src/' + m).setup(app);
  const server = http.createServer((q, r) => app.handle(q, r));
  server.keepAliveTimeout = 600000;
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port, h = { 'x-admin-password': 'cmp-pass' };
  const dates = old.prepare('SELECT DISTINCT report_date d FROM history_reports ORDER BY 1').all().map(r => r.d);
  const keys = ['totalRecords', 'afterHours', 'calls', 'answered', 'abandoned', 'shortAbandoned', 'unclassifiedAbandoned', 'unknownStatuses', 'answeredWithinThreshold', 'asa', 'sla', 'abandonmentRate'];
  let bad = 0;
  for (const date of dates) {
    const o = oldDay(date);
    if (!o) continue;
    const n = await (await fetch(base + '/api/history?date=' + date, { headers: h })).json();
    const r = n.report || {};
    const diffs = keys.filter(k => (o[k] == null && r[k] == null) ? false : Math.abs((o[k] ?? NaN) - (r[k] ?? NaN)) > 1e-9 || (o[k] == null) !== (r[k] == null));
    const nm = (n.missed || []).map(m => m.classification + '|' + m.phone + '|' + m.start).sort();
    const missedSame = JSON.stringify(nm) === JSON.stringify(o.missed);
    if (diffs.length || !missedSame) bad++;
    console.log(date, diffs.length || !missedSame ? 'DIFF' : 'same', 'calls', o.calls + '/' + r.calls, 'answered', o.answered + '/' + r.answered, 'missed', o.abandoned + '/' + r.abandoned,
      'SLA', (o.sla == null ? '—' : o.sla.toFixed(2)) + '/' + (r.sla == null ? '—' : r.sla.toFixed(2)), diffs.map(k => k + ':' + o[k] + '≠' + r[k]).join(' '), missedSame ? '' : 'missed-list ' + o.missed.length + '/' + nm.length);
  }
  console.log(bad ? bad + ' day(s) differ' : 'ALL DAYS MATCH');
  server.close();
})();
