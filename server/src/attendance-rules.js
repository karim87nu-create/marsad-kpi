'use strict';
// Attendance rules for مرصد الأداء (our own, replacing the old server's lib/attendance-durations.ts):
//
// 1. Work starts at the first moment the employee is ready or on a call on a real extension.
// 2. A session ends at its logout when the logout time is known (Arabicss logout, back to the
//    Arabicss login page, extension changed, tab closed, admin action). When it is not known
//    (browser closed, PC off, connection lost, session left open), it ends at the last proof of
//    real state (available / on a call / on break) + 90 seconds — what comes after is not counted.
// 3. «انقطاع رصد» is only a gap inside the shift: no evidence for more than 90 seconds while the
//    session is still going, or a lost connection followed by a new login within 2 hours.
// 4. Totals count operating hours only (09:00 → 03:00). Rows after 03:00 are kept and marked.
const GAP_MS = 90000, RECONNECT_MS = 2 * 3600000;
const KNOWN_CLOSE = new Set(['explicit_logout', 'session_logout', 'arabicss_logout', 'arabicss_login_page', 'extension_changed', 'tab_closed',
  'password_changed', 'employee_disabled', 'employee_deleted', 'manual']);
const numeric = x => /^\d{1,10}$/.test(String(x || ''));

function attendance(sessions, spans, { start, operatingEnd, end, now }) {
  const bySession = new Map();
  for (const p of spans) { if (!bySession.has(p.sessionId)) bySession.set(p.sessionId, []); bySession.get(p.sessionId).push(p); }
  for (const list of bySession.values()) list.sort((a, b) => a.started - b.started);
  const rows = [], outSessions = [];
  const push = (s, state, a, b, extra = {}) => {
    a = Math.max(a, start); b = Math.min(b, end, now);
    if (b <= a) return;
    // Split at the end of operating hours so totals can leave the night out.
    const parts = a < operatingEnd && b > operatingEnd ? [[a, operatingEnd], [operatingEnd, b]] : [[a, b]];
    for (const [x, y] of parts) rows.push({ employeeId: s.employeeId, extension: s.extension, state, startedAt: new Date(x).toISOString(), endedAt: new Date(y).toISOString(),
      durationSeconds: Math.floor((y - x) / 1000), running: false, outsideHours: x >= operatingEnd, evidenceUntil: y, ...extra });
  };
  const ordered = [...sessions].sort((a, b) => a.issuedAt - b.issuedAt);
  const effective = new Map();
  for (const s of ordered) {
    const list = bySession.get(s.id) || [];
    const workStart = numeric(s.extension) ? s.workStartedAt : null;
    // Proof of work is a real state (available, on a call, on break). A PC left on with Arabicss disconnected
    // keeps sending "state unknown"; that alone does not extend the shift.
    const real = list.filter(p => ['ready', 'on_call', 'break', 'post_call'].includes(p.state));
    const lastEvidence = real.length ? Math.max(...real.map(p => p.lastEvidence)) : list.length ? Math.min(...list.map(p => p.started)) : s.lastSeen;
    const running = s.revokedAt === null && s.expiresAt > now && now - s.lastSeen < GAP_MS;
    const known = s.revokedAt !== null && KNOWN_CLOSE.has(s.reason || '');
    const close = running ? now : known ? s.revokedAt : Math.min(lastEvidence + GAP_MS, s.revokedAt ?? s.expiresAt, s.expiresAt);
    effective.set(s.id, { close, known, workStart });
    const through = running ? now : known ? s.revokedAt : Math.min(lastEvidence, s.revokedAt ?? s.expiresAt);
    outSessions.push({ ...s, running: running && workStart !== null, closureKnown: known, observedThrough: new Date(through).toISOString(),
      startedAt: new Date(workStart ?? s.issuedAt).toISOString(), endedAt: running ? null : new Date(through).toISOString(),
      durationSeconds: workStart === null ? 0 : Math.max(0, Math.floor((through - workStart) / 1000)),
      daySeconds: workStart === null ? 0 : Math.max(0, Math.floor((Math.min(through, operatingEnd, now) - Math.max(workStart, start)) / 1000)),
      identityDelaySeconds: workStart === null ? null : Math.max(0, Math.floor((workStart - s.issuedAt) / 1000)), durationComplete: known || running, dayStart: start, dayEnd: end });
    if (workStart === null) continue;
    let cursor = workStart;
    for (let i = 0; i < list.length; i++) {
      const p = list[i], next = list[i + 1];
      if (p.started >= close) break;
      const a = Math.max(p.started, workStart);
      // The same break or call on both sides of a short silence is one continuous break or call.
      const linked = next && next.state === p.state && ['break', 'on_call'].includes(p.state);
      const b = Math.min(next ? (linked ? next.started : Math.min(next.started, p.lastEvidence + GAP_MS)) : p.lastEvidence + GAP_MS, close);
      if (a > cursor) push(s, 'unknown', cursor, a);
      if (b > a && p.state !== 'logged_in') push(s, p.state === 'post_call' ? 'ready' : p.state, a, b);
      cursor = Math.max(cursor, b);
    }
    if (running && cursor < now) push(s, 'unknown', cursor, now);
    else if (known && cursor < close) push(s, 'unknown', cursor, close);   // silent, then logged out: a gap inside the shift
  }
  // Between two sessions of the same employee.
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i], e = effective.get(s.id);
    if (e.workStart === null || s.revokedAt === null && e.close === now) continue;
    const next = ordered.slice(i + 1).find(x => x.employeeId === s.employeeId && effective.get(x.id).workStart !== null);
    const nextStart = next ? effective.get(next.id).workStart : null;
    if (nextStart !== null && !e.known && nextStart - e.close <= RECONNECT_MS) push(s, 'unknown', e.close, nextStart, { reconnect: true });
    else if (e.known) push(s, 'offline', e.close, nextStart ?? Math.min(operatingEnd, now));
  }
  for (const r of rows) if (r.state !== 'offline') r.running = !!outSessions.find(x => x.running && x.employeeId === r.employeeId && x.extension === r.extension) && Date.parse(r.endedAt) >= now - 1000;
  return { sessions: outSessions, states: rows.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)) };
}

// Break time is every moment Arabicss showed the employee on break: the recorded breaks (start → end)
// together with the break state seen in the heartbeats, merged so nothing is counted twice. A break with
// no recorded end still counts for as long as Arabicss kept showing it.
function mergeBreaks(states, recorded, operatingEnd) {
  const key = x => x.employeeId + '|' + x.extension, groups = new Map();
  const add = (k, a, b, running, base) => { if (!groups.has(k)) groups.set(k, { base, list: [] }); groups.get(k).list.push([a, b, running]); };
  for (const b of recorded) add(key(b), Date.parse(b.startedAt), Date.parse(b.endedAt), !!b.running, b);
  for (const s of states) if (s.state === 'break' || s.state === 'break_unconfirmed') add(key(s), Date.parse(s.startedAt), Date.parse(s.endedAt), !!s.running, s);
  const merged = new Map();
  for (const [k, g] of groups) {
    const out = [];
    for (const [a, b, r] of g.list.sort((x, y) => x[0] - y[0])) { const last = out.at(-1); if (last && a <= last[1]) { last[1] = Math.max(last[1], b); last[2] = last[2] || r; } else out.push([a, b, r]); }
    merged.set(k, { base: g.base, list: out });
  }
  const rest = [];
  for (const s of states) {
    if (s.state === 'break' || s.state === 'break_unconfirmed') continue;
    let pieces = [[Date.parse(s.startedAt), Date.parse(s.endedAt)]];
    for (const [a, b] of merged.get(key(s))?.list || []) pieces = pieces.flatMap(([x, y]) => b <= x || a >= y ? [[x, y]] : [[x, Math.min(a, y)], [Math.max(b, x), y]].filter(([u, v]) => v > u));
    for (const [x, y] of pieces) rest.push({ ...s, startedAt: new Date(x).toISOString(), endedAt: new Date(y).toISOString(), durationSeconds: Math.floor((y - x) / 1000), running: s.running && y === Date.parse(s.endedAt) });
  }
  const breaks = [];
  for (const { base, list } of merged.values()) for (const [a, b, running] of list) {
    const parts = a < operatingEnd && b > operatingEnd ? [[a, operatingEnd], [operatingEnd, b]] : [[a, b]];
    for (const [x, y] of parts) breaks.push({ employeeId: base.employeeId, extension: base.extension, state: 'break', startedAt: new Date(x).toISOString(), endedAt: new Date(y).toISOString(),
      durationSeconds: Math.floor((y - x) / 1000), running: running && y === b, outsideHours: x >= operatingEnd, evidenceUntil: y,
      recorded: recorded.some(r => key(r) === key(base) && Date.parse(r.startedAt) < y && Date.parse(r.endedAt) > x) });
  }
  return [...rest, ...breaks].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

// Per employee: break time inside operating hours, finished and still running.
function breakTotals(states) {
  const by = new Map();
  for (const s of states) {
    if (s.state !== 'break' || s.outsideHours) continue;
    const t = by.get(s.employeeId) || { employeeId: s.employeeId, completedBreakSeconds: 0, ongoingBreakSeconds: 0, totalBreakSeconds: 0, breakCount: 0 };
    t[s.running ? 'ongoingBreakSeconds' : 'completedBreakSeconds'] += s.durationSeconds; t.totalBreakSeconds += s.durationSeconds; t.breakCount++;
    by.set(s.employeeId, t);
  }
  return [...by.values()];
}

module.exports = { attendance, mergeBreaks, breakTotals, KNOWN_CLOSE };
