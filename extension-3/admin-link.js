'use strict';
// Runs on the admin page only. When a signed-in supervisor presses «ربط هذا الجهاز كموصل», the page passes the
// collector credentials it just received from the server; this hands them to the extension on this PC.
(() => {
  if (!globalThis.MARSAD.ADMIN_ORIGINS.includes(location.origin)) return;
  window.addEventListener('message', async e => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== 'MARSAD_ADMIN') return;
    let reply;
    try {
      if (e.data.type === 'LINK_COLLECTOR') reply = await browser.runtime.sendMessage({ type: 'COLLECTOR_LINK', token: e.data.token, refreshToken: e.data.refreshToken });
      else if (e.data.type === 'COLLECTOR_STATUS') reply = await browser.runtime.sendMessage({ type: 'COLLECTOR_STATUS' });
      else if (e.data.type === 'LINK_TALABAT') reply = await browser.runtime.sendMessage({ type: 'TALABAT_LINK', token: e.data.token });
      else if (e.data.type === 'TALABAT_STATUS') reply = await browser.runtime.sendMessage({ type: 'TALABAT_STATUS' });
      else if (e.data.type === 'TALABAT_UNLINK') reply = await browser.runtime.sendMessage({ type: 'TALABAT_UNLINK' });
      else return;
    } catch (err) { reply = { ok: false, error: err.message }; }
    window.postMessage({ source: 'MARSAD_EXTENSION', request: e.data.request, reply }, location.origin);
  });
  window.postMessage({ source: 'MARSAD_EXTENSION', present: true, version: globalThis.MARSAD.VERSION }, location.origin);
})();
