'use strict';
// Arabicss (Issabel call center) report parsing. Column positions are matched by
// header name, so a reordered export still parses; unknown headers are kept raw.
const { RULES, cairoToUtc, parseDate, isOperating, iso } = require('./time');

const FIELDS = {
  queue: /^queue$|queue\s*(?:no|number|id)?$|طابور|قائمة/i,
  account: /agent|account|operator|extension|^ext/i,
  date: /call\s*date|^date$|التاريخ/i,
  start: /start|begin|entry|^time$|البداية/i,
  end: /end|finish|hang\s*up|النهاية/i,
  duration: /duration|talk|مدة/i,
  wait: /wait|hold\s*time|ring\s*time|queue\s*time|انتظار/i,
  phone: /phone|caller|number|cli|source|الهاتف/i,
  status: /status|state|result|الحالة/i,
};

function mapHeader(header) {
  const map = {}, used = new Set();
  // Most specific first so "Call Date" is not taken by a generic pattern.
  for (const field of ['date', 'wait', 'duration', 'status', 'queue', 'account', 'phone', 'start', 'end']) {
    const i = header.findIndex((h, idx) => !used.has(idx) && FIELDS[field].test(String(h).trim()));
    if (i >= 0) { map[field] = i; used.add(i); }
  }
  return map;
}

// "22:15:32", "10:15:32 PM", "10:15 م" → seconds since midnight + precision.
function parseClock(value) {
  const s = String(value ?? '').trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|ص|م)?/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const marker = (m[4] || '').toUpperCase();
  if (marker === 'PM' || marker === 'م') h = (h % 12) + 12;
  else if (marker === 'AM' || marker === 'ص') h = h % 12;
  if (h > 23 || Number(m[2]) > 59) return null;
  return { seconds: h * 3600 + Number(m[2]) * 60 + Number(m[3] || 0), precision: m[3] == null ? 'minute' : 'second' };
}

// "00:01:05", "1:05", "65" → seconds
function parseDuration(value) {
  const s = String(value ?? '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(s);
  if (!m) return null;
  return m[3] == null ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function normalizeDate(value, fallback) {
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return fallback || null;
}

const purpose = queue => String(queue ?? '').slice(-1);
const QUEUE_LABELS = { 0: 'خارج ساعات العمل', 1: 'طلب أوردر', 2: 'متابعة أوردر', 3: 'شكاوى' };
const queueLabel = q => QUEUE_LABELS[purpose(q)] || 'نوع طلب غير معروف';

function toRecord(row, map, fallbackDate, index) {
  const get = f => (map[f] == null ? null : row[map[f]]);
  const date = normalizeDate(get('date'), fallbackDate);
  const start = parseClock(get('start')), end = parseClock(get('end'));
  const [y, mo, d] = parseDate(date) || [];
  const at = c => (c && y ? cairoToUtc(y, mo, d, 0, 0, 0) + c.seconds * 1000 : null);
  let startMs = at(start), endMs = at(end);
  if (startMs != null && endMs != null && endMs < startMs) endMs += 86400000;   // crossed midnight
  const status = String(get('status') ?? '').trim();
  const extension = (String(get('account') ?? '').match(/(\d{2,6})(?!.*\d)/) || [])[1] || '';
  return {
    index, date, queue: String(get('queue') ?? '').trim(), accountName: String(get('account') ?? '').trim(), extension,
    start: get('start') == null ? null : String(get('start')).trim(), end: get('end') == null ? null : String(get('end')).trim(),
    startMs, endMs, precision: start?.precision === 'second' || end?.precision === 'second' ? 'second' : start || end ? 'minute' : null,
    durationSeconds: parseDuration(get('duration')), waitSeconds: parseDuration(get('wait')),
    phone: String(get('phone') ?? '').trim(), status,
  };
}

function classify(r) {
  const s = r.status.toLowerCase(), t = r.startMs ?? r.endMs;
  const outside = purpose(r.queue) === '0' || (t != null && !isOperating(t));
  const known = ['1', '2', '3'].includes(purpose(r.queue));
  const answered = s === 'success' || s === 'answered' || s === 'completed';
  const abandoned = s === 'abandoned' || s === 'abandon' || s === 'no answer' || s === 'failure';
  let classification = null;
  if (abandoned) classification = outside ? 'after_hours' : !known ? 'unknown_queue' : r.waitSeconds == null ? 'unknown_wait' : r.waitSeconds <= RULES.shortAbandonSeconds ? 'short_exempt' : 'counted';
  return { outside, known, answered, abandoned, classification };
}

function summarize(records) {
  const z = () => ({ calls: 0, answered: 0, abandoned: 0, shortAbandoned: 0, afterHours: 0, totalRecords: 0, answeredWithinThreshold: 0, missingWaits: 0, unknownStatuses: 0, unclassifiedAbandoned: 0, waitSum: 0, answeredWaits: 0 });
  const add = (t, r) => {
    const c = classify(r);
    t.totalRecords++;
    if (c.outside) { t.afterHours++; return; }
    if (c.abandoned && c.classification === 'short_exempt') { t.shortAbandoned++; return; }
    if (!c.known) { if (c.abandoned) t.unclassifiedAbandoned++; return; }
    t.calls++;
    if (r.waitSeconds == null) t.missingWaits++;
    if (c.answered) {
      t.answered++;
      if (r.waitSeconds != null) { t.waitSum += r.waitSeconds; t.answeredWaits++; if (r.waitSeconds <= RULES.slaSeconds) t.answeredWithinThreshold++; }
    } else if (c.abandoned) { if (r.waitSeconds == null) t.unclassifiedAbandoned++; else t.abandoned++; }
    else t.unknownStatuses++;
  };
  const finish = t => ({
    calls: t.calls, answered: t.answered, abandoned: t.abandoned, shortAbandoned: t.shortAbandoned, afterHours: t.afterHours,
    totalRecords: t.totalRecords, answeredWithinThreshold: t.answeredWithinThreshold, missingWaits: t.missingWaits,
    unknownStatuses: t.unknownStatuses, unclassifiedAbandoned: t.unclassifiedAbandoned,
    asa: t.answered && t.answeredWaits === t.answered ? t.waitSum / t.answered : null,
    sla: t.calls && !t.missingWaits ? t.answeredWithinThreshold / t.calls * 100 : null,
    abandonmentRate: t.calls ? t.abandoned / t.calls * 100 : null,
  });
  const total = z(), queues = new Map();
  for (const r of records) {
    add(total, r);
    if (!queues.has(r.queue)) queues.set(r.queue, z());
    add(queues.get(r.queue), r);
  }
  return {
    report: finish(total),
    queues: [...queues].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([queue, t]) => ({ queue, label: queueLabel(queue), ...finish(t) })),
  };
}

// Live real-time report row (11 columns): [0] queue, [2] account, [8] wait h:mm:ss, [9] phone, [10] status.
function liveSummary(rows) {
  const waiting = rows.filter(r => /^on wait$|^waiting$/i.test(String(r[10]).trim()));
  const active = rows.filter(r => /^live call$/i.test(String(r[10]).trim()));
  const waits = waiting.map(r => parseDuration(r[8])).filter(v => v != null);
  return { waiting: waiting.length, active: active.length, longest: waits.length ? Math.max(...waits) : waiting.length ? null : 0 };
}

module.exports = { mapHeader, parseClock, parseDuration, normalizeDate, toRecord, classify, summarize, liveSummary, queueLabel, purpose, iso };
