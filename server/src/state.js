'use strict';
// Turns stored sessions + events into state spans, breaks, calls and live presence.
// Pure functions: everything is derived from what the extension actually reported.
const { RULES, iso } = require('./time');

const EXPLICIT_LOGOUT = new Set(['manual', 'arabicss_logout', 'arabicss_login_page']);
const STALE = RULES.presenceStaleMs;
const parse = s => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

// State implied by one event, or undefined when the event says nothing about state.
function stateOf(e) {
  switch (e.event_type) {
    case 'agentlinked': case 'call_observed': return 'on_call';
    case 'agentunlinked': return 'post_call';
    case 'call_observed_end': return e.state === 'ready' ? 'ready' : 'post_call';
    case 'break_start': case 'break_observed': return 'break';
    case 'break_end': case 'break_end_unknown': return e.state === 'ready' ? 'ready' : 'post_call';
    case 'page_closed': return 'unknown';
    case 'session_login': return 'logged_in';
    case 'heartbeat': {
      const p = parse(e.payload);
      if (p.evidence) return undefined;                      // raw source evidence, not a transition
      return ['ready', 'on_call', 'break', 'unknown'].includes(e.state) ? e.state : undefined;
    }
    default: return undefined;
  }
}

// Session end used for analysis: revocation, else expiry, else "now".
const sessionEnd = (s, now) => Math.min(s.revoked_at ?? Infinity, s.expires_at, now);

function analyzeSession(s, events, now) {
  const end = sessionEnd(s, now);
  const running = !s.revoked_at && s.expires_at > now;
  const spans = [];
  let state = 'logged_in', since = s.issued_at, last = s.issued_at;
  const push = (to, st = state, from = since) => { if (to > from) spans.push({ state: st, start: from, end: to }); };
  const breaks = [], calls = new Map();
  let openBreak = null;

  for (const e of events) {
    const t = Math.max(e.occurred_at, s.issued_at);
    // Silence longer than the stale limit is "انقطاع رصد" until the next evidence.
    if (t - last > STALE && state !== 'unknown') { push(last + STALE); state = 'unknown'; since = last + STALE; }
    const next = stateOf(e);
    if (next !== undefined && next !== state) { push(t); state = next; since = t; }
    last = Math.max(last, t);

    if (e.event_type === 'break_start' || e.event_type === 'break_observed') {
      if (!openBreak) openBreak = { start: e.event_type === 'break_start' ? t : null, observedAt: t, extension: e.extension };
    } else if ((e.event_type === 'break_end' || e.event_type === 'break_end_unknown') && openBreak) {
      breaks.push({ ...openBreak, end: t, endKnown: true });
      openBreak = null;
    }
    if (['agentlinked', 'call_observed'].includes(e.event_type)) {
      const p = parse(e.payload), id = e.call_id || p.callId || 'call:' + e.id;
      if (!calls.has(id)) calls.set(id, {
        callId: id, extension: e.extension, startedAt: e.event_type === 'agentlinked' ? t : null, observedAt: t,
        phone: e.phone || '', queue: e.queue || '', callType: e.call_type || null, eventId: e.id,
      });
    }
    if (['agentunlinked', 'call_observed_end'].includes(e.event_type)) {
      const p = parse(e.payload), id = e.call_id || p.callId;
      const c = id && calls.get(id);
      if (c && !c.endedAt) {
        c.endedAt = t;
        c.durationSeconds = e.event_type === 'agentunlinked' && Number.isFinite(e.duration_seconds) ? e.duration_seconds : null;
        c.endEventId = e.id;
      }
    }
  }
  if (end - last > STALE && state !== 'unknown') { push(last + STALE); state = 'unknown'; since = last + STALE; }
  push(end);
  if (openBreak) breaks.push({ ...openBreak, end: null, endKnown: false, running: running && state === 'break' });
  return { spans, breaks, calls: [...calls.values()], state, stateSince: since, lastEvidence: last, running, end };
}

function closure(s, decisions) {
  const decision = decisions.filter(d => d.session_id === s.id).sort((a, b) => b.decided_at - a.decided_at)[0];
  if (decision) return { excluded: decision.action === 'exclude', reason: decision.action === 'exclude' ? 'admin_shift_excluded' : 'admin_responsibility_included', note: decision.note, decidedAt: decision.decided_at };
  if (EXPLICIT_LOGOUT.has(s.revoke_reason)) return { excluded: true, reason: 'logout_shift_ended' };
  return { excluded: false, reason: s.revoke_reason === 'work_resumed' ? 'work_resumed' : 'closure_uncertain' };
}

module.exports = { analyzeSession, closure, stateOf, sessionEnd, EXPLICIT_LOGOUT, parse };
