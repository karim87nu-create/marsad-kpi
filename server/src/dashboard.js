'use strict';
// GET /api/dashboard — the computations live in legacy-dashboard.js and legacy-attendance.js,
// which run the old server's own logic (src/legacy-logic) on this server's tables.
const { businessDay, validDate, iso } = require('./time');

function setup(app) {
  const { fail } = app;

  // Same request handling and response as the old app/api/dashboard/route.ts.
  app.route('GET', '/api/dashboard', ctx => {
    app.requireAdmin(ctx);
    const q = ctx.query, today = businessDay(ctx.now), date = q.date || today;
    if (!validDate(date) || date > today) fail(400, 'invalid_date');
    const employee = q.employee || '', extension = q.extension || '';
    if (employee && !/^\d+$/.test(employee) || extension && !/^\d{1,10}$/.test(extension)) fail(400, 'invalid_filter');
    if (q.live === '1' && q.all !== '1') {
      const { presence, liveQueue } = app.oldLivePresence(date, ctx.now);
      return { presence, liveQueue, summary: {}, performance: [], calls: [], timeline: [], shifts: [], attendance: null, durations: [], completedBreaks: [], breakTotals: [],
        date, today, serverNow: iso(ctx.now), liveOnly: true, dataComplete: true };
    }
    return app.oldDashboard(date, { employee, extension, attendance: q.attendance === '1', all: q.all === '1' }, ctx.now);
  });
}

module.exports = { setup };
