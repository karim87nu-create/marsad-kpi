// Runs inside the website's central panel page (eldahan.com.eg). It never sends anything to the website: it only copies
// the answer of the panel's own refresh (/wp-json/eldahan-ops/v1/orders) and hands it to site-panel.js.
(() => {
  if (window.__marsadSiteHook) return; window.__marsadSiteHook = true;
  const WANT = /\/wp-json\/eldahan-ops\/v1\/orders\b/;
  const hand = (url, text) => { try { const data = JSON.parse(text); if (data && Array.isArray(data.orders)) window.postMessage({ __marsadSite: 1, url: String(url), data }, location.origin); } catch {} };
  const of = window.fetch;
  if (typeof of === 'function') window.fetch = function (...a) {
    const p = of.apply(this, a);
    try { const u = String(a[0]?.url || a[0] || ''); if (WANT.test(u)) p.then(r => r.clone().text().then(t => hand(u, t))).catch(() => {}); } catch {}
    return p;
  };
  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__marsadUrl = u; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    if (WANT.test(String(this.__marsadUrl || ''))) this.addEventListener('load', () => { try { if (!this.responseType || this.responseType === 'text') hand(this.__marsadUrl, this.responseText); } catch {} });
    return send.apply(this, arguments);
  };
})();
