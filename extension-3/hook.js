// Runs inside the Arabicss page. It only listens: it never sends, delays or changes Arabicss requests.
// It relays the agent stream's events and, once a second, a snapshot of the console state.
(() => {
  if (window.__marsadHook) return;
  window.__marsadHook = true;
  const post = (type, data) => window.postMessage({ source: 'MARSAD_HOOK', type, data: JSON.stringify(data) }, location.origin);
  const AGENT = /^(agentlinked|agentunlinked|breakenter|breakexit|agentloggedin|agentloggedout|logged-out)$/i;
  const watched = new WeakSet();

  function watch(es) {
    if (!es || watched.has(es) || typeof es.addEventListener !== 'function') return;
    watched.add(es);
    es.addEventListener('message', e => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      if (!data || typeof data !== 'object') return;
      const records = typeof data.event === 'string' ? [data] : Object.values(data);
      for (const r of records) if (r && typeof r.event === 'string' && AGENT.test(r.event)) post('event', { ...r, event: r.event.toLowerCase() });
    });
  }
  const Native = window.EventSource;
  if (Native) {
    const Wrapped = function (...args) { const es = new Native(...args); watch(es); return es; };
    Object.setPrototypeOf(Wrapped, Native);
    Wrapped.prototype = Native.prototype;
    window.EventSource = Wrapped;
  }

  setInterval(() => {
    watch(window.evtSource);
    const s = window.estadoCliente, title = document.querySelector('#issabel-callcenter-titulo-consola');
    if (!s || !title) return post('snapshot', { console: false });
    const es = window.evtSource;
    post('snapshot', {
      console: true,
      extension: (title.textContent.match(/(?:SIP|IAX2|PJSIP)\/(\d+)/i) || [])[1] || '',
      connection: !es ? 'unknown' : es.readyState === 1 ? 'connected' : es.readyState === 2 ? 'disconnected' : 'connecting',
      breakId: s.break_id ?? null, callId: s.callid ? String(s.callid) : '', callType: s.calltype || '',
      waiting: !!s.waitingcall, onHold: !!s.onhold,
      timer: document.querySelector('#issabel-callcenter-cronometro')?.textContent?.trim() || '',
    });
  }, 1000);
})();
