'use strict';
// شاشة مراقبة طلبات: runs only on the one PC linked from the admin page (الإدارة ← شاشة مراقبة طلبات), in a Firefox
// window signed in with the call center's Talabat account. It keeps Order History open on the operating day, reads the
// list every few seconds, and opens each order the server asks for to read its timeline, cancellation and items.
// It never accepts, rejects or cancels an order; the only change it makes is «في الطريق», when admin turns it on for a branch
// and the order's Apex order left with its pilot. It reads customer matching fields inside the current order only.
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

  // ---------- Menu Availability tab (main screen): which dishes are stopped in each branch; applies admin's queued stops ----------
  // Reads each dish's status from the page's own data (0 = available). Changes only what admin queued, only when admin
  // turned it on, one dish at a time: open that dish's availability menu, choose «Unavailable» / «Available», check it took.
  if (state.role === 'menu') {
    if (!/^\/menu-management-tb\/menu-availability/.test(location.pathname)) { location.href = '/menu-management-tb/menu-availability'; return; }
    say('بيقرا الأصناف الواقفة');
    const W = x => (x && x.wrappedJSObject) || x;
    const dishes = () => {
      const out = new Map();
      for (const b of document.querySelectorAll('[data-testid^="open_options_"]')) {
        const w = W(b); let key = null; try { key = Object.keys(w).find(k => k.startsWith('__reactFiber$')); } catch {}
        let f = key ? w[key] : null;
        for (let i = 0; f && i < 25; i++, f = f.return) { try { const it = f.memoizedProps && f.memoizedProps.item; if (it && it.id) { out.set(String(it.id), Number(it.status)); break; } } catch {} }
      }
      return out;
    };
    const outlet = () => new URL(location.href).searchParams.get('vendor') || '';
    const visible = e => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
    async function setAvailability(id, stop) {
      const btn = T('open_options_' + id); if (!btn) return { ok: false, note: 'الصنف مش ظاهر في الصفحة' };
      btn.scrollIntoView({ block: 'center' }); await sleep(300); btn.click(); await sleep(900);
      const want = stop ? /^(?:un\s?a?vailable|unvailable|غير متاح|غير متوفر)$/i : /^(?:available|متاح|متوفر)$/i;
      const opt = [...document.querySelectorAll('[role="menuitem"],[role="option"],li')].filter(visible).find(x => want.test((x.innerText || '').trim()));
      if (!opt) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { ok: false, note: 'اختيار ' + (stop ? 'الإيقاف' : 'الرجوع') + ' مش ظاهر' }; }
      opt.click(); await sleep(1500);
      // A confirmation, if Talabat asks for one about this change (never the notifications window).
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[data-testid="dialog_confirm_button"]') && !/notification|إشعار/i.test(d.innerText || ''));
      if (dlg) { dlg.querySelector('[data-testid="dialog_confirm_button"]').click(); await sleep(1500); }
      const st = dishes().get(id);
      return st == null ? { ok: false, note: 'ماقدرتش أتأكد' } : (stop ? st !== 0 : st === 0) ? { ok: true } : { ok: false, note: 'الحالة ماتغيرتش' };
    }
    let rounds = 0;
    for (;;) {
      try {
        let now = dishes();
        for (let i = 0; i < 20 && now.size < 20; i++) { await sleep(1000); now = dishes(); }
        const cfg = await bg({ type: 'TALABAT_STOCK' }).catch(() => null);
        const done = [];
        if (cfg?.ok && cfg.apply && now.size >= 20) {
          for (const [id, act] of Object.entries(cfg.queue?.[outlet()] || {}).slice(0, 10)) {
            const st = now.get(id);
            if (st == null) { done.push({ id, act, ok: false, note: 'الصنف مش في منيو الفرع ده' }); continue; }
            if (act === 'stop' ? st !== 0 : st === 0) { done.push({ id, act, ok: true, note: 'كان كده بالفعل' }); continue; }
            done.push({ id, act, ...(await setAvailability(id, act === 'stop')) });
          }
          now = dishes();
        }
        if (now.size >= 20) await bg({ type: 'TALABAT_STOCK_REPORT', body: { outlet: outlet(), outletName: (T('outlet-switcher')?.innerText || '').trim().slice(0, 120), unavailable: [...now].filter(([, st]) => st !== 0).map(([id]) => id), done } }).catch(() => null);
        say('الأصناف: ' + [...now.values()].filter(st => st !== 0).length + ' واقف · ' + new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }));
        // Every 3 rounds (about a minute and a half) the next branch.
        if (++rounds >= 3 && cfg?.outlets?.length) {
          const list = cfg.outlets, i = list.indexOf(outlet()), next = list[(i + 1) % list.length];
          if (next && next !== outlet()) { location.href = '/menu-management-tb/menu-availability?vendor=' + encodeURIComponent(next); return; }
          rounds = 0;
        }
      } catch {}
      await sleep(30000);
    }
  }

  // ---------- Live Orders tab: the short #code of each live order (what is written on Apex next to the customer) ----------
  if (state.role === 'live') {
    if (!location.pathname.startsWith('/live-orders')) { location.href = '/live-orders'; return; }
    say('بيقرا أكواد الأوردرات اللايف');
    // ---- The live orders as the page itself holds them (found 01-11-2026): Talabat's own data for each live order —
    // number, #code, branch, customer, address, payment, items with add-ons, discounts with who funds them, comment.
    // Read straight from the page's memory: no click, nothing opened, nothing changed.
    let pageStore = null;
    const W = x => (x && x.wrappedJSObject) || x;   // Firefox: the page's own objects, as the page sees them
    const findStore = () => {
      if (pageStore) { try { if (W(pageStore).getState()['orders-state']) return pageStore; } catch {} pageStore = null; }
      const els = document.querySelectorAll('#root, #root *, body > div, body > div *');
      for (let n = 0; n < els.length && n < 4000; n++) {
        const w = W(els[n]); let key = null;
        try { key = Object.keys(w).find(k => k.startsWith('__reactFiber$')); } catch {}
        if (!key) continue;
        let f = w[key];
        for (let i = 0; f && i < 250; i++, f = f.return) {
          try { const st = f.memoizedProps && f.memoizedProps.store; if (st && typeof st.getState === 'function' && st.getState()['orders-state']) { pageStore = st; return st; } } catch {}
        }
      }
      return null;
    };
    // Each outlet's state on Talabat (open / closed / busy…) as the page itself holds it, with whatever it says about why and
    // until when (Karim 01-11: alerts when a branch closes, for how long and why). Read only.
    const availability = () => {
      const st = findStore(); if (!st) return null;
      try {
        const a = JSON.parse(W(window).JSON.stringify(W(st).getState()['availability-state'] || {}));
        const names = a.vendorsDict || {};
        return (a.items || []).map(x => ({ outlet: String(x.platformVendorId || ''), name: names[(x.globalEntityId || '') + '|' + x.platformVendorId]?.name || null, state: String(x.state || ''),
          raw: Object.fromEntries(Object.entries(x).filter(([k]) => !/token|auth|phone|email/i.test(k)).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v).slice(0, 200)])) })).filter(x => x.outlet).slice(0, 10);
      } catch { return null; }
    };
    const stateOrders = () => {
      const st = findStore(); if (!st) return null;
      try { const page = W(window); const txt = page.JSON.stringify(W(st).getState()['orders-state'].orders || []); return JSON.parse(txt); } catch { return null; }
    };
    const money2 = v => Math.round((Number(v) || 0) * 100) / 100;
    // One live order → the same shape the order window gives (bill lines, customer, items), so the server reads it as before.
    const fromState = o => {
      const a = o.address || {}, c = o.customer || {}, pay = o.payment || {};
      const phone = String(c.phone || '').replace(/^\+?20(?=1\d{9}$)/, '0');
      const address = [a.street, a.area, a.city].filter(Boolean).join('، ') + [a.building && 'مبنى: ' + a.building, a.floor && 'الدور: ' + a.floor, a.apartment && 'الشقة: ' + a.apartment].filter(Boolean).map(x => ' — ' + x).join('');
      const bill = [{ k: 'المجموع الفرعي', text: 'المجموع الفرعي | ' + money2(pay.itemsTotalPrice) }];
      for (const f of o.fees || []) bill.push({ k: String(f.name || ''), text: f.name + ' | ' + money2(f.value) });
      // Item discounts split by who funds them: «ممول من قبلك» (the restaurant, deducted on Apex), «ممول من قبل Talabat».
      const share = { vendor: 0, platform: 0 };
      for (const i of o.items || []) for (const d of i.discounts || []) for (const sp of d.sponsorships || []) share[/VENDOR|RESTAURANT|PARTNER/i.test(sp.sponsor || '') ? 'vendor' : 'platform'] += Math.abs(Number(sp.amount) || 0);
      if (share.vendor) bill.push({ k: 'خصم ممول من قبلك', text: 'خصم ممول من قبلك | -' + money2(share.vendor) });
      if (share.platform) bill.push({ k: 'خصم ممول من قبل Talabat', text: 'خصم ممول من قبل Talabat | -' + money2(share.platform) });
      for (const d of o.discounts || []) if (!/^item discounts$/i.test(String(d.name || '').trim())) bill.push({ k: String(d.name || 'خصم'), text: (d.name || 'خصم') + ' | ' + money2(d.value) });
      bill.push({ k: 'مجموع', text: 'مجموع | ' + money2(pay.total) });
      bill.push({ k: 'التحصيل من العميل', text: 'التحصيل من العميل | ' + money2(pay.collectAtDropoff) });
      if (pay.paymentType) bill.push({ k: 'payment', text: String(pay.paymentType) });
      if (pay.paid && pay.paymentMethod) bill.push({ k: 'payment', text: 'تم الدفع بواسطة ' + pay.paymentMethod });
      if (o.comment) bill.push({ k: 'ملاحظة العميل', text: 'ملاحظة العميل | ' + String(o.comment).slice(0, 180) });
      const items = (o.items || []).map(i => ({ qty: Number(i.amount) || 1, name: String(i.name || '').trim(), productId: i.productId ? String(i.productId) : undefined, price: money2(i.total),
        modifiers: (i.modifiers || []).map(m => (Number(m.amount) || 1) + '× ' + String(m.name || '').trim()), modifierRead: true, modifierComplete: true,
        options: (i.modifiers || []).map(m => ({ qty: Number(m.amount) || null, name: String(m.name || '').trim(), price: money2(m.total), productId: m.productId ? String(m.productId) : undefined })) }));
      return { id: String(o.externalId), store: o.vendorName || undefined,
        detail: { receivedAt: o.timestamp || undefined, acceptedAt: o.acceptedAt || undefined, subtotal: money2(pay.itemsTotalPrice), customer: { name: [c.firstName, c.lastName].filter(Boolean).join(' '), phone, address, area: a.area ? String(a.area).trim().slice(0, 80) : undefined }, items, bill } };
    };
    const statePushed = new Map();
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
          if (m) {
            // A payment badge on the card, when the card says it (only these words; no customer details are kept).
            const pay = txt.split('\n').map(x => x.trim()).find(x => /^(?:cash|collect cash|cash on delivery|paid|paid online|online|كاش|نقدي|مدفوع)(?:\s|$)/i.test(x));
            out.set(t, { id: t, code: m[1], store: (txt.split('\n').find(x => /الدهان/.test(x) && !/شاشة مراقبة|مرصد الدهان/.test(x)) || '').trim() || null, ...(pay ? { pay: pay.slice(0, 40) } : {}) }); break;
          }
        }
      }
      return [...out.values()];
    };
    const liveRead = new Map();
    const ACTION = /^(?:accept|reject|ready|picked up|on the way|delay|cancel|قبول|رفض|جاهز|في الطريق|تأخير|إلغاء|تعديل|طباعة)$/i;
    async function readLiveDetail(id) {
      // The text node with the full number, inside a card; never a button or anything inside one.
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let target = null;
      for (let n; (n = w.nextNode());) if (n.nodeValue.includes(id) && !n.parentElement.closest('button,[role="button"] button,a,[data-testid="details-order-id"]')) { target = n.parentElement; break; }
      if (!target || ACTION.test((target.innerText || '').trim())) return { fail: 'رقم الأوردر مش ظاهر في اللايف' };
      target.click();
      let d = null;
      for (let i = 0; i < 25 && !d; i++) { await sleep(200); d = (T('details-order-id')?.innerText || '').includes(id) ? readDetail((T('details-order-id').innerText || '').trim()) : null; }
      if (!d) {
        for (let i = 0; i < 25 && !d; i++) { await sleep(200); if ((document.body.innerText || '').includes('المجموع الفرعي') || /Subtotal/.test(document.body.innerText || '')) break; }
        if (!T('details-order-id') && document.querySelector('[data-testid^="existing-product__"]')) d = readDetail(id);   // live window without that id element
      }
      const close = T('close-button') || [...document.querySelectorAll('button,[role="button"]')].find(b => /^(?:close|إغلاق|×|✕)$/i.test((b.getAttribute('aria-label') || b.innerText || '').trim()));
      if (close && !ACTION.test((close.innerText || '').trim())) close.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(400);
      // The branch: the live card does not always name it (single-account view); the order window does («الدهان، مدينتي - ساوث بارك»).
      const store = (lines(document.body).find(x => /الدهان[،,]/.test(x) && x.length < 80) || '').trim() || null;
      return d && d.detail ? { id, store, detail: { ...d.detail, status: undefined } } : { fail: T('details-order-id') ? 'شباك التفاصيل اتفتح بس ماتقراش' : document.querySelector('[data-testid^="existing-product__"]') ? 'الأصناف ظاهرة بس رقم الأوردر لأ' : 'شباك التفاصيل ماتفتحش' };   // the live screen's status words are not Order History statuses
    }
    // A sample of the screen's controls (button words, test ids, roles) for admin, so clicks are built on the real page.
    // Text is kept only for buttons/options (never names, phones or addresses).
    const controlsOf = root => [...(root || document).querySelectorAll('button,[role="button"],[role="option"],[role="radio"],[role="menuitem"],[data-testid],input,select')].slice(0, 120).map(e => {
      const clickable = e.matches('button,[role="button"],[role="option"],[role="radio"],[role="menuitem"]');
      return { tag: e.tagName.toLowerCase(), testid: e.dataset?.testid || '', role: e.getAttribute('role') || '', aria: e.getAttribute('aria-label') || '',
        text: clickable ? (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60) : '' };
    });
    const uiSent = {};
    const sendUi = (kind, root) => { if (uiSent[kind] > Date.now() - 30 * 60000) return; uiSent[kind] = Date.now(); bg({ type: 'TALABAT_UI', body: { kind, controls: controlsOf(root) } }).catch(() => null); };
    // The new-order window. Not the «Please allow notifications» window: it has the same confirm button and stays up on a
    // PC with notifications off — taken for a new order, it stopped every detail read (found 01-11-2026).
    const newOrderDialog = () => [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('button[data-testid="dialog_confirm_button"]:not([hidden])') && !/notification|إشعار/i.test(d.innerText || '')) || null;
    const drawer = () => T('details-order-id')?.closest('[data-testid*="drawer"], [role="dialog"], aside') || T('order-details-drawer__content') || null;
    // «في الطريق» for one order whose Apex order left with the pilot: open it (a click on its number), press the button
    // with exactly these words, confirm only a dialog that asks about it, close. Anything unexpected: stop and report.
    async function pressOnTheWay(id) {
      // The card's own «في الطريق» button (data-testid seen on the real page 01-11): no need to open the order.
      for (const b of document.querySelectorAll('[data-testid="order-list-item-order-on-its-way-button"]')) {
        let card = b; for (let i = 0; i < 10 && card && !(card.innerText || '').includes(id); i++) card = card.parentElement;
        if (!card || !(card.innerText || '').includes(id) || (card.innerText.match(/(?<!\d)\d{9,12}(?!\d)/g) || []).filter((x, k, a) => a.indexOf(x) === k).length > 1) continue;
        if (b.disabled) return { ok: false, note: 'زرار «في الطريق» مقفول' };
        b.click(); await sleep(1500);
        const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[data-testid="dialog_confirm_button"]') && !/notification|إشعار/i.test(d.innerText || ''));
        if (dlg) { sendUi('onTheWay', dlg); dlg.querySelector('[data-testid="dialog_confirm_button"]').click(); await sleep(1500); return { ok: true, note: 'اتداس «في الطريق» من الكارت واتأكد' }; }
        return { ok: true, note: 'اتداس «في الطريق» من الكارت' };
      }
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let target = null;
      for (let n; (n = w.nextNode());) if (n.nodeValue.includes(id) && !n.parentElement.closest('button,[role="button"] button,a,[data-testid="details-order-id"]')) { target = n.parentElement; break; }
      if (!target || ACTION.test((target.innerText || '').trim())) return { ok: false, note: 'الأوردر مش ظاهر على اللايف' };
      target.click();
      let box = null;
      for (let i = 0; i < 25 && !box; i++) { await sleep(200); box = (T('details-order-id')?.innerText || '').includes(id) ? drawer() || document.body : null; }
      if (!box) return { ok: false, note: 'تفاصيل الأوردر ماتفتحتش' };
      sendUi('accepted', box);
      const btn = [...box.querySelectorAll('button,[role="button"]')].find(b => /^(?:في الطريق|on the way)$/i.test((b.innerText || '').trim()));
      let res;
      if (!btn) res = { ok: false, note: 'زرار «في الطريق» مش موجود' };
      else {
        btn.click(); await sleep(1200);
        const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d !== box && !d.contains(box) && /في الطريق|on the way|تأكيد|confirm/i.test(d.innerText || ''));
        if (dlg) {
          sendUi('onTheWay', dlg);
          const ok = [...dlg.querySelectorAll('button,[role="button"]')].find(b => /^(?:تأكيد|نعم|confirm|yes|في الطريق|on the way)$/i.test((b.innerText || '').trim()));
          if (ok) { ok.click(); await sleep(1200); res = { ok: true, note: 'اتداس «في الطريق» واتأكد' }; }
          else res = { ok: false, note: 'ظهرت رسالة تأكيد مش معروفة — اتبعتت عينتها للإدارة' };
        } else res = { ok: true, note: 'اتداس «في الطريق»' };
      }
      const close = T('close-button') || [...document.querySelectorAll('button,[role="button"]')].find(b => /^(?:close|إغلاق|×|✕)$/i.test((b.getAttribute('aria-label') || b.innerText || '').trim()));
      if (close && !ACTION.test((close.innerText || '').trim())) close.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(400);
      return res;
    }
    let actions = null, actionsAt = 0, lastDiag = {}; const tried = new Map();
    let lastKey = '', lastAt = 0;
    for (;;) {
      try {
        // «Please allow notifications»: close it (English or Arabic), only inside that window.
        for (const d of document.querySelectorAll('[role="dialog"]')) if (/notification|إشعار/i.test(d.innerText || '')) [...d.querySelectorAll('button')].find(b => /^(?:got it|حسنًا|حسنا|فهمت|تمام)$/i.test(b.textContent.trim()))?.click();
        const live = stateOrders();
        // What is on the screen now: the cards shown (the page's memory also keeps orders that already left), with the
        // branch and payment from the page's data.
        const byId = new Map((live || []).map(o => [String(o.externalId), o]));
        const codes = readCodes().map(c => { const o = byId.get(c.id); return o ? { ...c, code: String(o.shortCode || c.code), ...(o.vendorName ? { store: o.vendorName } : {}), ...(o.payment?.paymentType ? { pay: String(o.payment.paymentType).slice(0, 40) } : {}) } : c; });
        const avail = availability();
        const key = JSON.stringify([codes, avail?.map(x => [x.outlet, x.state, JSON.stringify(x.raw)])]);   // a branch closing or opening is sent at once
        // From the page's data: each live order's full details, sent again only when something in it changed.
        if (live) {
          const fresh = [];
          for (const o of live) {
            if (!o.externalId || /CANCEL|REJECT/i.test(o.state || '')) continue;
            const p = fromState(o), sig = JSON.stringify(p);
            if (statePushed.get(p.id) !== sig) fresh.push([p, sig]);
          }
          for (let i = 0; i < fresh.length; i += 20) {
            const part = fresh.slice(i, i + 20), r = await bg({ type: 'TALABAT_PUSH', orders: part.map(x => x[0]), codes: [] }).catch(() => null);
            if (r?.ok) for (const [p, sig] of part) statePushed.set(p.id, sig);
          }
          lastDiag = { ...lastDiag, source: 'page-data', readAt: new Date().toISOString(), readOk: true, readFail: null, readCode: live.length ? String(live[live.length - 1].shortCode || '') : null };
        }
        // Every minute even with no orders: the screen tells admin it is alive (version, last detail read and why it failed).
        if (key !== lastKey || Date.now() - lastAt > 60000) {
          const r = await bg({ type: 'TALABAT_PUSH', orders: [], codes, diag: { live: codes.length, ...lastDiag }, ...(avail ? { availability: avail } : {}) }).catch(() => null);
          if (r?.ok) { lastKey = key; lastAt = Date.now(); }
        }
        // Orders from admin (every 30 s): the branches' delivery times, and the orders to mark «في الطريق».
        if (Date.now() - actionsAt > 30000) { actionsAt = Date.now(); const a = await bg({ type: 'TALABAT_ACTIONS' }).catch(() => null); if (a?.ok) actions = a; }
        const nd = newOrderDialog();
        if (nd) sendUi('new', nd);   // the new-order window: read only (accepting is built once its controls are known)
        else for (const o of actions?.onTheWay || []) {
          if (tried.get(o.id) > Date.now() - 10 * 60000 || !codes.some(c => c.id === o.id)) continue;
          tried.set(o.id, Date.now());
          const r = await pressOnTheWay(o.id);
          await bg({ type: 'TALABAT_ACTION_RESULT', body: { id: o.id, action: 'onTheWay', ok: r.ok, note: r.note } }).catch(() => null);
        }
        // Payment and bill come only from the live screen (Order History shows them a day later): open each live
        // order's details once (a click on its number, never on a button), read, and close. Nothing is changed.
        for (const c of live ? [] : codes) {   // only when the page's data could not be read: open the order (old way)
          if (liveRead.get(c.id) > Date.now() - 10 * 60000 || newOrderDialog()) continue;
          liveRead.set(c.id, Date.now());
          const d = await readLiveDetail(c.id);
          lastDiag = { readAt: new Date().toISOString(), readCode: c.code, readOk: !!d?.detail, readFail: d?.fail || null };
          if (d?.detail) { await bg({ type: 'TALABAT_PUSH', orders: [{ ...d, store: c.store || d.store || undefined }], codes: [] }).catch(() => null); }
          else liveRead.set(c.id, Date.now() - 9 * 60000);   // not read: try again in a minute, not ten
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
    // Order History's window names the order in «details-order-id»; the live window may not: then the order's number on the page will do.
    const shownId = T('details-order-id');
    if (shownId ? (shownId.innerText || '').trim() !== id : !(document.body.innerText || '').includes(id)) return null;
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
      // Talabat keeps every chosen option in the page even while the product is collapsed:
      // [data-testid="existing-option__<option>_for_<product>"] → <p>1×</p><div><p>Quarter Kilo</p></div><p>E£214.00</p>.
      // Reading them from there gives the full list without depending on expanding the product.
      const pid = String(p.dataset.testid || '').replace('existing-product__', '');
      const options = [...p.querySelectorAll('[data-testid^="existing-option__"]')].filter(o => String(o.dataset.testid).endsWith('_for_' + pid)).map(o => {
        const parts = [...o.querySelectorAll('p')].map(x => (x.textContent || '').trim()).filter(Boolean);
        const q = parts.find(x => /^\d+(?:\.\d+)?\s*[x×]$|^[x×]\s*\d+$/i.test(x)), pr = parts.find(x => /(?:E£|EGP|£E|ج\.م)/.test(x));
        // A discount under the dish shows like an add-on with a minus price: keep the sign so it is never taken for a paid add-on.
        const neg = pr && /-\s*(?:E£|EGP|£E|ج\.م)|(?:E£|EGP|£E|ج\.م)\s*-|^-|\u2212/.test(pr);
        return { qty: q ? Number(q.replace(/[^\d.]/g, '')) || null : null, name: parts.filter(x => x !== q && x !== pr).join(' ').slice(0, 120), price: pr ? (neg ? -money(pr) : money(pr)) : null };
      }).filter(o => o.name).slice(0, 20);
      // Discount lines shown under the dish (not as option elements): kept as written, for the transfer page.
      // Seen 31-10 under a dish: «خصم | -89.70», «خصم 30% على بعض المنتجات | -89.70», «ممول من قبلك | -44.85», «ممول من قبل Talabat | -44.85».
      // Each label is kept with its amount (the nearest money line next to it), as «label | amount».
      const isMoney = x => /(?:E£|EGP|£E|ج\.م)/.test(x) && /\d/.test(x) && !/[a-z\u0600-\u06ff]{3,}/i.test(x.replace(/E£|EGP|£E|ج\.م\.?/g, ''));
      const isLabel = x => !isMoney(x) && /discount|voucher|promo|coupon|خصم|قسيمة|كوبون|ممول|funded/i.test(x);
      // Amount after its label (usual) or before it: whichever fits more labels on this dish.
      const after = raw.filter((x, i) => isLabel(x) && raw[i + 1] && isMoney(raw[i + 1])).length, before = raw.filter((x, i) => isLabel(x) && raw[i - 1] && isMoney(raw[i - 1])).length;
      const near = before > after ? [-1, 1] : [1, -1];
      const used = new Set(), discountLines = [];
      raw.forEach((x, i) => {
        if (!isLabel(x)) return;
        const j = near.map(d => i + d).find(k => raw[k] && isMoney(raw[k]) && !used.has(k));
        if (j != null) used.add(j);
        if (discountLines.length < 8) discountLines.push(x.slice(0, 80) + (j != null ? ' | ' + raw[j] : ''));
      });
      // Every product row is itself a button (aria-expanded="false"), so «something to expand» means the expand icon.
      // Checked on the real page 2026-10-31: plain products have no icon and no option elements.
      const hasExpandIcon = /\b(?:expand_more|expand_less|keyboard_arrow_down|keyboard_arrow_up)\b/i.test(p.textContent || '');
      const fromOptions = options.length > 0 || !hasExpandIcon;   // options found, or nothing to expand: the list is complete
      const modifierComplete = fromOptions || (productModifierExpanded(control) && !iconStillCollapsed);
      const mods = fromOptions ? options.map(o => (o.qty == null ? '?' : o.qty) + '× ' + o.name) : modifiers;   // the count as Talabat shows it (all the dishes together)
      d.items.push({ qty: Number((l[0] || '').replace(/[^\d]/g, '')) || 1, name, price: money(l.find(x => /E£|EGP/.test(x))), modifiers: [...new Set(mods)],
        options, discountLines, modifierRead: mods.length > 0 || modifierComplete, modifierComplete });
    }
    // The list time has seconds (placedAt); the timeline only minutes. Received = placed, accepted = received + "Accepted in".
    if (d.receivedAt && Number.isFinite(placed) && Math.abs(Date.parse(d.receivedAt) - Math.floor(placed / 60000) * 60000) < 60000) d.receivedAt = new Date(placed).toISOString();
    if (d.receivedAt && Number.isFinite(d.acceptSeconds)) d.acceptedAt = new Date(Date.parse(d.receivedAt) + d.acceptSeconds * 1000).toISOString();
    d.subtotal = money(lines(T('subtotal')).find(x => /E£|EGP/.test(x)));
    // Matching never depends on the WhatsApp setting. Read explicit customer labels only;
    // do not guess a name/address from arbitrary order text or a masked phone number.
    let box = T('details-order-id'); while (box && !box.querySelector('[data-testid^="milestone-for__"]')) box = box.parentElement;
    // The live order screen has no timeline: use the order drawer itself.
    if (!box) box = T('details-order-id')?.closest('[data-testid*="drawer"], [role="dialog"], aside') || T('order-details-drawer__content') || null;
    const customerLines = lines(box).filter(Boolean);
    const customerHeading = /^(?:customer details|customer information|customer|تفاصيل الزبون|تفاصيل العميل|العميل)$/i;
    const sectionEnd = /^(?:order timeline|timeline|order details|تفاصيل الطلب|الجدول الزمني للطلب)$/i;
    // Section words that can come on their own line («Customer» / «information») are never a name or an address.
    const iconLine = /^(?:info|person(?:_outline)?|location_on|place|call(?:_outgoing)?|phone|check_circle|expand_more|customer|information|details|العميل|معلومات|تفاصيل|pro)$/i;
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
    // Floor and flat are their own lines on the live screen («الطابق: الأول»، «الشقة: 1»); keep them with the address.
    const extra = [];
    for (const [re, label] of [[/^(?:الطابق|الدور|floor)\s*[:：]?\s*(.+)$/i, 'الدور'], [/^(?:الشقة|شقة|apartment|flat|apt\.?)\s*[:：]?\s*(.+)$/i, 'الشقة'], [/^(?:العمارة|المبنى|building)\s*[:：]?\s*(.+)$/i, 'العمارة']]) {
      const hit = [...sectionLines, ...customerLines].map(x => String(x).match(re)).find(Boolean);
      if (hit && !new RegExp(label + '\\s*[:：]').test(address)) extra.push(label + ': ' + hit[1].trim());
    }
    if (extra.length) address = (address ? address + ' — ' : '') + extra.join('، ');
    d.customer = { name: name.slice(0, 160), address: address.slice(0, 360), phone: phone || '' };
    d.deliveryType = lines(T('prop-delivery-type'))[1] || null;
    // The bill and payment exactly as this order shows them: label → value pairs from «Subtotal» on
    // (e.g. «Payment method» → «Online»). Nothing is interpreted here. Talabat shows the payment method and
    // discounts only once its billing data is ready (usually later); until then these lines are absent.
    const content = lines(box).map(x => x.trim()).filter(x => x && !/^(?:expand_more|expand_less|info|info_outline|help_outline)$/i.test(x));
    const subAt = content.findIndex(x => /^(?:subtotal|المجموع الفرعي)$/i.test(x));
    // Lines of the live screen that stand alone (no amount next to them): the payment way, e.g. «ONLINE», «تم الدفع بواسطة CREDIT_CARD».
    d.bill = [];
    if (subAt >= 0) for (let i = subAt; i < content.length && d.bill.length < 24; ) {
      const x = content[i], y = content[i + 1];
      if (/^(?:ONLINE|CASH|CREDIT_CARD|DEBIT_CARD|WALLET|كاش|نقدي|نقدا|الدفع عند الاستلام)$/i.test(x) || /^تم الدفع بواسطة/.test(x)) { d.bill.push({ k: 'payment', text: x.slice(0, 200) }); i += 1; continue; }
      if (y == null) break;
      d.bill.push({ k: x.slice(0, 60), text: (x + ' | ' + y).slice(0, 200) }); i += 2;
    }
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
    if (typeof expandProductModifiers === 'function') await expandProductModifiers(id);
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
