'use strict';
// شاشة مراقبة طلبات: runs only on the one PC linked from the admin page (الإدارة ← شاشة مراقبة طلبات), in a Firefox
// window signed in with the call center's Talabat account. It keeps Order History open on the operating day, reads the
// list every few seconds, and opens each order the server asks for to read its timeline, cancellation and items.
// It never accepts, rejects or changes an order, and it reads available customer matching fields inside the current order only.
(async () => {
  if (location.hostname !== 'partner-app.talabat.com' || window.top !== window || window.__marsadTalabat === globalThis.MARSAD.VERSION) return;
  window.__marsadTalabat = globalThis.MARSAD.VERSION;
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
  // Talabat refuses a date in the future (falls back to «Last 7 days») and shows nothing when from = to.
  // So the list runs from the day before the operating day to today (Cairo); only the operating day's rows are taken.
  const prev = d => new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
  const listUrl = () => '/orders?from=' + prev(day()) + '&to=' + ymd(Date.now());
  // A Cairo wall-clock "HH:MM" on or after the order's placed time, as an ISO time.
  const offsetAt = ms => { const p = parts(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000; };
  function clockAfter(hhmm, placedMs) {
    const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/); if (!m || !placedMs) return null;
    const p = parts(placedMs);
    let t = Date.UTC(+p.year, +p.month - 1, +p.day, +m[1], +m[2]) - offsetAt(placedMs);
    if (t < placedMs - 3600000) t += 864e5;
    return new Date(t).toISOString();
  }

  // The operating day as times: 9 ص Cairo to 9 ص the next day.
  const dayStart = () => { const d = day(); return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 9, 0) - offsetAt(Date.now()); };
  // The time shown on a list row ("Today, 19:55", "Yesterday, 23:10", "Oct 24, 21:00"), as ms; null when there is none.
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function rowTime(l) {
    // Tolerant: the time may sit anywhere in a line, with invisible direction marks or an icon word before it.
    for (const raw of l) {
      const x = String(raw).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00a0\u202f]/g, ' ').toLowerCase();
      const m = x.match(/(today|yesterday|اليوم|النهارده|أمس|امبارح|إمبارح|[a-z]{3,9}\.?\s+\d{1,2}(?:,?\s*\d{4})?|\d{1,2}\s+[a-z]{3,9}(?:,?\s*\d{4})?)\D{0,6}?(\d{1,2}):(\d{2})(?:\s*(am|pm|ص|م))?/);
      if (!m) continue;
      const p = parts(Date.now()), w = m[1].trim();
      let y = +p.year, mo = +p.month - 1, d = +p.day, h = +m[2];
      if (/^(today|اليوم|النهارده)$/.test(w)) { /* today */ }
      else if (/^(yesterday|أمس|امبارح|إمبارح)$/.test(w)) { const t = new Date(Date.UTC(y, mo, d) - 864e5); y = t.getUTCFullYear(); mo = t.getUTCMonth(); d = t.getUTCDate(); }
      else {
        const a = w.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2})|(\d{1,2})\s+([a-z]{3})/); if (!a) continue;
        const mm = MON[a[1] || a[4]]; if (mm === undefined) continue;
        if (mm > mo) y--; mo = mm; d = +(a[2] || a[3]);
      }
      if (/pm|م/.test(m[4] || '') && h < 12) h += 12; if (/am|ص/.test(m[4] || '') && h === 12) h = 0;
      return Date.UTC(y, mo, d, h, +m[3]) - offsetAt(Date.now());
    }
    return null;
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
    // Each live card: the long order number and the short #code (both may be split into several pieces on the page).
    // The card is the smallest block around the number that holds exactly one long number and a #code.
    const readCodes = () => {
      const out = new Map(), walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const ids = txt => txt.match(/(?<!\d)\d{9,12}(?!\d)/g) || [];
      // Every piece of text on its own line, so neighbouring numbers never run together.
      const textOf = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), a = []; for (let x; (x = w.nextNode());) a.push(x.nodeValue); return a.join('\n'); };
      for (let n; (n = walk.nextNode());) {
        const t = ids(n.nodeValue)[0]; if (!t || out.has(t)) continue;
        let card = n.parentElement;
        for (let i = 0; i < 8 && card; i++, card = card.parentElement) {
          const txt = textOf(card);
          if (new Set(ids(txt)).size > 1) break;
          const m = txt.match(/#\s*(\d{2,8})(?!\d)/);
          if (m) { out.set(t, { id: t, code: m[1], store: (txt.split('\n').find(x => /الدهان/.test(x)) || '').trim() || null }); break; }
        }
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
      const at = rowTime(l);
      // Column positions change between accounts. Never store an ID or amount as an order status.
      const statusCell = row.querySelector('[data-field="status"], [data-field="orderStatus"]');
      const status = (l.find(x => /^(?:NEW|ACCEPTED|PREORDER ACCEPTED|READY|READY FOR PICKUP|PICKED UP|IN DELIVERY|COMPLETED|DELIVERED|CANCELLED|REJECTED)$/i.test(x)) || statusCell?.innerText?.trim() || '').toUpperCase();
      out.push({ id, at, listAt: at == null ? null : new Date(at).toISOString(), status, store: (l.find(x => /الدهان|el ?dahan/i.test(x)) || '').replace(/^\|\s*/, '') || null, total: money(l.find(x => /E£|EGP|ج\.م/.test(x))) });
    }
    return out;
  }
  const expandedProductKeys = new Set();
  function productModifierControl(p) {
    const all = [...(p.matches?.('button,[role="button"],[aria-expanded]') ? [p] : []), ...p.querySelectorAll('button,[role="button"],[aria-expanded]')];
    return all.find(el => {
      const label = [el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.innerText, el.textContent].filter(Boolean).join(' ').trim();
      return el.getAttribute('aria-expanded') === 'false' || /expand_more|keyboard_arrow_down|chevron_right/i.test(label);
    }) || null;
  }
  function productModifierExpanded(el) {
    if (!el) return true;
    const label = [el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.innerText, el.textContent].filter(Boolean).join(' ').trim();
    return el.getAttribute('aria-expanded') === 'true' || /expand_less|keyboard_arrow_up|chevron_down/i.test(label);
  }
  async function expandProductModifiers(id) {
    let clicked = false;
    const count = document.querySelectorAll('[data-testid^="existing-product__"]').length;
    for (let i = 0; i < count; i++) {
      const p = document.querySelectorAll('[data-testid^="existing-product__"]')[i]; if (!p) continue;
      const key = id + ':' + (p.dataset.testid || i), control = productModifierControl(p);
      if (control && !productModifierExpanded(control) && !expandedProductKeys.has(key)) {
        expandedProductKeys.add(key); control.click(); clicked = true; await sleep(100);
      }
    }
    if (clicked) await sleep(180);
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
      const raw = lines(p).map(x => x.trim()).filter(Boolean), l = raw.filter(x => !/^(?:expand_more|expand_less|keyboard_arrow_down|keyboard_arrow_up)$/i.test(x));
      const name = l[1] || '', control = productModifierControl(p);
      const modifiers = [...new Set(l.slice(2).map(x => x.replace(/\s*(?:E£|EGP|£E|ج\.م)\s*[-+]?\d[\d,.]*/ig, '').trim())
        .filter(x => x && x !== name && !/^(?:expand_more|expand_less|keyboard_arrow_down|keyboard_arrow_up|add-ons?|options?|customi[sz]ations?|modifiers?|no add-ons? selected)$/i.test(x) &&
          !/^(?:\d+\s*[x×]|[x×]\s*\d+)$/i.test(x) && !/(?:E£|EGP|£E|ج\.م)\s*[-+]?\d/i.test(x)))].slice(0, 20);
      const iconStillCollapsed = /\bexpand_more\b|\bkeyboard_arrow_down\b/i.test(p.innerText || '');
      d.items.push({ qty: Number((l[0] || '').replace(/[^\d]/g, '')) || 1, name, price: money(l.find(x => /E£|EGP/.test(x))), modifiers, modifierRead: productModifierExpanded(control) && !iconStillCollapsed });
    }
    // The list time has seconds (placedAt); the timeline only minutes. Received = placed, accepted = received + "Accepted in".
    if (d.receivedAt && Number.isFinite(placed) && Math.abs(Date.parse(d.receivedAt) - Math.floor(placed / 60000) * 60000) < 60000) d.receivedAt = new Date(placed).toISOString();
    if (d.receivedAt && Number.isFinite(d.acceptSeconds)) d.acceptedAt = new Date(Date.parse(d.receivedAt) + d.acceptSeconds * 1000).toISOString();
    d.subtotal = money(lines(T('subtotal')).find(x => /E£|EGP/.test(x)));
    // Matching never depends on the WhatsApp setting. Read explicit customer labels only;
    // do not guess a name/address from arbitrary order text or a masked phone number.
    let box = T('details-order-id'); while (box && !box.querySelector('[data-testid^="milestone-for__"]')) box = box.parentElement;
    const customerLines = lines(box).filter(Boolean);
    const customerHeading = /^(?:customer details|customer information|تفاصيل الزبون|تفاصيل العميل)$/i;
    const sectionEnd = /^(?:order timeline|timeline|order details|تفاصيل الطلب|الجدول الزمني للطلب)$/i;
    const iconLine = /^(?:info|person(?:_outline)?|location_on|place|call(?:_outgoing)?|phone|check_circle|expand_more)$/i;
    const fieldLabel = /^(?:customer name|name|customer address|delivery address|address|customer phone(?: number)?|phone(?: number)?|mobile(?: number)?|اسم العميل|الاسم|عنوان العميل|عنوان التوصيل|العنوان|رقم هاتف العميل|رقم الهاتف|رقم الموبايل)$/i;
    const customerPanel = box?.querySelector('[data-testid="customer-details"]');
    let sectionRaw = customerPanel ? lines(customerPanel) : [];
    const sectionHeadingAt = sectionRaw.findIndex(x => customerHeading.test(x));
    if (sectionHeadingAt >= 0) sectionRaw = sectionRaw.slice(sectionHeadingAt + 1);
    else if (!customerPanel) {
      const at = customerLines.findIndex(x => customerHeading.test(x));
      sectionRaw = [];
      if (at >= 0) for (const x of customerLines.slice(at + 1)) { if (sectionEnd.test(x)) break; sectionRaw.push(x); }
    }
    const cleanSectionLine = x => String(x || '').replace(/^(?:customer name|name|customer address|delivery address|address|customer phone(?: number)?|phone(?: number)?|mobile(?: number)?|اسم العميل|الاسم|عنوان العميل|عنوان التوصيل|العنوان|رقم هاتف العميل|رقم الهاتف|رقم الموبايل)\s*[:：]\s*/i, '').trim();
    const sectionLines = sectionRaw.map(cleanSectionLine).filter(x => x && !customerHeading.test(x) && !sectionEnd.test(x) && !iconLine.test(x) && !fieldLabel.test(x));
    const field = re => {
      const i = customerLines.findIndex(x => re.test(x)); if (i < 0) return '';
      const inline = customerLines[i].replace(re, '').replace(/^\s*[:：]\s*/, '').trim();
      if (inline) return inline;
      const next = customerLines[i + 1] || '';
      return /^(?:customer|phone|mobile|address|اسم العميل|رقم الهاتف|العنوان)\s*[:：]?$/i.test(next) ? '' : next;
    };
    let name = field(/^(?:customer name|اسم العميل)\s*[:：]?\s*/i);
    let address = field(/^(?:delivery address|customer address|عنوان العميل|عنوان التوصيل)\s*[:：]?\s*/i);
    const labelledPhone = field(/^(?:customer (?:phone|mobile)(?: number)?|(?:phone|mobile)(?: number)?|رقم هاتف العميل|رقم الهاتف|رقم الموبايل)\s*[:：]?\s*/i);
    // A tel link is accepted only inside an explicit customer element of this order, never the branch/contact area.
    const customerBox = box?.querySelector('[data-testid="customer-details"], [data-testid="customer-info"], [data-testid="customer-phone"], [data-testid="prop-customer-phone"]');
    const customerTel = customerBox?.querySelector('a[href^="tel:"]') || (customerBox?.matches('a[href^="tel:"]') ? customerBox : null);
    const normalizePhone = raw => {
      let value = String(raw || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00a0\u202f]/g, '').trim();
      if (!value || /[x*•…]/i.test(value)) return '';
      let candidate = value.replace(/[^\d+]/g, '');
      if (/^\d{12}\+$/.test(candidate)) candidate = '+' + candidate.slice(0, -1);
      return /^(?:\+?20|0)?1[0125](?:[\s-]?\d){8}$/.test(candidate) ? candidate.replace(/[^\d+]/g, '') : '';
    };
    const sectionPhone = sectionLines.find(normalizePhone) || '';
    const rawPhone = labelledPhone || customerTel?.getAttribute('href')?.replace(/^tel:/i, '') || sectionPhone;
    const phone = normalizePhone(rawPhone) || null;
    const phoneKey = raw => {
      let n = String(raw || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/\D/g, '');
      if (n.startsWith('0020')) n = n.slice(2);
      if (n.startsWith('20') && n.length === 12) n = '0' + n.slice(2);
      return n;
    };
    const phoneIndex = phone ? sectionLines.findIndex(x => phoneKey(x) === phoneKey(phone)) : -1;
    if (phoneIndex >= 2) {
      if (!name) name = sectionLines[0].slice(0, 160);
      if (!address) address = sectionLines.slice(1, phoneIndex).join(' ').slice(0, 360);
    }
    d.customer = { name: name.slice(0, 160), address: address.slice(0, 360), phone: phone || '' };
    d.deliveryType = lines(T('prop-delivery-type'))[1] || null;
    return { id, vendorId, placedAt: Number.isFinite(placed) ? new Date(placed).toISOString() : null, status: d.status, detail: d, ...(phone ? { phone } : {}) };
  }

  // ---------- one cycle ----------
  const known = new Map();        // id -> status last sent
  // The page reloads every minute; the whole day is loaded and sent again only every 10 minutes (kept across reloads).
  const FULL = 'marsadTalabatFull', fullAt = () => { try { return Number(sessionStorage.getItem(FULL)) || 0; } catch { return 0; } };
  let want = [], lastReload = Date.now(), failures = 0, phonesWanted = false;
  async function push(orders) {
    const timing = await bg({ type: 'TALABAT_CLOCK' }).catch(() => null);
    if (!Number.isFinite(timing?.offset)) { failures++; say('مستني مزامنة ساعة المرصد قبل الإرسال'); return false; }
    const observedAt = new Date(Date.now() + timing.offset).toISOString();
    const r = await bg({ type: 'TALABAT_PUSH', orders: orders.map(o => ({ ...o, observedAt: o.observedAt || observedAt })) }).catch(e => ({ ok: false, error: e.message }));
    if (!r?.ok) { failures++; say('مش قادر يبعت للمرصد (' + (r?.error || r?.status || '?') + ')'); return false; }
    failures = 0; want = r.want || []; phonesWanted = !!r.phones; return true;
  }
  // The table only draws the rows on screen: scroll it from the top to the bottom and gather every row on the way.
  const rowEl = id => [...document.querySelectorAll('.MuiDataGrid-row')].find(r => String(r.dataset.id || '').endsWith('|' + id));
  async function scan(stop) {
    const sc = document.querySelector('.MuiDataGrid-virtualScroller');
    const box = sc && sc.scrollHeight > sc.clientHeight + 5 ? sc : (document.scrollingElement || document.documentElement);
    const all = new Map(), take = () => { for (const o of readList()) if (!all.has(o.id)) all.set(o.id, o); };
    box.scrollTop = 0; await sleep(250); take();
    for (let i = 0; i < 300 && !(stop && stop([...all.values()])); i++) {
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) break;
      box.scrollTop = box.scrollTop + Math.max(40, Math.floor(box.clientHeight * 0.7)); await sleep(200); take();
    }
    return [...all.values()];
  }
  async function openDetail(id) {
    let row = rowEl(id);
    if (!row) { await scan(() => !!rowEl(id)); row = rowEl(id); }
    if (!row) return null;
    row.scrollIntoView?.({ block: 'center' }); await sleep(150);
    row.click();
    for (let i = 0; i < 40; i++) { await sleep(200); const d = readDetail(id); if (d && document.querySelector('[data-testid^="milestone-for__"]')) { await sleep(400); await expandProductModifiers(id); return readDetail(id); } }
    return null;
  }
  async function closeDetail() {
    T('close-button')?.click();
    for (let i = 0; i < 20 && T('details-order-id'); i++) await sleep(150);
    if (location.pathname !== '/orders') history.back();
    await sleep(300);
  }
  async function pushVisibleDetail() {
    const id = (T('details-order-id')?.innerText || '').trim();
    if (!/^\d{6,20}$/.test(id)) return false;
    await expandProductModifiers(id);
    const d = readDetail(id);
    if (!d || !(d.detail?.items?.length || d.phone || d.detail?.customer?.name || d.detail?.customer?.address)) return false;
    return push([d]);
  }
  async function cycle() {
    // The "allow notifications" box covers the list.
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Got it')?.click();
    const exact = location.pathname + location.search === listUrl();
    if (!exact && !T('details-order-id')) {
      // Some Talabat accounts replace the URL date filter with their own (e.g. yesterday–today).
      // One attempt only: otherwise every cycle navigates again before the grid can load.
      const navKey = 'marsadTalabatNav3:' + day();
      if (!sessionStorage.getItem(navKey)) { sessionStorage.setItem(navKey, '1'); location.href = listUrl(); return; }
      // Otherwise the list is read as it is, and only the operating day's rows (by the time on each row) are taken.
    }
    if (T('details-order-id')) {
      await pushVisibleDetail();
      await closeDetail();
    }
    const start = dayStart(), end = start + 864e5;
    const inDay = o => o.at !== null && o.at >= start - 60000 && o.at < end;
    const older = () => { const t = readList().at(-1)?.at; return t != null && t < start - 60000; };
    // The list shows 50 at a time: on the first pass load the whole day, later only when an asked-for order is further down.
    const loadMore = () => [...document.querySelectorAll('button,div,span,p')].find(e => e.childElementCount === 0 && /^(Load more|عرض المزيد)$/i.test(e.textContent.trim()));
    const full = Date.now() - fullAt() > 600000;
    let rows = await scan();
    const past = () => rows.some(o => o.at != null && o.at < start - 60000);
    for (let i = 0; i < 40 && loadMore() && !past() && (full || want.some(id => !rows.some(o => o.id === id))); i++) { say('بيحمّل أوردرات يوم التشغيل… ' + rows.filter(inDay).length); loadMore().click(); await sleep(1500); rows = await scan(); }
    const list = rows.filter(inDay);
    const noTime = rows.filter(o => o.at === null);
    if (!rows.length || (noTime.length === rows.length)) { say(rows.length ? 'مش قادر يقرا وقت الصفوف — الصف بيقول: ' + lines(rowEl(rows[0].id)).slice(0, 5).join(' | ') : 'سجل طلبات لسه محمّلش أوردرات؛ مستني ظهور الصفوف.'); return; }
    if (!list.length) { say('سجل طلبات لسه محمّلش أوردرات؛ مستني ظهور الصفوف. اللايف شغال في التبويب التاني.'); return; }
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
    if (failures) return; // Preserve the delivery error instead of overwriting it with a success banner.
    if (noTime.length) { say('مش قادر يقرا وقت ' + noTime.length + ' صف من ' + rows.length + ' — الصف بيقول: ' + lines(rowEl(noTime[0].id)).slice(0, 5).join(' | ')); return; }
    say(list.length + ' أوردر النهارده' + (exact ? '' : ' (من فلتر طلبات، يوم التشغيل بس)') + ' · آخر قراءة ' + new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    // The list itself does not refresh on its own: reload it every minute when nothing is pending.
    if (!want.length && Date.now() - lastReload > 60000) { lastReload = Date.now(); location.reload(); }
  }
  await sleep(4000);
  for (;;) { try { await cycle(); } catch (e) { say('خطأ: ' + e.message); } await sleep(failures ? 30000 : 8000); }
})();
