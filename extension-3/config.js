// One place for the connector's settings. API is set to the new server's address at cutover.
globalThis.MARSAD = Object.freeze({
  API: 'https://marsad-v2.karim87nu.chatgpt.site',
  DEVICE_TOKEN: '7000865f1220458f86506b41a97cab7d',
  VERSION: (() => { try { return browser.runtime.getManifest().version; } catch { return '3.1.44'; } })(),   // 11-15: was fixed at 3.1.38
  ARABICSS_HOST: '41.38.207.218',
  ADMIN_ORIGINS: ['https://karim87nu-create.github.io', 'https://marsad-v2.karim87nu.chatgpt.site'],
  // Karim 11-17 (the move to Cloudflare): the server's address can be switched for every PC at once from
  // server.json on the GitHub page; only these addresses are ever followed.
  SWITCH_URL: 'https://karim87nu-create.github.io/marsad-kpi/server.json',
  isServer: u => { try { const x = new URL(u); return x.protocol === 'https:' && !x.port && (x.pathname === '/' || x.pathname === '') && (x.hostname === 'marsad-v2.karim87nu.chatgpt.site' || /^marsad\.[a-z0-9-]+\.workers\.dev$/.test(x.hostname)); } catch { return false; } },
  REPORTS_ROOT: 'https://41.38.207.218:11594/themes/arabicssReportsInclude/dark/',
});
