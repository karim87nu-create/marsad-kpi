(() => {
  if (location.origin !== 'https://marsad-kpi-live.karim87nu.chatgpt.site' || !/^\/admin(?:\/|$)/.test(location.pathname)) return;

  let sentSession = '';
  let sending = false;
  let retryAt = 0;

  async function connect() {
    if (sending || Date.now() < retryAt) return;
    let token = '';
    try { token = sessionStorage.getItem('adminPassword') || ''; } catch { return; }
    if (!token || token === sentSession) return;

    sending = true;
    try {
      const result = await browser.runtime.sendMessage({ type: 'COLLECTOR_ADMIN_SESSION', token });
      if (result?.ok) sentSession = token;
      else retryAt = Date.now() + 30000;
    } catch {
      retryAt = Date.now() + 30000;
    } finally {
      sending = false;
    }
  }

  connect();
  setInterval(connect, 3000);
})();
