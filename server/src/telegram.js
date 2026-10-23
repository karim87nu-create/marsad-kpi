'use strict';
// Telegram alerts are not migrated yet: the page shows "not linked" and nothing is sent.

function setup(app) {
  app.route('GET', '/api/telegram', ctx => {
    app.requireAdmin(ctx, 'admin');
    if (ctx.query.alerts === '1') return { alerts: [], truncated: false };
    return { configured: false, paired: false, automaticAlertsEnabled: false, rules: [], monitor: null, group: null };
  });
  app.route('POST', '/api/telegram', ctx => {
    app.requireAdmin(ctx, 'admin');
    app.fail(503, 'telegram_settings_unavailable');
  });
}

module.exports = { setup };
