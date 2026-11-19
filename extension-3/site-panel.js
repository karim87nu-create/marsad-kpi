// The website's central panel / branch boards: passes what the panel itself loaded to the Marsad (through background.js).
// No request of its own ever goes to the website. The one action: an order the Marsad already wrote on Apex that is still
// without a branch on the central panel is sent to that branch with the panel's own «إرسال للفرع» (Karim 11-11).
(() => {
  // Put back after an update (background.js): never two copies in one page (two «إرسال للفرع» presses).
  if (window.__marsadSitePanel === globalThis.MARSAD?.VERSION) return; window.__marsadSitePanel = globalThis.MARSAD?.VERSION;
  const s = document.createElement('script');
  s.src = browser.runtime.getURL('site-hook.js'); s.onload = () => s.remove();
  (document.head || document.documentElement).append(s);
  const board = /eldahan-operations-central/.test(location.pathname) ? 'central' : 'branch';
  let last = '', lastAt = 0, seenAt = Date.now(), assignedAt = 0, reloadAt = Date.now();
  // Each order at most 3 tries, 90 s apart; never when the panel shows it already has a branch.
  const tries = new Map();
  const assign = (a, orders) => {
    const id = Number(a.orderId), o = orders.find(x => Number(x.id) === id);
    if (!o || o.branchId) return;
    const t = tries.get(id) || { n: 0, at: 0 }, now = Date.now();
    if (t.n >= 3 || now - t.at < 90000) return;
    const select = document.querySelector('[data-branch-select="' + id + '"]');
    const button = document.querySelector('button[data-action="assign"][data-order="' + id + '"]');
    if (!select || !button || button.disabled || ![...select.options].some(x => x.value === a.branchId)) return;
    tries.set(id, { n: t.n + 1, at: now });
    select.value = a.branchId;
    select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true }));
    // The panel may redraw on «change»: press the button that is on the page now, with the branch still picked.
    const s2 = document.querySelector('[data-branch-select="' + id + '"]'), b2 = document.querySelector('button[data-action="assign"][data-order="' + id + '"]');
    if (s2 && b2 && !b2.disabled) { if (s2.value !== a.branchId) s2.value = a.branchId; assignedAt = Date.now(); b2.click(); }
  };
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__marsadSite !== 1 || !Array.isArray(e.data.data?.orders)) return;
    seenAt = Date.now();
    const orders = e.data.data.orders.slice(0, 300);
    const key = JSON.stringify(orders.map(o => [o.id, o.stage, o.status, o.branchId, o.lastActionAt, o.driver?.name || null, o.total]));
    const now = Date.now();
    // Every change at once; the same picture again at most once a minute (so delivered = gone from the board stays fresh).
    if (key === last && now - lastAt < 60000) return;
    last = key; lastAt = now;
    // Karim 11-19 «اوردرات الويب سايت بتتأخر … وساعات مش بتظهر»: a picture the Marsad did not take (server busy) used
    // to count as sent, so the same orders waited a minute or more. Now it is sent again with the panel's next refresh.
    const forget = () => { if (last === key) { last = ''; lastAt = 0; } };
    browser.runtime.sendMessage({ type: 'SITE_PANEL', board, orders, serverTime: e.data.data.serverTime || null })
      .then(r => { if (!r?.ok) return forget(); if (board === 'central' && Array.isArray(r.assign)) r.assign.forEach(a => assign(a, orders)); }).catch(forget);
  });
  // Karim 11-19 «الويب سايت عمل بلوك للاي بي بتاع الشبكه»: the keep-alive pressed «تحديث الآن» every 10 s and reloaded every
  // 2 minutes whenever no list came — on every branch board too, and harder once the site refused. Now: the central panel
  // only; at most one press a minute and one reload every 15 minutes; and nothing at all for 20 minutes after the site
  // refuses (an error answer), so the extension never adds to what the panel itself asks.
  let quietUntil = 0, pressedAt = 0;
  window.addEventListener('message', e => { if (e.source === window && e.data && e.data.__marsadSiteStatus != null) quietUntil = Date.now() + 20 * 60000; });
  if (board === 'central') setInterval(() => {
    const now = Date.now(), quiet = now - seenAt;
    if (now < quietUntil || quiet < 60000 || now - assignedAt < 10000 || now - pressedAt < 60000) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.matches?.('select,input,textarea,[contenteditable="true"]')) return;
    if (document.querySelector('[role="dialog"]:not([hidden]),.eldahan-ops-modal.show,dialog[open]')) return;
    if (quiet > 5 * 60000 && now - reloadAt > 15 * 60000) { reloadAt = now; location.reload(); return; }
    const btn = [...document.querySelectorAll('button[data-action="refresh"]')].find(b => !b.disabled);
    if (btn) { pressedAt = now; btn.click(); }
  }, 10000);
})();
