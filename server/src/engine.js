// مرصد الأداء — calculation engine. Every number the admin page shows comes from here.
//
// Inputs: employee sessions and the events the connector sent for them, plus the Arabicss call
// history (calls, waits, missed calls) and the live queue.
//
// Rules (see also attendance-rules.js):
// • State over time comes from what Arabicss showed: available, on a call, on break. A state lasts
//   until the next evidence, at most 90 s after the last signal.
// • A shift ends at its logout when the time is known, otherwise at the last real state + 90 s.
// • A call is the connector's call start → end on that employee's extension. A call answered in the
//   Arabicss history but missed by the connector is added to the employee who was working on that
//   extension at that moment (only when exactly one employee was).
// • A missed call is judged against everyone in their shift between the moment the customer entered
//   the queue and the moment they hung up.
// • Totals use operating hours (09:00 → 03:00); the data day runs 09:00 → 09:00.
import { RULES, dayWindow, businessDay, iso } from './time.js';
import { attendance, mergeBreaks, breakTotals, KNOWN_CLOSE, outKind } from './attendance-rules.js';
import * as A from './arabicss.js';

const GAP_MS = RULES.presenceStaleMs;
const WORK = new Set(['ready', 'on_call', 'break']);
const canonical = id => (String(id ?? '').match(/(?:incoming-q\d+-|outgoing-)?(\d+)$/) || [])[1] || String(id ?? '');
const digits = p => String(p || '').replace(/\D/g, '').slice(-9);
const numeric = x => /^\d{1,10}$/.test(String(x || ''));

// State shown by one event, or null when the event says nothing about the state.
function stateOf(e) {
  switch (e.event_type) {
    case 'heartbeat': return ['ready', 'on_call', 'break', 'unknown', 'logged_in'].includes(e.state) ? e.state : e.state === 'post_call' ? 'ready' : 'unknown';
    case 'session_login': case 'arabicss_login': return 'logged_in';
    case 'break_start': case 'break_observed': return 'break';
    case 'break_end': case 'break_end_unknown': return 'ready';
    case 'agentlinked': case 'call_observed': return 'on_call';
    case 'agentunlinked': case 'call_observed_end': return 'ready';
    default: return null;
  }
}

// Consecutive evidence of the same state (no silence over 90 s) → one span.
function spansOf(session, events) {
  const out = [];
  for (const e of events) {
    const state = stateOf(e);
    if (!state) continue;
    const at = e.occurred_at, last = out.at(-1);
    if (last && last.state === state && at - last.lastEvidence < GAP_MS) last.lastEvidence = at;
    else out.push({ sessionId: String(session.id), employeeId: session.employee_id, extension: e.extension || session.extension, state, started: at, lastEvidence: at });
  }
  return out;
}

// Calls from the connector's events, per session.
function callsOf(session, events) {
  const calls = new Map(), order = [];
  const get = (id, e) => { const k = canonical(id); if (!calls.has(k)) { calls.set(k, { callId: k, employeeId: session.employee_id, extension: e.extension, sessionId: session.id, phone: '', queue: '', callType: null, startedAt: null, endedAt: null, durationSeconds: null, complete: false, source: 'connector', startKnown: false }); order.push(k); } return calls.get(k); };
  for (const e of events) {
    if (e.event_type === 'agentlinked' && e.call_id) {
      const c = get(e.call_id, e);
      if (c.startedAt == null) { c.startedAt = e.occurred_at; c.startKnown = true; }
      c.phone ||= e.phone || ''; c.queue ||= e.queue || ''; c.callType ||= e.call_type || null;
    } else if (e.event_type === 'agentunlinked' && e.call_id) {
      const c = get(e.call_id, e);
      c.endedAt = e.occurred_at; c.complete = true;
      c.durationSeconds = Number.isFinite(e.duration_seconds) && e.duration_seconds > 0 ? e.duration_seconds : c.startedAt != null ? Math.round((e.occurred_at - c.startedAt) / 1000) : 0;
      if (c.startedAt == null) c.startedAt = e.occurred_at - c.durationSeconds * 1000;
      c.phone ||= e.phone || ''; c.queue ||= e.queue || ''; c.callType ||= e.call_type || null;
    } else if (e.event_type === 'call_observed' || e.event_type === 'call_observed_end') {
      let p = {}; try { p = JSON.parse(e.payload || '{}'); } catch {}
      const id = p.callId || p.payload?.callId || e.call_id;
      if (!id) continue;
      const c = get(id, e);
      if (e.event_type === 'call_observed') c.startedAt ??= e.occurred_at;   // already running when first seen
      else if (!c.complete) { c.endedAt = e.occurred_at; }
    }
  }
  return order.map(k => calls.get(k)).filter(c => c.startedAt != null);
}

// Half-hour slots of the data day: the Arabicss history's numbers for calls that started in the slot,
// how many employees were (on average) available / on a call / on break, and the queue samples.
const SLOT_MS = 30 * 60000;
function slotsOf(w, records, states, samples) {
  const out = [];
  for (let t = w.start; t < w.end; t += SLOT_MS) {
    const end = t + SLOT_MS;
    const mine = records.filter(r => { const at = r.startMs ?? r.endMs; return at != null && at >= t && at < end; });
    const m = A.summarize(mine).report;
    const share = state => states.reduce((n, s) => {
      if (s.state !== state) return n;
      const a = Math.max(t, Date.parse(s.startedAt)), b = Math.min(end, Date.parse(s.endedAt));
      return b > a ? n + (b - a) : n;
    }, 0) / SLOT_MS;
    const q = samples.filter(x => x.observed_at >= t && x.observed_at < end);
    out.push({ start: iso(t), operating: t < w.operatingEnd, calls: m.calls, answered: m.answered, abandoned: m.abandoned, shortAbandoned: m.shortAbandoned, sla: m.sla, asa: m.asa,
      ready: Math.round(share('ready') * 10) / 10, onCall: Math.round(share('on_call') * 10) / 10, onBreak: Math.round(share('break') * 10) / 10,
      waitingMax: q.length ? Math.max(...q.map(x => x.waiting)) : null, longestWait: q.length ? Math.max(...q.map(x => x.longest_wait ?? 0)) : null, samples: q.length });
  }
  return out;
}

function setup(app) {
  const { db } = app;
  const cache = new Map();
  const names = async () => new Map((await db.prepare('SELECT id, name, employee_code, active, deleted_at FROM employees').all()).map(e => [e.id, e]));
  // Events of many sessions in one query, grouped by session.
  const bySession = rows => { const m = new Map(); for (const e of rows) { if (!m.has(e.session_id)) m.set(e.session_id, []); m.get(e.session_id).push(e); } return m; };
  const sessionRow = s => ({ id: String(s.id), employeeId: s.employee_id, extension: s.extension, issuedAt: s.issued_at, lastSeen: s.last_seen, expiresAt: s.expires_at,
    revokedAt: s.revoked_at ?? null, reason: s.revoke_reason || null, workStartedAt: s.work_started_at ?? null });

  // Everything for one data day.
  async function day(date, now = app.now()) {
    const w = dayWindow(date), from = w.start - 12 * 3600000;
    const [ev, ses, h, dec] = await Promise.all([db.prepare('SELECT MAX(id) m FROM events').get(), db.prepare('SELECT MAX(COALESCE(revoked_at, 0)) m, COUNT(*) n FROM employee_sessions').get(), app.dayHistory(date, now),
      db.prepare('SELECT MAX(id) m FROM shift_decisions').get()]);
    const key = [date, ev.m, ses.m, ses.n, h.key, dec.m, now >= w.end + 12 * 3600000 ? 'settled' : Math.floor(now / 5000)].join('|');
    if (cache.has(key)) return cache.get(key);
    const [people, rows, allEvents, decisions, samples] = await Promise.all([names(),
      db.prepare('SELECT * FROM employee_sessions WHERE issued_at < ? AND COALESCE(revoked_at, expires_at) > ? ORDER BY issued_at').all(w.end, from),
      db.prepare(`SELECT * FROM events WHERE session_id IN (SELECT id FROM employee_sessions WHERE issued_at < ? AND COALESCE(revoked_at, expires_at) > ?) ORDER BY occurred_at, id`).all(w.end, from),
      db.prepare(`SELECT d.* FROM shift_decisions d JOIN employee_sessions s ON s.id = d.session_id WHERE s.issued_at < ? AND COALESCE(s.revoked_at, s.expires_at) > ? ORDER BY d.decided_at`).all(w.end, from),
      db.prepare('SELECT observed_at, waiting, longest_wait FROM live_snapshots WHERE observed_at >= ? AND observed_at < ? ORDER BY observed_at').all(w.start, w.end)]);
    const grouped = bySession(allEvents);
    const sessions = [], spans = [], calls = [], breakEvents = [], logins = [];
    for (const s of rows) {
      const events = grouped.get(s.id) || [], sp = spansOf(s, events);
      const firstWork = sp.find(p => WORK.has(p.state) && p.state !== 'break' && numeric(p.extension));
      sessions.push({ ...sessionRow(s), workStartedAt: firstWork ? firstWork.started : null, extension: firstWork?.extension || s.extension });
      spans.push(...sp);
      calls.push(...callsOf(s, events));
      for (const e of events) {
        if (e.event_type === 'break_end' && e.duration_seconds > 0) breakEvents.push({ employeeId: s.employee_id, extension: e.extension, startedAt: iso(e.occurred_at - e.duration_seconds * 1000), endedAt: iso(e.occurred_at), running: false });
        if (e.event_type === 'session_login' && numeric(e.extension)) logins.push(e);
      }
    }
    const at = attendance(sessions.filter(s => s.issuedAt < w.end), spans, { start: w.start, operatingEnd: w.operatingEnd, end: w.end, now });
    const states = mergeBreaks(at.states, breakEvents.filter(b => Date.parse(b.endedAt) > w.start && Date.parse(b.startedAt) < w.end), w.operatingEnd);
    const totals = breakTotals(states);

    // ---- calls of the day (by start time), plus Arabicss history matching ----
    const dayCalls = calls.filter(c => c.startedAt >= w.start && c.startedAt < w.end);
    const matched = matchHistory(h.records, dayCalls, at.sessions, people);
    const allCalls = [...dayCalls, ...matched.recovered].map(c => ({ ...c, employee: people.get(c.employeeId)?.name || '', outsideHours: c.startedAt >= w.operatingEnd || A.purpose(c.queue) === '0',
      startedAt: iso(c.startedAt), endedAt: iso(c.endedAt) })).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

    // ---- per employee ----
    const decided = new Map(decisions.map(d => [String(d.session_id), { action: d.action, note: d.note, decidedAt: iso(d.decided_at), decidedBy: d.decided_by }]));
    const daySessions = at.sessions.filter(s => (s.workStartedAt ?? s.issuedAt) < w.end && Date.parse(s.observedThrough) > w.start).map(s => ({ ...s, decision: decided.get(s.id) || null }));
    const ids = new Set([...daySessions.filter(s => s.workStartedAt != null && s.daySeconds > 0).map(s => s.employeeId), ...allCalls.map(c => c.employeeId).filter(Boolean)]);
    const employees = [...ids].map(id => {
      const mine = allCalls.filter(c => c.employeeId === id && !c.outsideHours), done = mine.filter(c => c.complete);
      const st = states.filter(s => s.employeeId === id && !s.outsideHours), sum = k => st.filter(s => s.state === k).reduce((n, s) => n + s.durationSeconds, 0);
      const ses = daySessions.filter(s => s.employeeId === id && s.workStartedAt != null);
      const t = totals.find(x => x.employeeId === id) || {};
      const logouts = ses.filter(s => s.revokedAt != null && KNOWN_CLOSE.has(s.reason || '')).map(s => s.revokedAt);
      // Outside the extension: shown for explanation, never part of work time or any other total.
      const out = k => st.filter(s => (s.state === 'offline' || s.state === 'unknown') && (s.outKind || 'gap') === k).reduce((n, s) => n + s.durationSeconds, 0);
      const ready = sum('ready'), onCall = sum('on_call'), brk = t.totalBreakSeconds || 0;
      return { employeeId: id, name: people.get(id)?.name || 'حساب محذوف', calls: mine.length, inbound: mine.filter(c => c.callType === 'incoming').length, outbound: mine.filter(c => c.callType === 'outgoing').length,
        answered: done.length, fromHistory: mine.filter(c => c.source === 'history').length, talkSeconds: done.reduce((n, c) => n + c.durationSeconds, 0),
        averageCallSeconds: done.length ? Math.round(done.reduce((n, c) => n + c.durationSeconds, 0) / done.length) : null, longCalls: done.filter(c => c.durationSeconds > RULES.callAlertSeconds).length,
        workSeconds: ready + onCall + brk, readySeconds: ready, callSeconds: onCall, breakSeconds: brk, breakCount: t.breakCount || 0,
        ongoingBreakSeconds: t.ongoingBreakSeconds || 0, gapSeconds: out('gap'), outArabicssSeconds: out('arabicss'), outExtensionSeconds: out('extension'), outBrowserSeconds: out('browser'),
        firstLogin: ses.length ? iso(Math.min(...ses.map(s => s.workStartedAt))) : null, lastLogout: logouts.length ? iso(Math.max(...logouts)) : null };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const out = { date, window: { start: iso(w.start), operatingEnd: iso(w.operatingEnd), end: iso(w.end) }, sessions: daySessions, states, calls: allCalls, employees,
      history: { report: h.report, queues: h.queues, missed: h.missed, attribution: matched.summary, unattributed: matched.unattributed }, slots: slotsOf(w, h.records, states, samples), serverNow: iso(now) };
    Object.defineProperty(out, 'raw', { value: { sessions, states, records: h.records } });
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    cache.set(key, out);
    return out;
  }

  // Arabicss history ↔ connector calls. Answered history calls are matched by phone and time; an
  // answered call the connector did not see goes to the one employee working on that extension then.
  function matchHistory(records, calls, sessions, people) {
    const used = new Set(), recovered = [], unattributed = [];
    let already = 0;
    for (const r of records) {
      if (String(r.status).toLowerCase() !== 'success' || r.startMs == null) continue;
      const tolerance = (r.precision === 'minute' ? 60000 : 0) + ((r.waitSeconds || 0) + 120) * 1000;
      const phone = digits(r.phone);
      const hit = calls.find(c => !used.has(c) && phone && digits(c.phone) === phone && Math.abs(c.startedAt - r.startMs) <= tolerance);
      if (hit) { used.add(hit); already++; continue; }
      const t = r.startMs + (r.waitSeconds || 0) * 1000;
      const owners = r.extension ? sessions.filter(s => s.extension === r.extension && s.workStartedAt != null && s.workStartedAt - 60000 <= t
        && t <= (s.running ? Infinity : Date.parse(s.observedThrough) + GAP_MS)) : [];
      let who = [...new Set(owners.map(s => s.employeeId))];
      // Nobody logged in on the extension at that moment, but the same employee was on it just before and just after.
      if (!who.length && r.extension) {
        const on = sessions.filter(s => s.extension === r.extension && s.workStartedAt != null);
        const before = on.filter(s => Date.parse(s.observedThrough) <= t && t - Date.parse(s.observedThrough) <= 1800000).sort((a, b) => Date.parse(b.observedThrough) - Date.parse(a.observedThrough))[0];
        const after = on.filter(s => s.workStartedAt >= t && s.workStartedAt - t <= 1800000).sort((a, b) => a.workStartedAt - b.workStartedAt)[0];
        if (before && after && before.employeeId === after.employeeId) who = [before.employeeId];
      }
      if (who.length === 1) {
        const end = r.endMs ?? (t + (r.durationSeconds || 0) * 1000);
        recovered.push({ callId: 'history:' + r.index, employeeId: who[0], extension: r.extension, phone: r.phone, queue: r.queue, callType: 'incoming', startedAt: t, endedAt: end,
          durationSeconds: r.durationSeconds ?? Math.round((end - t) / 1000), complete: true, source: 'history', startKnown: r.precision === 'second' });
      } else unattributed.push({ index: r.index, time: r.start, phone: r.phone, extension: r.extension, queue: r.queue, reason: !r.extension ? 'no_extension' : who.length ? 'several_employees' : 'nobody_on_extension' });
    }
    return { recovered, unattributed, summary: { alreadySeen: already, recovered: recovered.length, unattributed: unattributed.length } };
  }

  // State of one employee at a moment, from the day's states.
  function stateAt(states, sessions, employeeId, t) {
    const s = states.find(x => x.employeeId === employeeId && x.state !== 'offline' && Date.parse(x.startedAt) <= t && t < Date.parse(x.endedAt));
    if (s) return { state: s.state, since: s.startedAt, extension: s.extension };
    const inShift = sessions.find(x => x.employeeId === employeeId && x.workStartedAt != null && x.workStartedAt <= t && t <= Date.parse(x.observedThrough) + GAP_MS);
    if (inShift) return { state: 'unknown', since: null, extension: inShift.extension };
    const left = sessions.filter(x => x.employeeId === employeeId && x.workStartedAt != null && Date.parse(x.observedThrough) < t).sort((a, b) => Date.parse(b.observedThrough) - Date.parse(a.observedThrough))[0];
    // A supervisor's decision on the end of that shift: still responsible (left early), or the shift really ended.
    if (left) { const kind = outKind(left.reason); return { state: left.decision?.action === 'include' ? 'left_responsible' : left.decision?.action === 'exclude' ? 'shift_ended' : kind === 'gap' ? 'disconnected' : 'out_' + kind, since: left.observedThrough, extension: left.extension }; }
    return { state: 'not_started', since: null, extension: '' };
  }

  // Who could have answered a missed call.
  app.missedContext = async function missedContext(date, index, now = app.now()) {
    const d = await day(date, now), r = d.raw.records[index];
    if (!r || String(r.status).toLowerCase() !== 'abandoned') return null;
    const entry = r.startMs, exit = r.endMs ?? (r.startMs != null && r.waitSeconds != null ? r.startMs + r.waitSeconds * 1000 : null);
    if (entry == null) return { call: r, employees: [], note: 'وقت المكالمة غير موجود في السجل' };
    const slack = r.precision === 'minute' ? 59000 : 0, people = await names();
    const ids = [...new Set(d.sessions.filter(s => s.workStartedAt != null).map(s => s.employeeId))];
    const employees = ids.map(id => {
      const a = stateAt(d.states, d.sessions, id, entry), b = stateAt(d.states, d.sessions, id, exit ?? entry);
      const readyDuring = d.states.find(s => s.employeeId === id && s.state === 'ready' && Date.parse(s.startedAt) < (exit ?? entry) + slack && Date.parse(s.endedAt) > entry - slack);
      const changed = slack && d.states.some(s => s.employeeId === id && Date.parse(s.startedAt) > entry - slack && Date.parse(s.startedAt) < entry + slack);
      return { employeeId: id, name: people.get(id)?.name || '', atEntry: a.state, atExit: b.state, extension: a.extension || b.extension, since: a.since,
        sinceSeconds: a.since ? Math.round((entry - Date.parse(a.since)) / 1000) : null, readyDuringWait: !!readyDuring, readyAt: readyDuring ? iso(Math.max(Date.parse(readyDuring.startedAt), entry)) : null, uncertain: !!changed };
    }).filter(e => !['not_started'].includes(e.atEntry) || !['not_started'].includes(e.atExit))
      .sort((x, y) => Number(y.readyDuringWait) - Number(x.readyDuringWait) || x.name.localeCompare(y.name, 'ar'));
    return { call: { index, date: r.date, start: r.start, end: r.end, phone: r.phone, queue: r.queue, queueLabel: A.queueLabel(r.queue), waitSeconds: r.waitSeconds, precision: r.precision,
      enteredAt: iso(entry), leftAt: iso(exit) }, employees, readyCount: employees.filter(e => e.readyDuringWait).length };
  };

  // Right now: each active employee's state, how long, and the current call.
  // The last 4 hours of a session's events are enough to tell its current state (the admin page asks every second).
  const LIVE_WINDOW_MS = 4 * 3600000;
  app.live = async function live(now = app.now()) {
    const today = businessDay(now), w = dayWindow(today);
    const latestSql = 'SELECT s.* FROM employee_sessions s WHERE s.id = (SELECT id FROM employee_sessions x WHERE x.employee_id = s.employee_id ORDER BY issued_at DESC, id DESC LIMIT 1)';
    const [people, latest] = await Promise.all([names(), db.prepare(latestSql).all()]);
    // Recent events of today's latest sessions, through the (session_id, occurred_at) index, 40 sessions per query.
    const wanted = latest.filter(s => (s.revoked_at ?? s.expires_at) >= w.start), from = new Map(wanted.map(s => [s.id, Math.max(s.issued_at, now - LIVE_WINDOW_MS)]));
    const chunks = [];
    for (let i = 0; i < wanted.length; i += 40) chunks.push(wanted.slice(i, i + 40));
    const recentRows = (await Promise.all(chunks.map(part => db.prepare('SELECT * FROM events WHERE session_id IN (' + part.map(() => '?').join(',') + ') AND occurred_at >= ? ORDER BY occurred_at, id')
      .all(...part.map(s => s.id), Math.min(...part.map(s => from.get(s.id))))))).flat().filter(e => e.occurred_at >= from.get(e.session_id));
    const recent = bySession(recentRows);
    const out = [];
    for (const [id, e] of people) {
      if (!e.active || e.deleted_at) continue;
      const s = latest.find(x => x.employee_id === id);
      const base = { employeeId: id, name: e.name, extension: s?.extension || '', state: 'no_session', since: null, phone: '', queue: '', callId: '', lastEvidence: null };
      if (!s || (s.revoked_at ?? s.expires_at) < w.start && s.issued_at < w.start) { out.push(base); continue; }
      const open = !s.revoked_at && s.expires_at > now;
      const events = recent.get(s.id) || [], sp = spansOf(s, events), last = sp.at(-1);
      const lastAt = events.length ? events.at(-1).occurred_at : s.issued_at;
      if (!open) { const kind = outKind(s.revoke_reason); out.push({ ...base, state: kind === 'gap' ? 'disconnected' : 'logged_out', outKind: kind, reason: s.revoke_reason || null, since: iso(s.revoked_at ?? s.expires_at), lastEvidence: iso(lastAt) }); continue; }
      if (!numeric(s.extension)) { out.push({ ...base, state: 'logged_in', since: iso(s.issued_at), lastEvidence: iso(lastAt) }); continue; }
      if (!last || now - last.lastEvidence >= GAP_MS) { out.push({ ...base, state: 'unknown', since: iso(last ? last.lastEvidence : s.issued_at), lastEvidence: iso(lastAt) }); continue; }
      // Since when: the start of the uninterrupted run of this state (a break or call keeps its start across short silences).
      let since = last.started;
      for (let i = sp.length - 2; i >= 0 && sp[i].state === last.state && since - sp[i].lastEvidence < GAP_MS * 20 && ['break', 'on_call'].includes(last.state); i--) since = sp[i].started;
      const call = last.state === 'on_call' ? callsOf(s, events).filter(c => !c.complete).at(-1) : null;
      if (call?.startedAt && call.startedAt < since) since = call.startedAt;
      out.push({ ...base, state: last.state, since: iso(since), phone: call?.phone || '', queue: call?.queue || '', callId: call?.callId || '', lastEvidence: iso(lastAt) });
    }
    return out;
  };

  // Break allowance for today (2 regular breaks, 30 minutes in total; the first up to 15 + 5 minutes,
  // the second gets what is left). A break seen without a permission counts at least 15 minutes;
  // a supervisor-approved extra break does not use the allowance. No regular break after 03:00.
  app.breakPolicy = async function breakPolicy(employeeId, now = app.now()) {
    const w = dayWindow(businessDay(now)), until = Math.min(now, w.operatingEnd);
    const [events, perms] = await Promise.all([
      db.prepare(`SELECT * FROM events WHERE employee_id = ? AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at, id`).all(employeeId, w.start, until),
      db.prepare('SELECT id FROM break_permissions WHERE employee_id = ? AND request_id IS NOT NULL AND created_at >= ?').all(employeeId, w.start - 3600000)]);
    const approved = new Set(perms.map(p => p.id));
    const periods = [];
    let open = null, lastBreakSign = null;
    // A break ends at its recorded end, or at the first sign of work after it (available, a call, a logout),
    // or when the next break starts: a break whose end was never recorded must not run on all day.
    const close = at => { periods.push({ ...open, seconds: Math.max(0, Math.round((at - open.at) / 1000)) }); open = null; };
    for (const e of events) {
      if (e.event_type === 'break_start' || e.event_type === 'break_observed') {
        if (open) close(lastBreakSign ?? e.occurred_at);
        let p = {}; try { p = JSON.parse(e.extra || e.payload || '{}'); } catch {}
        open = { at: e.occurred_at, estimated: e.event_type === 'break_observed', approved: p.breakPolicyKind === 'approved' || approved.has(p.breakPermissionId || p.permissionId) };
      } else if (open && (e.event_type === 'break_end' || e.event_type === 'break_end_unknown' || ['ready', 'on_call', 'logged_in'].includes(stateOf(e)) || KNOWN_CLOSE.has(e.event_type))) close(e.occurred_at);
      else if (open && stateOf(e) === 'break') lastBreakSign = e.occurred_at;
      if (open && (e.event_type === 'break_start' || e.event_type === 'break_observed')) lastBreakSign = e.occurred_at;
    }
    // Still open: running while the connector keeps showing it, otherwise it ended 90 s after the last sign.
    if (open && lastBreakSign != null && until - lastBreakSign > GAP_MS) close(lastBreakSign + GAP_MS);
    if (open) periods.push({ ...open, seconds: Math.round((until - open.at) / 1000), running: true });
    const regular = periods.filter(p => !p.approved).map(p => ({ ...p, seconds: p.estimated ? Math.max(p.seconds, RULES.breakPeriodSeconds) : p.seconds }));
    const used = regular.reduce((n, p) => n + p.seconds, 0), remaining = Math.max(0, RULES.breakBudgetSeconds - used), starts = regular.length;
    const next = starts === 0 ? Math.min(RULES.breakPeriodSeconds + RULES.breakGraceSeconds, remaining) : starts === 1 ? remaining : 0;
    const regularAvailable = now < w.operatingEnd && starts < 2 && next > 0 && !regular.some(p => p.running);
    return { startsUsed: starts, usedSeconds: used, remainingSeconds: remaining, nextAllowedSeconds: regularAvailable ? next : 0, secondRemainingSeconds: starts <= 1 ? remaining - (starts ? 0 : 0) : 0,
      regularAvailable, requiresApproval: !regularAvailable, graceSeconds: starts === 0 ? RULES.breakGraceSeconds : 0, estimated: regular.some(p => p.estimated), activeRegular: regular.some(p => p.running) };
  };

  // Is this session showing "available" right now (fresh evidence)?
  app.sessionReady = async function sessionReady(session, now = app.now()) {
    const sp = spansOf(session, await db.prepare('SELECT * FROM events WHERE session_id = ? AND occurred_at >= ? ORDER BY occurred_at, id').all(session.id, now - 3600000)), last = sp.at(-1);
    return !!last && last.state === 'ready' && now - last.lastEvidence <= 15000;
  };

  app.day = day;
}

export { setup, stateOf, spansOf, callsOf, canonical };
