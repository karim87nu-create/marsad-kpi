// The website's central panel / branch boards: passes what the panel itself loaded to the Marsad (through background.js).
// Nothing is clicked or requested on the website.
(() => {
  const s = document.createElement('script');
  s.src = browser.runtime.getURL('site-hook.js'); s.onload = () => s.remove();
  (document.head || document.documentElement).append(s);
  const board = /eldahan-operations-central/.test(location.pathname) ? 'central' : 'branch';
  let last = '', lastAt = 0;
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__marsadSite !== 1 || !Array.isArray(e.data.data?.orders)) return;
    const orders = e.data.data.orders.slice(0, 300);
    const key = JSON.stringify(orders.map(o => [o.id, o.stage, o.status, o.branchId, o.lastActionAt, o.driver?.name || null, o.total]));
    const now = Date.now();
    // Every change at once; the same picture again at most once a minute (so delivered = gone from the board stays fresh).
    if (key === last && now - lastAt < 60000) return;
    last = key; lastAt = now;
    browser.runtime.sendMessage({ type: 'SITE_PANEL', board, orders, serverTime: e.data.data.serverTime || null }).catch(() => {});
  });
})();
