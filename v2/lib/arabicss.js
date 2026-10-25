// Arabicss (Issabel call center) report parsing. Column positions are matched by
// header name, so a reordered export still parses; unknown headers are kept raw.
import { RULES, cairoToUtc, parseDate, isOperating, iso } from './time.js';

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
const queueLabel = q => QUEUE_LABELS[purpose(q)] || 'طابور غير مصنف';

function toRecord(row, map, fallbackDate, index) {
  const get = f => (map[f] == null ? null : row[map[f]]);
  const date = normalizeDate(get('date'), fallbackDate);
  const start = parseClock(get('start')), end = parseClock(get('end'));
  const [y, mo, d] = parseDate(date) || [];
  // Cairo wall time of the call itself (not midnight + seconds: midnight does not exist on the spring-forward day).
  const at = c => (c && y ? cairoToUtc(y, mo, d, Math.floor(c.seconds / 3600), Math.floor(c.seconds % 3600 / 60), c.seconds % 60) : null);
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

// Exact port of the old server's lib/history.ts rules, so day indicators match it.
function classify(r) {
  const s = String(r.status || '').toLowerCase(), t = r.startMs ?? r.endMs, p = purpose(r.queue);
  const outsideTime = t != null && !isOperating(t);
  const outside = outsideTime || p === '0';
  const known = ['1', '2', '3'].includes(p);
  const answered = s === 'success', abandoned = s === 'abandoned';
  const short = abandoned && r.waitSeconds != null && r.waitSeconds <= RULES.shortAbandonSeconds;
  let classification = null;
  if (abandoned) classification = outsideTime ? 'after_hours' : short ? 'short_exempt' : p === '0' ? 'after_hours' : !known ? 'unknown_queue' : r.waitSeconds == null ? 'unknown_wait' : 'counted';
  return { outside, outsideTime, known, answered, abandoned, short, classification };
}

function metrics(records) {
  const all = records.map(r => ({ r, c: classify(r) }));
  const operating = all.filter(x => !x.c.outsideTime && x.c.known);
  const shortAbandoned = operating.filter(x => x.c.short).length;
  const calls = operating.filter(x => !x.c.short);
  const answered = calls.filter(x => x.c.answered), raw = calls.filter(x => x.c.abandoned);
  const abandoned = raw.filter(x => x.r.waitSeconds != null && x.r.waitSeconds > RULES.shortAbandonSeconds).length;
  const unclassifiedAbandoned = raw.filter(x => x.r.waitSeconds == null).length;
  const unknownStatuses = calls.length - answered.length - raw.length;
  const validWaits = answered.every(x => x.r.waitSeconds != null), validDurations = answered.every(x => x.r.durationSeconds != null);
  const within = answered.filter(x => x.r.waitSeconds != null && x.r.waitSeconds <= RULES.slaSeconds).length;
  const clean = !unknownStatuses && !unclassifiedAbandoned;
  return {
    calls: calls.length, recordedCalls: operating.length, shortAbandoned, answered: answered.length, abandoned,
    unclassifiedAbandoned, unknownStatuses, answeredWithinThreshold: within,
    missingWaits: answered.filter(x => x.r.waitSeconds == null).length,
    asa: answered.length && validWaits ? answered.reduce((n, x) => n + x.r.waitSeconds, 0) / answered.length : null,
    sla: clean && validWaits && calls.length ? within / calls.length * 100 : null,
    abandonmentRate: clean && calls.length ? abandoned / calls.length * 100 : null,
    meanCallSeconds: answered.length && validDurations ? answered.reduce((n, x) => n + x.r.durationSeconds, 0) / answered.length : null,
    totalRecords: all.length, afterHours: all.filter(x => x.c.outside).length, unclassified: all.filter(x => !x.c.known && purpose(x.r.queue) !== '0').length,
  };
}

function summarize(records) {
  const queues = [...new Set(records.map(r => r.queue))];
  return {
    report: metrics(records),
    queues: queues.map(queue => ({ queue, label: queueLabel(queue), ...metrics(records.filter(r => r.queue === queue)) })),
  };
}

// Live real-time report row (11 columns): [0] queue, [2] account, [8] wait h:mm:ss, [9] phone, [10] status.
function liveSummary(rows) {
  const waiting = rows.filter(r => /^on wait$|^waiting$/i.test(String(r[10]).trim()));
  const active = rows.filter(r => /^live call$/i.test(String(r[10]).trim()));
  const waits = waiting.map(r => parseDuration(r[8])).filter(v => v != null);
  return { waiting: waiting.length, active: active.length, longest: waits.length ? Math.max(...waits) : waiting.length ? null : 0 };
}

export { mapHeader, parseClock, parseDuration, normalizeDate, toRecord, classify, summarize, liveSummary, queueLabel, purpose, iso };
