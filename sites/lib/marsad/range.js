// Combine operating days without averaging daily percentages or counting nights as work.
import { addDays, validDate, businessDay, iso } from './time.js';
import { summarize } from './arabicss.js';
export function setup(app) {
  app.range = async (from, to, now = app.now()) => {
    if (!validDate(from) || !validDate(to) || to < from || to > businessDay(now)) app.fail(400, 'اختار فترة صحيحة من وإلى');
    const dates = [];
    for (let d = from; d <= to; d = addDays(d, 1)) { dates.push(d); if (dates.length > 93) app.fail(400, 'اختار فترة لا تتجاوز 93 يوم'); }
    if (dates.length === 1) return app.day(from, now);
    const days = [], records = [];
    for (const date of dates) { const d = await app.day(date, now); days.push(d); records.push(...d.raw.records); }
    const sum = summarize(records), reports = days.map(d => d.history.report).filter(Boolean), employees = new Map();
    const fields = ['calls','inbound','outbound','answered','fromHistory','talkSeconds','longCalls','workSeconds','readySeconds','callSeconds','breakSeconds','breakCount','ongoingBreakSeconds','gapSeconds','outArabicssSeconds','outExtensionSeconds','outBrowserSeconds'];
    for (const d of days) for (const e of d.employees) {
      let out = employees.get(e.employeeId);
      if (!out) { out = { employeeId: e.employeeId, name: e.name, firstLogin: null, lastLogout: null, overBreakDays: 0, daysWorked: 0, ...Object.fromEntries(fields.map(k => [k, 0])) }; employees.set(e.employeeId, out); }
      out.daysWorked++; if (e.breakSeconds > 1800) out.overBreakDays++;
      for (const k of fields) out[k] += e[k] || 0;
      if (e.firstLogin && (!out.firstLogin || e.firstLogin < out.firstLogin)) out.firstLogin = e.firstLogin;
      if (e.lastLogout && (!out.lastLogout || e.lastLogout > out.lastLogout)) out.lastLogout = e.lastLogout;
    }
    for (const e of employees.values()) e.averageCallSeconds = e.answered ? Math.round(e.talkSeconds / e.answered) : null;
    const flat = key => days.flatMap(d => d[key].map(row => ({ ...row, businessDate: d.date })));
    return { date: from, from, to, days: dates.length, serverNow: iso(now), window: { start: days[0].window.start, end: days.at(-1).window.end, operatingEnd: days.at(-1).window.operatingEnd },
      employees: [...employees.values()], sessions: flat('sessions'), states: flat('states'), calls: flat('calls'), slots: flat('slots'),
      history: { report: reports.length ? { ...sum.report, date: from, from, to, importedAt: reports.map(r => r.importedAt).sort().at(-1), verifiedTotal: reports.length === dates.length && reports.every(r => r.verifiedTotal), missingCalendarDates: [...new Set(days.flatMap(d => d.history.report?.missingCalendarDates || (d.history.report ? [] : [d.date])))] } : null,
        queues: sum.queues, missed: days.flatMap(d => d.history.missed.map(m => ({ ...m, businessDate: d.date }))), unattributed: days.flatMap(d => d.history.unattributed.map(m => ({ ...m, businessDate: d.date }))),
        attribution: Object.fromEntries(['alreadySeen','recovered','unattributed'].map(k => [k, days.reduce((n,d) => n + (d.history.attribution[k] || 0), 0)])) } };
  };
}
