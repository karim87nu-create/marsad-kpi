(() => {
  if (location.origin !== 'https://marsad-kpi-live.karim87nu.chatgpt.site' || !/^\/admin(?:\/|$)/.test(location.pathname)) return;
  if (window.__marsadCollectorBridge) return;
  window.__marsadCollectorBridge = true;

  let sentSession = '';
  let checkedAt = 0;
  let sending = false;
  let retryAt = 0;

  async function connect(resume = false) {
    if (sending || !resume && Date.now() < retryAt) return { ok: false, pending: true };
    let token = '';
    try { token = sessionStorage.getItem('adminPassword') || ''; } catch { return; }
    if (!token) return { ok: false, error: 'admin_login_required' };
    if (!resume && token === sentSession && Date.now() - checkedAt < 30000) return;

    sending = true;
    try {
      const result = await browser.runtime.sendMessage({ type: 'COLLECTOR_ADMIN_SESSION', token, resume });
      if (result?.ok) { sentSession = token; checkedAt = Date.now(); retryAt = 0; }
      else retryAt = Date.now() + 30000;
      return result;
    } catch {
      retryAt = Date.now() + 30000;
      return { ok: false, error: 'collector_connection_failed' };
    } finally {
      sending = false;
    }
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'COLLECTOR_RESUME_ADMIN' || sender.id !== browser.runtime.id) return;
    return connect(true);
  });
  connect();
  let timer = setInterval(connect, 3000);
  window.addEventListener('pagehide', () => { clearInterval(timer); timer = null; });
  window.addEventListener('pageshow', () => { if (timer === null) { connect(); timer = setInterval(connect, 3000); } });
})();
