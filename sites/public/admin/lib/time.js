// Cairo wall-clock helpers. The data day runs 09:00 → 09:00 next day (Cairo);
// operating hours run 09:00 → 03:00. Egypt observes DST, so offsets come from Intl.

const ZONE = 'Africa/Cairo';
const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

const RULES = {
  businessStartHour: 9,   // data day starts 09:00
  operatingEndHour: 3,    // operating hours end 03:00 next day
  slaSeconds: 10,
  shortAbandonSeconds: 7,
  callAlertSeconds: 240,
  breakPeriodSeconds: 900,
  breakBudgetSeconds: 1800,
  breakGraceSeconds: 300,
  presenceStaleMs: 90000,
};

function cairoParts(ms) {
  const p = {};
  for (const x of partsFormat.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return p;
}

// Cairo wall time → UTC ms (two passes resolve the DST offset).
function cairoToUtc(y, m, d, h = 0, mi = 0, s = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const p = cairoParts(utc);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    utc += guess - wall;
  }
  return utc;
}

const pad = n => String(n).padStart(2, '0');
const isoDate = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
const parseDate = date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const addDays = (date, n) => {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};

// Data day that contains this instant (before 09:00 belongs to the previous day).
function businessDay(ms) {
  const p = cairoParts(ms);
  const date = isoDate(p.year, p.month, p.day);
  return p.hour < RULES.businessStartHour ? addDays(date, -1) : date;
}

function dayWindow(date) {
  const [y, m, d] = parseDate(date);
  const next = parseDate(addDays(date, 1));
  return {
    date,
    start: cairoToUtc(y, m, d, RULES.businessStartHour),
    end: cairoToUtc(next[0], next[1], next[2], RULES.businessStartHour),
    operatingEnd: cairoToUtc(next[0], next[1], next[2], RULES.operatingEndHour),
  };
}

function isOperating(ms) {
  const w = dayWindow(businessDay(ms));
  return ms >= w.start && ms < w.operatingEnd;
}

const validDate = date => {
  const p = parseDate(date);
  if (!p) return false;
  const back = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).toISOString().slice(0, 10);
  return back === date;
};

const iso = ms => (ms == null || !Number.isFinite(ms) ? null : new Date(ms).toISOString());

export { RULES, ZONE, cairoParts, cairoToUtc, businessDay, dayWindow, isOperating, addDays, parseDate, validDate, isoDate, iso };
