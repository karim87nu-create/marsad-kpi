'use strict';
// Loads the real admin page (all scripts, including the ones admin-layout.js adds at runtime)
// against this server and walks every section. Requires jsdom (dev only).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { start } = require('./helpers');
const { cairoToUtc } = require('../src/time');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch {}
const ROOT = path.join(__dirname, '..', '..');
const OLD_API = 'https://marsad-kpi-live.karim87nu.chatgpt.site';
const RUNTIME = ['admin-live-groups.js', 'admin-view-model-3.7.1.js', 'admin-shell-3.7.2.js', 'admin-derived-3.7.2.js', 'admin-profile-3.7.1.js', 'admin-access-3.7.1.js'];

test('real admin page works against the new server', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  const t = await start({ at: cairoToUtc(2026, 10, 22, 14, 0, 0) });
  try {
    const admin = await t.admin();
    const e = await t.employee(admin);
    const s = await t.session('1234');
    await t.event(s.token, 'session_login', { state: 'bound' });
    await t.event(s.token, 'heartbeat', { state: 'ready' });
    await t.tick(s.token, 60000, 'ready');
    await t.event(s.token, 'agentlinked', { callId: '7', phone: '0155', queue: '2001', callType: 'incoming', state: 'on_call' });
    const tok = (await admin('POST', '/api/history', { action: 'token' })).body.token;
    await t.call('POST', '/api/history', { headers: { 'x-history-token': tok }, body: { rows: [
      ['Queue', 'Agent', 'Call Date', 'Start Time', 'End Time', 'Duration', 'Wait Time', 'Caller ID', 'Status', 'Trunk'],
      ['2001', '', '2026-10-22', '14:00:30', '14:00:50', '00:00:00', '00:00:20', '0166', 'Abandoned', 'T']], expectedCount: 1, reportDate: '2026-10-22' } });
    await t.call('POST', '/api/history', { headers: { 'x-history-token': tok }, body: { action: 'live', rows: [['2001', '', 'A', '', '', '', '', '', '0:00:09', '0177', 'On Wait']],
      capture: { id: crypto.randomUUID(), kind: 'native_report_snapshot', pageId: crypto.randomUUID(), sequence: 1, changed: true, observedAt: new Date(t.clock.now).toISOString(), timeBasis: 'server-clock-v1' } } });

    const errors = [], requests = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', err => errors.push(String(err.message).slice(0, 300)));
    vc.on('error', (...a) => errors.push(a.join(' ').slice(0, 300)));
    const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').split(OLD_API).join(t.base);
    const html = read('admin.html')
      .replace(/<script src="admin-layout[^"]*"><\/script>/, '')
      .replace(/<script src="([^"?]+)[^"]*"><\/script>/g, (m, f) => '<script>' + read(f) + '</script>')
      .replace(/<link[^>]*>/g, '')
      .replace('</body>', RUNTIME.map(f => '<script>' + read(f) + '</script>').join('') + '</body>');
    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://karim87nu-create.github.io/marsad-kpi/admin.html',
      beforeParse(w) {
        w.fetch = (u, o) => { requests.push(String(u).replace(t.base, '')); return fetch(u, o); };
        w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
        w.HTMLDialogElement.prototype.close = function () { this.open = false; };
        w.confirm = () => true;
        w.scrollTo = () => {};
        w.Element.prototype.scrollIntoView = function () {};
      } });
    const w = dom.window, $ = id => w.document.getElementById(id);
    try {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    $('password').value = 'master-pass';
    $('loginButton').click();
    await settle(1500);
    assert.equal($('login').hidden, true, 'logged in');
    assert.match($('syncStatus').textContent, /آخر تحديث/, 'live refresh worked: ' + $('syncStatus').textContent + ' ' + $('message').textContent);
    assert.match($('employeeLiveGroups').textContent, /Ahmed/);
    assert.match($('employeeLiveGroups').textContent, /في مكالمة/);
    const cards = $('liveCards').textContent;
    assert.match(cards, /عملاء منتظرين\s*1/, cards);

    for (const view of ['intervention', 'queue', 'analysis', 'metrics', 'profile', 'attendance', 'shifts', 'calls', 'missed', 'unattributed', 'customers', 'followup', 'reports', 'messages', 'telegram', 'alertLog', 'settings', 'adminUsers', 'audit', 'health', 'guide']) {
      w.showTab(view);
      await settle(400);
    }
    w.showTab('missed');
    await settle(800);
    assert.match($('missedRows').textContent, /0166/, 'missed call listed');
    $('missedRows').querySelector('button[data-missed]').click();
    await settle(800);
    assert.match($('contextRows').textContent, /Ahmed/, 'context shows the employee');
    w.showTab('settings');
    await settle(500);
    assert.match($('rosterRows').textContent, /Ahmed/);
    w.showTab('metrics');
    await settle(800);
    assert.match($('metricRows').textContent, /Ahmed/);

    const failed = errors.filter(x => !/Not implemented|navigation|scrollIntoView|getComputedStyle/.test(x));
    assert.deepEqual(failed, [], 'page errors');
    const used = [...new Set(requests.map(r => r.split('?')[0]))].sort();
    for (const p of ['/api/admin-access', '/api/dashboard', '/api/history', '/api/employees', '/api/operations']) assert.ok(used.includes(p), 'called ' + p);
    void e;
    } finally { w.close(); }
  } finally { await t.close(); }
});
