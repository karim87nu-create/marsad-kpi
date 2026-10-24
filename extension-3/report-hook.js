// Runs inside the Arabicss live report page. It only listens: when the report refreshes itself, the answer it
// received is passed on. It never sends, delays, repeats or changes a request.
(() => {
  if (window.__marsadReportHook) return;
  window.__marsadReportHook = true;
  const LIVE = /\/get_inbound_calls_real_time\.php$/i;
  const live = url => { try { const u = new URL(url, location.href); return u.origin === location.origin && LIVE.test(u.pathname); } catch { return false; } };
  const XHR = window.XMLHttpRequest;
  if (!XHR) return;
  const open = XHR.prototype.open, send = XHR.prototype.send;
  XHR.prototype.open = function (method, url, ...rest) { this.__marsadLive = live(url); return open.call(this, method, url, ...rest); };
  XHR.prototype.send = function (...args) {
    if (this.__marsadLive) this.addEventListener('load', () => {
      try {
        if (this.status >= 200 && this.status < 300 && (!this.responseType || this.responseType === 'text') && this.responseText.length <= 1000000)
          window.postMessage({ source: 'MARSAD_LIVE_REPORT', html: this.responseText }, location.origin);
      } catch {}
    }, { once: true });
    return send.apply(this, args);
  };
})();
