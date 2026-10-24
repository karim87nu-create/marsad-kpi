// On the Arabicss report pages: puts the listening hook in the page and hands the live report it sees to the
// background, which forwards it to the server when this PC is the linked collector.
(() => {
  if (window.__marsadReportBridge) return;
  window.__marsadReportBridge = true;
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== 'MARSAD_LIVE_REPORT' || typeof e.data.html !== 'string') return;
    browser.runtime.sendMessage({ type: 'NATIVE_LIVE', html: e.data.html }).catch(() => {});
  });
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('report-hook.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).append(script);
})();
