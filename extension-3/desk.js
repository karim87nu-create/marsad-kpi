'use strict';
// طلبات والموقع: a full-screen sign-in over the Talabat Partner Hub and the website admin, with the employee's desk
// password (one per desk). On Talabat's Live Orders screen it also reports which orders are in which column, so the
// server knows how fast each order was accepted and on whose screen. Only order numbers and columns are read.
(() => {
  if (window.__marsadDesk || window.top !== window) return;
  const host = location.hostname;
  const desk = host === 'partner-app.talabat.com' ? 'talabat' : /(^|\.)eldahan\.com\.eg$/.test(host) && location.pathname.startsWith('/wp-admin') ? 'site' : null;
  if (!desk) return;
  window.__marsadDesk = true;
  const DESK_NAME = { talabat: 'طلبات', site: 'الموقع' }[desk];
  const bg = m => browser.runtime.sendMessage({ ...m, desk });
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  // Which login this browser is on (each browser / profile has one branch account); shown to the admin as the place.
  const account = () => { try { return (localStorage.getItem('lastLoginEmail') || '').replace(/^"|"$/g, '') || null; } catch { return null; } };
  const place = () => desk === 'talabat' ? (account() || 'طلبات') : 'الموقع';

  let who = null;
  async function check() { try { who = await bg({ type: 'DESK_WHO' }); } catch { who = null; } render(); }

  function render() {
    if (!document.body) return;
    const gate = document.getElementById('marsad-desk-gate'), chip = document.getElementById('marsad-desk-chip');
    if (!who) {
      chip?.remove();
      if (gate) return;
      const pin = el('input', { type: 'password', inputMode: 'numeric', autocomplete: 'off', placeholder: 'باسورد ' + DESK_NAME });
      const go = el('button', { type: 'submit', textContent: 'دخول' }), err = el('p', { className: 'error', role: 'status' });
      const form = el('form', {}, el('h2', { textContent: 'مرصد الدهان — ' + DESK_NAME }), el('p', { textContent: 'اكتب باسورد ' + DESK_NAME + ' بتاعك عشان الشغل على الشاشة دي يتسجل باسمك.' }), pin, go, err);
      form.onsubmit = async e => {
        e.preventDefault(); e.stopPropagation();
        if (!/^\d+$/.test(pin.value)) { err.textContent = 'الباسورد أرقام بس'; return; }
        go.disabled = true; err.textContent = 'جارٍ التحقق…';
        try { const r = await bg({ type: 'DESK_LOGIN', pin: pin.value, place: place() }); if (!r?.ok) throw Error(r?.error || 'تعذر الدخول'); who = r.who; pin.value = ''; render(); report(true); }
        catch (x) { err.textContent = x.message; } finally { go.disabled = false; }
      };
      // The page under the gate can't be used: keys and clicks stop at the gate.
      const g = el('div', { id: 'marsad-desk-gate', dir: 'rtl' }, form);
      for (const t of ['keydown', 'keyup', 'keypress']) g.addEventListener(t, e => e.stopPropagation());
      document.documentElement.append(g);
      setTimeout(() => pin.focus(), 50);
      return;
    }
    gate?.remove();
    if (!chip) {
      const out = el('button', { type: 'button', textContent: 'خروج' });
      out.onclick = async () => { if (!confirm('تسجيل خروج من ' + DESK_NAME + '؟')) return; await bg({ type: 'DESK_LOGOUT' }).catch(() => {}); who = null; render(); };
      document.documentElement.append(el('div', { id: 'marsad-desk-chip', dir: 'rtl' }, el('span', { textContent: DESK_NAME + ' · ' }), el('strong', { textContent: who.name }), out));
    }
  }
  // Pages re-draw themselves: keep the gate on top and in place.
  new MutationObserver(() => { if (!who && !document.getElementById('marsad-desk-gate')) render(); }).observe(document.documentElement, { childList: true });

  // ---------- Talabat Live Orders: which order is in which column ----------
  const COL = [[/^(new|جديد(ة)?)$/i, 'new'], [/^(accepted|مقبول(ة)?|تم القبول)$/i, 'accepted'], [/^(ready|جاهز(ة)?)$/i, 'ready']];
  function readLive() {
    if (desk !== 'talabat' || !/^\/live-orders/.test(location.pathname)) return null;
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].map(e => ({ e, c: COL.find(([re]) => re.test(e.textContent.trim()))?.[1] })).filter(x => x.c);
    const ids = [], walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) { const t = n.nodeValue.trim(); if (/^\d{9,12}$/.test(t) && !n.parentElement.closest('#marsad-desk-gate,#marsad-desk-chip')) ids.push(n); }
    const out = new Map();
    for (const n of ids) {
      let column = null;
      for (const hd of heads) if (hd.e.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) column = hd.c;
      if (!column) continue;
      // The card: the closest box around the number that also holds the short "#code".
      const codeIn = e => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let x; (x = w.nextNode());) { const m = x.nodeValue.trim().match(/^#\s*(\d{2,6})$/); if (m) return m[1]; } return ''; };
      let card = n.parentElement, code = '';
      for (let i = 0; i < 6 && card && !(code = codeIn(card)); i++) card = card.parentElement;
      out.set(n.nodeValue.trim(), { id: n.nodeValue.trim(), code, column });
    }
    return [...out.values()];
  }
  let lastKey = '', lastSent = 0;
  async function report(force = false) {
    if (!who || desk !== 'talabat') return;
    const orders = readLive();
    if (!orders) return;
    const key = JSON.stringify(orders);
    if (!force && key === lastKey && Date.now() - lastSent < 30000) return;
    lastKey = key; lastSent = Date.now();
    const r = await bg({ type: 'DESK_TALABAT', account: account(), orders }).catch(() => null);
    if (r?.signedOut) { who = null; render(); }
  }
  setInterval(() => report().catch(() => {}), 3000);
  // The session stays alive while the screen is open; a closed browser ends it (the background keeps it in memory only).
  setInterval(async () => { if (!who) return; const r = await bg({ type: 'DESK_BEAT', place: place() }).catch(() => null); if (r?.signedOut) { who = null; render(); } }, 60000);

  if (document.body) check(); else document.addEventListener('DOMContentLoaded', check, { once: true });
})();
