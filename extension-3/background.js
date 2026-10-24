'use strict';
// Connector background: the only place that talks to the server and to the Arabicss reports.
// - server clock (from the HTTPS Date header) so every event carries server time
// - durable outbox: events are saved first, then delivered in order, retried until accepted
// - which tab holds which employee session, so a closed tab or browser ends it properly
// - notifications, and the history / live-queue collector on the supervisor's PC
const { API, VERSION, REPORTS_ROOT } = globalThis.MARSAD;
const OUTBOX = 'outbox', REJECTED = 'rejected', TABS = 'tabs', COLLECTOR = 'collector';

// ---------- small helpers ----------
const store = {
  async get(key, fallback) { const v = (await browser.storage.local.get(key))[key]; return v === undefined ? fallback : v; },
  set: (key, value) => browser.storage.local.set({ [key]: value }),
};
let lock = Promise.resolve();
const locked = fn => { const job = lock.then(fn, fn); lock = job.catch(() => {}); return job; };
const fromArabicss = sender => { try { return !!sender.tab && new URL(sender.url).hostname === globalThis.MARSAD.ARABICSS_HOST; } catch { return false; } };

async function request(url, { method = 'GET', headers = {}, body, timeout = 20000, credentials } = {}) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout);
  const sent = performance.now();
  try {
    const r = await fetch(url, { method, headers, body, signal: ctrl.signal, cache: 'no-store', credentials });
    const text = await r.text();
    if (url.startsWith(API)) clock.sample(r.headers.get('date'), sent, performance.now());
    return { ok: r.ok, status: r.status, url: r.url, text, json() { try { return JSON.parse(text); } catch { return {}; } } };
  } finally { clearTimeout(timer); }
}
const api = (path, opts = {}) => request(API + path, opts);

// ---------- server clock ----------
// HTTP Date has one-second precision: keep the sample with the smallest round trip, refresh it every 10 minutes.
const clock = {
  offset: null, rtt: Infinity, at: 0,
  sample(header, sent, done) {
    const server = Date.parse(header || ''), rtt = done - sent;
    if (!Number.isFinite(server) || rtt > 5000) return;
    const fresh = performance.now() - this.at > 600000;
    if (this.offset !== null && !fresh && rtt >= this.rtt) return;
    this.offset = server + 500 - (Date.now() - rtt / 2);
    this.rtt = rtt; this.at = performance.now();
  },
  now() { return this.offset === null ? null : Date.now() + this.offset; },
  async ensure() { if (this.offset === null) { try { await api('/api/employees/list'); } catch {} } return this.offset !== null; },
};

// ---------- outbox ----------
let flushing = null, retryAt = 0;
async function enqueue(event, token) {
  return locked(async () => {
    const q = await store.get(OUTBOX, []);
    if (!q.some(e => e.token === token && e.event.eventKey === event.eventKey)) q.push({ token, event, tries: 0 });
    await store.set(OUTBOX, q);
    return q.length;
  });
}
function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    while (Date.now() >= retryAt) {
      const q = await store.get(OUTBOX, []);
      if (!q.length) return;
      const item = q[0];
      let r;
      try {
        r = await api('/api/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-token': globalThis.MARSAD.DEVICE_TOKEN, 'x-employee-session': item.token }, body: JSON.stringify(item.event) });
      } catch { r = null; }
      if (r && r.status === 409 && item.event.eventType === 'break_start') {
        // The server did not accept the break permission: the break still happened, record it as observed.
        const { permissionId, ...rest } = item.event; void permissionId;
        await locked(async () => { const now = await store.get(OUTBOX, []); const i = now.findIndex(e => e.token === item.token && e.event.eventKey === item.event.eventKey);
          if (i >= 0) now[i] = { ...item, event: { ...rest, eventType: 'break_observed', eventKey: rest.eventKey + ':observed', payload: { ...rest.payload, breakAuthorizationFailed: true } } }; await store.set(OUTBOX, now); });
        continue;
      }
      if (r && !r.ok && r.status < 500 && r.status !== 429) {
        // A permanent refusal (bad event, closed session, unauthorized break): set it aside so the rest keeps flowing.
        const kept = await store.get(REJECTED, []);
        kept.push({ ...item, status: r.status, reason: r.text.slice(0, 300), at: new Date().toISOString() });
        await store.set(REJECTED, kept.slice(-300));
      } else if (!r || !r.ok) { retryAt = Date.now() + Math.min(30000, 2000 * 2 ** Math.min(item.tries, 4)); await bump(item); return; }
      await locked(async () => { const now = await store.get(OUTBOX, []); await store.set(OUTBOX, now.filter(e => !(e.token === item.token && e.event.eventKey === item.event.eventKey))); });
      notifyTabs({ type: 'DELIVERED', eventKey: item.event.eventKey, token: item.token, ok: r.ok, status: r.status });
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
const bump = item => locked(async () => { const q = await store.get(OUTBOX, []); for (const e of q) if (e.token === item.token && e.event.eventKey === item.event.eventKey) e.tries++; await store.set(OUTBOX, q); });
setInterval(() => flush().catch(() => {}), 3000);

// ---------- tabs holding employee sessions ----------
async function endSession(entry, reason) {
  try {
    const r = await api('/api/session/end', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-token': globalThis.MARSAD.DEVICE_TOKEN, 'x-employee-session': entry.token }, body: JSON.stringify({ reason }) });
    return r.ok || [401, 403].includes(r.status);
  } catch { return false; }
}
async function closeTab(tabId, reason) {
  const entry = await locked(async () => { const tabs = await store.get(TABS, {}); const e = tabs[tabId]; if (e) { e.closing = reason; await store.set(TABS, tabs); } return e; });
  if (!entry) return;
  await flush().catch(() => {});
  if (await endSession(entry, reason)) await locked(async () => { const tabs = await store.get(TABS, {}); if (tabs[tabId]?.token === entry.token) delete tabs[tabId]; await store.set(TABS, tabs); });
}
browser.tabs.onRemoved.addListener(tabId => closeTab(String(tabId), 'tab_closed'));
// After a browser restart no tab survives: end what was left open (and retry later if offline).
const startup = (async () => {
  const tabs = await store.get(TABS, {}), open = await browser.tabs.query({}).catch(() => null);
  for (const [id, e] of Object.entries(tabs)) if (!e.closing && open && !open.some(t => String(t.id) === id)) e.closing = 'browser_restarted';
  await store.set(TABS, tabs);
})();
setInterval(async () => {
  await startup;
  for (const [id, e] of Object.entries(await store.get(TABS, {}))) if (e.closing) await closeTab(id, e.closing);
}, 15000);

function notifyTabs(message) {
  store.get(TABS, {}).then(tabs => { for (const id of Object.keys(tabs)) browser.tabs.sendMessage(Number(id), message).catch(() => {}); });
}

// ---------- messages from the Arabicss page ----------
browser.runtime.onMessage.addListener(async (m, sender) => {
  if (m?.type?.startsWith('COLLECTOR_')) return collectorMessage(m, sender);
  if (m?.type === 'NATIVE_LIVE') {
    if (!fromArabicss(sender) || !/^\/themes\/arabicssReportsInclude\//i.test(new URL(sender.url).pathname) || typeof m.html !== 'string' || m.html.length > 1000000) throw Error('invalid_sender');
    return nativeLive(m.html);
  }
  if (!fromArabicss(sender)) throw Error('invalid_sender');
  const tabId = String(sender.tab.id);
  await startup;
  switch (m.type) {
    case 'CLOCK': await clock.ensure(); return { offset: clock.offset };
    case 'API': {
      if (!/^\/api\/(employees\/list|session\/start|break-requests|messages)(\?.*)?$/.test(m.path)) throw Error('invalid_path');
      const r = await api(m.path, { method: m.method || 'GET', headers: { 'content-type': 'application/json', 'x-device-token': globalThis.MARSAD.DEVICE_TOKEN, ...(m.token ? { 'x-employee-session': m.token } : {}) }, body: m.body ? JSON.stringify(m.body) : undefined });
      return { ok: r.ok, status: r.status, data: r.json(), offset: clock.offset };
    }
    case 'EVENT': { const pending = await enqueue(m.event, m.token); flush().catch(() => {}); return { ok: true, pending }; }
    case 'REGISTER': return locked(async () => {
      const tabs = await store.get(TABS, {});
      const other = Object.entries(tabs).find(([id, e]) => id !== tabId && e.token === m.token && !e.closing);
      if (other) return { ok: false, otherTab: true };
      if (tabs[tabId]?.closing && tabs[tabId].token === m.token) return { ok: false, closed: true };
      if (tabs[tabId] && tabs[tabId].token !== m.token && !tabs[tabId].closing) tabs[tabId].closing = 'session_replaced';
      if (tabs[tabId]?.closing) tabs['old-' + crypto.randomUUID()] = tabs[tabId];
      tabs[tabId] = { token: m.token, identity: m.identity, version: VERSION };
      await store.set(TABS, tabs);
      return { ok: true };
    });
    case 'UPDATE': return locked(async () => { const tabs = await store.get(TABS, {}); if (tabs[tabId]?.token === m.token) { tabs[tabId].identity = m.identity; await store.set(TABS, tabs); } return { ok: true }; });
    case 'RECOVER': { const e = (await store.get(TABS, {}))[tabId]; return e && !e.closing ? { token: e.token, identity: e.identity } : null; }
    case 'END': {
      const tabs = await store.get(TABS, {});
      if (tabs[tabId]?.token !== m.token) { if (m.token) await endSession({ token: m.token }, m.reason); return { ok: true }; }
      await closeTab(tabId, m.reason);
      return { ok: true };
    }
    case 'NOTIFY': {
      const shown = await store.get('notified', []);
      if (shown.includes(m.key)) return { ok: true, duplicate: true };
      await browser.notifications.create('marsad-' + m.key.slice(0, 80), { type: 'basic', iconUrl: browser.runtime.getURL('icon.svg'), title: m.title, message: m.message });
      await store.set('notified', [...shown, m.key].slice(-300));
      return { ok: true };
    }
    case 'STATUS': return { pending: (await store.get(OUTBOX, [])).filter(e => e.token === m.token).length, rejected: (await store.get(REJECTED, [])).length };
  }
});

// ---------- collector: Arabicss history and live queue (supervisor's PC only) ----------
let collectorState = { message: 'الموصل غير مربوط', lastHistory: null, lastLive: null, error: null };
async function collectorPost(body) {
  let c = await store.get(COLLECTOR, null);
  if (!c) throw Error('الموصل غير مربوط');
  if (Number(String(c.token).split('.')[0]) < Date.now() + 3600000) c = await refreshCollector(c);
  let r = await api('/api/history', { method: 'POST', headers: { 'content-type': 'application/json', 'x-history-token': c.token }, body: JSON.stringify(body) });
  if (r.status === 401) { c = await refreshCollector(c); r = await api('/api/history', { method: 'POST', headers: { 'content-type': 'application/json', 'x-history-token': c.token }, body: JSON.stringify(body) }); }
  if (!r.ok) { const e = Error(r.json().error || 'رفض الخادم السجل'); e.status = r.status; throw e; }
  return r.json();
}
async function refreshCollector(c) {
  const r = await api('/api/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh', refreshToken: c.refreshToken }) });
  if (!r.ok) { await store.set(COLLECTOR, null); collectorState.message = 'انتهى ربط الموصل؛ اربطه من صفحة الإدارة'; throw Error(collectorState.message); }
  const next = { ...c, ...r.json() };
  await store.set(COLLECTOR, next);
  return next;
}
async function reports(path, options = {}) {
  const r = await request(REPORTS_ROOT + path, { ...options, credentials: 'include' });
  if (!r.ok || /login\.php/i.test(r.url) || /<input[^>]+type=["']password/i.test(r.text)) throw Error('سجّل دخول تقارير أرابيكس على هذا الجهاز مرة واحدة');
  return r.text;
}
const cairoDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
let historyBusy = false, liveBusy = false;
async function collectHistory() {
  if (historyBusy || !(await store.get(COLLECTOR, null))) return;
  historyBusy = true;
  try {
    // Yesterday's calendar date stays in the data day until 09:00, so it is fetched again until then.
    const dates = [...new Set([cairoDate(Date.now() - 9 * 3600000), cairoDate()])];
    for (const date of dates) {
      const [y, m, d] = date.split('-'), v = m + '/' + d + '/' + y;
      const html = await reports('0002_inbound_calls.php', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ start_date: v, end_date: v }).toString() });
      const doc = new DOMParser().parseFromString(html, 'text/html'), table = doc.querySelector('#example23');
      if (!table) throw Error('لم يتم التعرف على جدول السجل');
      const header = [...table.querySelectorAll('thead th')].map(c => c.textContent.trim());
      const rows = [...table.querySelectorAll('tbody tr')].map(r => [...r.querySelectorAll('td')].map(c => c.textContent.trim())).filter(r => r.length === header.length);
      const label = [...doc.querySelectorAll('h5')].find(e => e.textContent.trim() === 'All Inbound Calls'), count = Number(label?.previousElementSibling?.textContent.trim());
      if (!Number.isInteger(count) || count !== rows.length) throw Error('السجل ناقص؛ ستُعاد المحاولة');
      const di = header.indexOf('Call Date');
      if (di < 0 || rows.some(r => r[di] !== date)) throw Error('تاريخ السجل لا يطابق المطلوب');
      await collectorPost({ rows: [header, ...rows], expectedCount: count, reportDate: date });
      collectorState = { ...collectorState, message: 'السجل محدث: ' + date + ' (' + rows.length + ' مكالمة)', lastHistory: new Date().toISOString(), error: null };
    }
  } catch (e) { collectorState = { ...collectorState, error: e.message }; } finally { historyBusy = false; }
}
let lastLiveSignature = '', lastLiveSent = 0, lastNative = 0;
// The live queue is taken from the report page's own refreshes when it is open on this PC (no extra request
// to Arabicss, and as live as the report itself); otherwise the collector reads it every 3 seconds.
async function sendLive(html, observedAt) {
  const doc = new DOMParser().parseFromString('<table><tbody>' + html + '</tbody></table>', 'text/html');
  const rows = [...doc.querySelectorAll('tr')].map(r => [...r.querySelectorAll('td')].map(c => c.textContent.trim())).filter(r => r.length === 11);
  if (html.trim() && !rows.length) throw Error('رد اللايف غير معروف');
  // Waiting times tick every second; an unchanged queue is resent every 10 s only.
  const signature = JSON.stringify(rows.map(r => r.filter((_, i) => i !== 6 && i !== 8)));
  if (signature === lastLiveSignature && Date.now() - lastLiveSent < 10000) return;
  lastLiveSignature = signature; lastLiveSent = Date.now();
  const reply = await collectorPost({ action: 'live', rows, capture: { id: crypto.randomUUID(), kind: 'native_report_snapshot', changed: true, observedAt: new Date(observedAt).toISOString(), timeBasis: 'server-clock-v1' } });
  collectorState = { ...collectorState, lastLive: reply.observedAt, error: null };
}
async function collectLive() {
  if (liveBusy || Date.now() - lastNative < 8000 || !(await store.get(COLLECTOR, null)) || !(await clock.ensure())) return;
  liveBusy = true;
  try { const html = await reports('get_inbound_calls_real_time.php'); await sendLive(html, clock.now()); }
  catch (e) { collectorState = { ...collectorState, error: e.message }; } finally { liveBusy = false; }
}
async function nativeLive(html) {
  if (!(await store.get(COLLECTOR, null)) || !(await clock.ensure())) return { ok: false };
  lastNative = Date.now();
  try { await sendLive(html, clock.now()); } catch (e) { collectorState = { ...collectorState, error: e.message }; }
  return { ok: true };
}
// The day's call log is a heavy report: it is read every 15 minutes during operating hours, hourly at night.
const cairoHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const operating = () => { const h = cairoHour(); return h >= 9 || h < 3; };
let lastHistoryRun = 0;
setInterval(() => { if (Date.now() - lastHistoryRun >= (operating() ? 900000 : 3600000)) { lastHistoryRun = Date.now(); collectHistory(); } }, 60000);
setInterval(() => { if (operating()) collectLive(); }, 3000);
lastHistoryRun = Date.now(); collectHistory(); collectLive();

async function collectorMessage(m, sender) {
  const page = browser.runtime.getURL('collector.html');
  const adminPage = (() => { try { const u = new URL(sender.url); return globalThis.MARSAD.ADMIN_ORIGINS.includes(u.origin); } catch { return false; } })();
  if (sender.url !== page && !adminPage) throw Error('invalid_sender');
  if (m.type === 'COLLECTOR_LINK' && adminPage) {
    if (typeof m.token !== 'string' || typeof m.refreshToken !== 'string') throw Error('invalid_link');
    await store.set(COLLECTOR, { token: m.token, refreshToken: m.refreshToken, linkedAt: new Date().toISOString() });
    collectorState = { ...collectorState, message: 'تم ربط الموصل على هذا الجهاز', error: null };
    collectHistory(); collectLive();
    return { ok: true };
  }
  if (m.type === 'COLLECTOR_STATUS') return { ...collectorState, linked: !!(await store.get(COLLECTOR, null)), version: VERSION, pending: (await store.get(OUTBOX, [])).length };
  if (m.type === 'COLLECTOR_STOP' && sender.url === page) {
    const c = await store.get(COLLECTOR, null);
    if (c) api('/api/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'revoke', refreshToken: c.refreshToken }) }).catch(() => {});
    await store.set(COLLECTOR, null);
    collectorState = { message: 'الموصل متوقف على هذا الجهاز', lastHistory: null, lastLive: null, error: null };
    return { ok: true };
  }
  if (m.type === 'COLLECTOR_SYNC' && sender.url === page) { await collectHistory(); await collectLive(); return { ok: true }; }
}
// After an update Firefox stops the old version's scripts in pages that are already open, so an Arabicss tab
// would stop reporting until it is reloaded. The new version puts its scripts back into those tabs itself
// (the page and the agent's session are untouched; the panel picks up the same session).
browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'update') return;
  for (const t of await browser.tabs.query({}).catch(() => [])) {
    let u; try { u = new URL(t.url); } catch { continue; }
    if (u.hostname !== globalThis.MARSAD.ARABICSS_HOST) continue;
    try {
      if (/^\/themes\/arabicssReportsInclude\//i.test(u.pathname)) await browser.tabs.executeScript(t.id, { file: 'report-bridge.js', allFrames: true });
      else { await browser.tabs.insertCSS(t.id, { file: 'panel.css' }).catch(() => {}); await browser.tabs.executeScript(t.id, { file: 'config.js' }); await browser.tabs.executeScript(t.id, { file: 'agent.js' }); }
    } catch {}
  }
});
browser.browserAction?.onClicked.addListener(() => browser.tabs.create({ url: browser.runtime.getURL('collector.html') }));
