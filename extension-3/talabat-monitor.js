'use strict';
// شاشة مراقبة طلبات: runs only on the one PC linked from the admin page (الإدارة ← شاشة مراقبة طلبات), in a Firefox
// window signed in with the call center's Talabat account. It keeps Order History open on the operating day, reads the
// list every few seconds, and opens each order the server asks for to read its timeline, cancellation and items.
// It never accepts, rejects or changes an order, and it does not read customer details.
(async () => {
  if (location.hostname !== 'partner-app.talabat.com' || window.top !== window || window.__marsadTalabat) return;
  window.__marsadTalabat = true;
  const bg = m => browser.runtime.sendMessage(m);
  let state;
  try { state = await bg({ type: 'TALABAT_ACTIVE' }); } catch { return; }
  if (!state?.active || state.role === 'extra') return;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = id => document.querySelector('[data-testid="' + id + '"]');
  const lines = el => (el?.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
  const money = s => { const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };

  // ---------- the operating day (9 ص to 9 ص, Cairo) ----------
  const cairo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = ms => Object.fromEntries(cairo.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const ymd = ms => { const p = parts(ms); return p.year + '-' + p.month + '-' + p.day; };
  const day = () => { const p = parts(Date.now()); const d = p.year + '-' + p.month + '-' + p.day; return +p.hour < 9 ? ymd(Date.parse(d + 'T12:00:00Z') - 864e5) : d; };
  const next = d => new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  const listUrl = () => '/orders?from=' + day() + '&to=' + next(day());
  // A Cairo wall-clock "HH:MM" on or after the order's placed time, as an ISO time.
  const offsetAt = ms => { const p = parts(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000; };
  function clockAfter(hhmm, placedMs) {
    const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/); if (!m || !placedMs) return null;
    const p = parts(placedMs);
    let t = Date.UTC(+p.year, +p.month - 1, +p.day, +m[1], +m[2]) - offsetAt(placedMs);
    if (t < placedMs - 3600000) t += 864e5;
    return new Date(t).toISOString();
  }

  // ---------- a small banner so nobody uses this window by hand ----------
  const banner = Object.assign(document.createElement('div'), { id: 'marsad-tal-banner', dir: 'rtl' });
  banner.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483646;padding:6px 12px;border-radius:999px;background:#12233af2;border:1px solid #2dd4bf;color:#e2e8f0;font:13px Tahoma,Arial;pointer-events:none';
  const say = text => { banner.textContent = 'شاشة مراقبة طلبات — مرصد الدهان · ' + text; if (!banner.isConnected) document.documentElement.append(banner); };
  say('بتبدأ…');

  // ---------- Live Orders tab: the short #code of each live order (what is written on Apex next to the customer) ----------
  if (state.role === 'live') {
    if (!location.pathname.startsWith('/live-orders')) { location.href = '/live-orders'; return; }
    say('بيقرا أكواد الأوردرات اللايف');
    const readCodes = () => {
      const out = new Map(), walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const codeIn = e => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let x; (x = w.nextNode());) { const m = x.nodeValue.trim().match(/^#\s*(\d{2,8})$/); if (m) return m[1]; } return ''; };
      for (let n; (n = walk.nextNode());) {
        const t = n.nodeValue.trim(); if (!/^\d{9,12}$/.test(t) || out.has(t)) continue;
        let card = n.parentElement, code = '';
        for (let i = 0; i < 6 && card && !(code = codeIn(card)); i++) card = card.parentElement;
        if (code) out.set(t, { id: t, code, store: (card.innerText.split('\n').find(x => /الدهان/.test(x)) || '').trim() || null });
      }
      return [...out.values()];
    };
    let lastKey = '', lastAt = 0;
    for (;;) {
      try {
        [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Got it')?.click();
        const codes = readCodes(), key = JSON.stringify(codes);
        if (codes.length && (key !== lastKey || Date.now() - lastAt > 60000)) {
          const r = await bg({ type: 'TALABAT_PUSH', orders: [], codes }).catch(() => null);
          if (r?.ok) { lastKey = key; lastAt = Date.now(); }
        }
        say(codes.length + ' أوردر لايف · ' + new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch {}
      await sleep(4000);
    }
  }

  // ---------- reading ----------
  function readList() {
    const out = [];
    for (const row of document.querySelectorAll('.MuiDataGrid-row')) {
      const id = String(row.dataset.id || '').split('|').pop();
      if (!/^\d{6,}$/.test(id)) continue;
      const l = lines(row);
      out.push({ id, status: (l[1] || '').toUpperCase(), store: (l.find(x => /الدهان|el ?dahan/i.test(x)) || '').replace(/^\|\s*/, '') || null, total: money(l.find(x => /E£|EGP|ج\.م/.test(x))) });
    }
    return out;
  }
  function readDetail(id) {
    if ((T('details-order-id')?.innerText || '').trim() !== id) return null;
    const u = new URL(location.href), placedAt = u.searchParams.get('placedAt'), placed = Date.parse(placedAt || '');
    const vendorId = (u.pathname.match(/;(\d+)\//) || [])[1] || null;
    const d = { status: (T('details-order-status-holder')?.innerText || '').trim().toUpperCase(), billable: (T('billable-status-holder')?.innerText || '').trim() || null, items: [] };
    for (const m of document.querySelectorAll('[data-testid^="milestone-for__"]')) {
      const key = m.dataset.testid.replace('milestone-for__', '').replace(/_originally_.*$/, ''), l = lines(m).filter(x => !/^(check_circle|close|cancel|schedule)$/.test(x));
      const time = clockAfter(l.find(x => /^\d{1,2}:\d{2}$/.test(x)), placed);
      if (key === 'DISPLAYED_AT_VENDOR') {
        d.receivedAt = time;
        const a = l.join(' ').match(/Accepted in\s*(?:(\d+)\s*min)?\s*(?:(\d+)\s*sec)?/i);
        if (a && (a[1] || a[2])) d.acceptSeconds = (+a[1] || 0) * 60 + (+a[2] || 0);
      } else if (key === 'ACCEPTED') d.acceptedAt = time;
      else if (key === 'PICKED_UP') d.pickedUpAt = time;
      else if (key === 'DELIVERED' || key === 'COMPLETED') d.deliveredAt = time;
      else if (key === 'CANCELLED' || key === 'REJECTED') {
        d.cancelledAt = time;
        const after = l.slice(l.findIndex(x => /^\d{1,2}:\d{2}$/.test(x)) + 1);
        d.cancelOwner = (after.find(x => /^Owner:/i.test(x)) || '').replace(/^Owner:\s*/i, '') || null;
        d.cancelReason = after.filter(x => !/^Owner:/i.test(x)).join(' — ') || null;
      }
    }
    for (const p of document.querySelectorAll('[data-testid^="existing-product__"]')) {
      const l = lines(p).filter(x => x !== 'expand_more');
      d.items.push({ qty: Number((l[0] || '').replace(/[^\d]/g, '')) || 1, name: l[1] || '', price: money(l.find(x => /E£|EGP/.test(x))) });
    }
    // The list time has seconds (placedAt); the timeline only minutes. Received = placed, accepted = received + "Accepted in".
    if (d.receivedAt && Number.isFinite(placed) && Math.abs(Date.parse(d.receivedAt) - Math.floor(placed / 60000) * 60000) < 60000) d.receivedAt = new Date(placed).toISOString();
    if (d.receivedAt && Number.isFinite(d.acceptSeconds)) d.acceptedAt = new Date(Date.parse(d.receivedAt) + d.acceptSeconds * 1000).toISOString();
    d.subtotal = money(lines(T('subtotal')).find(x => /E£|EGP/.test(x)));
    d.deliveryType = lines(T('prop-delivery-type'))[1] || null;
    return { id, vendorId, placedAt: Number.isFinite(placed) ? new Date(placed).toISOString() : null, status: d.status, detail: d };
  }

  // ---------- one cycle ----------
  const known = new Map();        // id -> status last sent
  // The page reloads every minute; the whole day is loaded and sent again only every 10 minutes (kept across reloads).
  const FULL = 'marsadTalabatFull', fullAt = () => { try { return Number(sessionStorage.getItem(FULL)) || 0; } catch { return 0; } };
  let want = [], lastReload = Date.now(), failures = 0;
  async function push(orders) {
    const r = await bg({ type: 'TALABAT_PUSH', orders }).catch(e => ({ ok: false, error: e.message }));
    if (!r?.ok) { failures++; say('مش قادر يبعت للمرصد (' + (r?.error || r?.status || '?') + ')'); return false; }
    failures = 0; want = r.want || []; return true;
  }
  async function openDetail(id) {
    const row = [...document.querySelectorAll('.MuiDataGrid-row')].find(r => String(r.dataset.id || '').endsWith('|' + id));
    if (!row) return null;
    row.click();
    for (let i = 0; i < 40; i++) { await sleep(200); const d = readDetail(id); if (d && document.querySelector('[data-testid^="milestone-for__"]')) { await sleep(400); return readDetail(id); } }
    return null;
  }
  async function closeDetail() {
    T('close-button')?.click();
    for (let i = 0; i < 20 && T('details-order-id'); i++) await sleep(150);
    if (location.pathname !== '/orders') history.back();
    await sleep(300);
  }
  async function cycle() {
    // The "allow notifications" box covers the list.
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Got it')?.click();
    if (location.pathname + location.search !== listUrl() && !T('details-order-id')) { location.href = listUrl(); return; }
    if (T('details-order-id')) await closeDetail();
    // The list shows 50 at a time: on the first pass load the whole day, later only when an asked-for order is further down.
    const loadMore = () => [...document.querySelectorAll('button,div,span,p')].find(e => e.childElementCount === 0 && /^(Load more|عرض المزيد)$/i.test(e.textContent.trim()));
    const full = Date.now() - fullAt() > 600000;
    for (let i = 0; i < 40 && loadMore() && (full || want.some(id => !readList().some(o => o.id === id))); i++) { loadMore().click(); await sleep(1500); }
    const list = readList();
    // Sent: everything on a full pass; otherwise what is new or changed since this page loaded, plus the top of the list.
    const send = full ? list : list.filter((o, i) => i < 60 || known.get(o.id) !== o.status);
    if (send.length && (full || send.some(o => known.get(o.id) !== o.status))) {
      if (await push(send)) { for (const o of list) known.set(o.id, o.status); if (full) try { sessionStorage.setItem(FULL, String(Date.now())); } catch {} }
    }
    // Details the server asked for, a few per cycle so the list stays fresh.
    for (const id of want.slice(0, 4)) {
      const d = await openDetail(id);
      await closeDetail();
      if (d) await push([{ ...d, store: list.find(o => o.id === id)?.store, total: list.find(o => o.id === id)?.total }]);
    }
    say(list.length + ' أوردر النهارده · آخر قراءة ' + new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    // The list itself does not refresh on its own: reload it every minute when nothing is pending.
    if (!want.length && Date.now() - lastReload > 60000) { lastReload = Date.now(); location.reload(); }
  }
  await sleep(4000);
  for (;;) { try { await cycle(); } catch (e) { say('خطأ: ' + e.message); } await sleep(failures ? 30000 : 8000); }
})();
